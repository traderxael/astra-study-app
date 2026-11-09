/**
 * Proveedor de IA abstraido (Task 5).
 *
 * Unica puerta al modelo: OpenAI `gpt-4o-mini` via `fetch` (sin SDK en
 * deps). La clave vive SOLO en servidor (`process.env.OPENAI_API_KEY`,
 * leida en cada llamada) y nunca se copia a headers de respuesta ni a
 * errores. El streaming de la API (SSE) se convierte a un
 * `ReadableStream<Uint8Array>` de texto plano para que tutor.ts y las
 * rutas no conozcan el formato del proveedor. Solo servidor.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const AI_MODEL = "gpt-4o-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

/** Falta la clave: las rutas responden 503 { error: 'IA no configurada' }. */
export class AiNotConfiguredError extends Error {
  constructor() {
    super("IA no configurada");
    this.name = "AiNotConfiguredError";
  }
}

/** Rate-limit (429) del proveedor: las rutas responden 503 degradado. */
export class AiRateLimitError extends Error {
  constructor() {
    super("IA no disponible");
    this.name = "AiRateLimitError";
  }
}

/** Cualquier otro fallo del proveedor: las rutas responden 503 degradado. */
export class AiUpstreamError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AiUpstreamError";
    this.status = status;
  }
}

/** true si hay clave de IA configurada en el entorno del servidor. */
export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new AiNotConfiguredError();
  return key;
}

function baseUrl(): string {
  return (process.env.OPENAI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
  );
}

function parseSseLine(line: string): string | null {
  if (!line.startsWith("data:")) return null;
  const data = line.slice("data:".length).trim();
  if (data === "[DONE]" || data === "") return null;
  try {
    const json = JSON.parse(data) as {
      choices?: Array<{
        delta?: { content?: string };
        message?: { content?: string };
      }>;
    };
    const choice = json.choices?.[0];
    const content = choice?.delta?.content ?? choice?.message?.content;
    return typeof content === "string" ? content : null;
  } catch {
    return null;
  }
}

/**
 * Complecion de chat en streaming (gpt-4o-mini).
 *
 * Lanza AiNotConfiguredError sin clave, AiRateLimitError ante 429 y
 * AiUpstreamError ante cualquier otro fallo. Devuelve el texto del modelo
 * como ReadableStream<Uint8Array>.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: { signal?: AbortSignal },
): Promise<ReadableStream<Uint8Array>> {
  const apiKey = getApiKey();

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        stream: true,
        temperature: 0.2,
      }),
      signal: options?.signal,
    });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) throw err;
    throw new AiUpstreamError("no se pudo contactar la IA");
  }

  if (upstream.status === 429) throw new AiRateLimitError();
  if (!upstream.ok) {
    throw new AiUpstreamError(
      `la IA respondió con estado ${upstream.status}`,
      upstream.status,
    );
  }

  // Fallback no-streaming: algunos proxies responden JSON plano.
  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = (await upstream.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    return new ReadableStream<Uint8Array>({
      start(controller) {
        if (text) controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    });
  }

  if (!upstream.body) {
    throw new AiUpstreamError("la IA respondió sin cuerpo");
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  // `start` async: lee el SSE completo y emite cada delta como chunk.
  // v1 ignora backpressure (respuestas cortas); cancel() propaga al reader.
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const delta = parseSseLine(line.trim());
            if (delta) controller.enqueue(encoder.encode(delta));
          }
        }
        const tail = parseSseLine(buffer.trim());
        if (tail) controller.enqueue(encoder.encode(tail));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      return reader.cancel().then(() => undefined);
    },
  });
}
