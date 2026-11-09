/**
 * POST /api/chat — tutor con persistencia (Tasks 5-6, fix round 1).
 *
 * Firma preservada (R-03): POST { subjectId, message } ->
 * { answer, citations[{ chunkId, chunkIndex, fileId, snippet? }] }.
 * Extensiones opcionales sin romperla: `fileId` (alcance a un archivo,
 * verificado propio) y `stream: true` (SSE token -> done con citas).
 *
 * Orden de respuestas (Review Focus 3):
 * - 503 { error: 'IA no configurada' } sin clave (nunca expone la clave).
 * - 503 { error: 'IA no disponible' } ante rate-limit / fallo proveedor.
 * - 404 si la materia (o el archivo) no existe o es de otro dueño.
 *   400 ante body inválido.
 *
 * Persistencia (única vía de progreso por chat — el cliente NO debe
 * POSTear /api/progress por chat): Conversation reutilizada/creada,
 * Message user+assistant y ProgressEvent type 'chat' con las citas
 * COMPLETAS (fileId/chunkId/chunkIndex/snippet) en payload, ya que
 * Message no tiene columna de citas (schema Task 3). Esas citas son
 * las que GET /api/chat?subjectId= devuelve para rehidratar el UI.
 * Fallos de persistencia se loguean (console.error) y no rompen el 200.
 */
import { requireSession } from "../../../lib/auth-guard";
import { prisma } from "../../../lib/db";
import { isAiConfigured, AiNotConfiguredError, AiRateLimitError, AiUpstreamError } from "../../../lib/ai/provider";
import { askTutor, askTutorStream } from "../../../lib/ai/tutor";
import type { Citation } from "../../../lib/ai/tutor";

export type ChatCitation = Citation & { snippet?: string };

/**
 * Enriquece citas con snippet (primeros 240 chars del chunk), acotado
 * por userId (finding 8: nunca exponer chunks de otro dueño por id).
 * Sin filas (mocks antiguos) devuelve las citas tal cual.
 */
async function withSnippets(citations: Citation[], userId: string): Promise<ChatCitation[]> {
  if (!citations.length) return citations;
  try {
    const ids = citations.map((c) => c.chunkId);
    const rows = await prisma.chunk.findMany({
      where: { id: { in: ids }, userId } as never,
    });
    if (!rows || rows.length === 0) return citations;
    const byId = new Map(rows.map((r) => [r.id, r.content]));
    return citations.map((c) => {
      const content = byId.get(c.chunkId);
      return content ? { ...c, snippet: content.slice(0, 240) } : c;
    });
  } catch (err) {
    console.error("withSnippets failed", err);
    return citations;
  }
}

/**
 * Persiste Conversation + Message user/assistant + ProgressEvent 'chat'
 * con citas completas. Los dos Message y el ProgressEvent van en
 * transacción si el cliente la expone; si no, secuencial. Errores se
 * loguean (no silenciosos) y nunca rompen la respuesta del tutor.
 */
async function persistChat(
  userId: string,
  subjectId: string,
  message: string,
  answer: string,
  citations: ChatCitation[],
): Promise<void> {
  try {
    const db = prisma as unknown as {
      conversation?: {
        findFirst: (a: unknown) => Promise<{ id: string } | null>;
        create: (a: unknown) => Promise<{ id: string }>;
      };
      message?: { create: (a: unknown) => Promise<unknown> };
      progressEvent?: { create: (a: unknown) => Promise<unknown> };
      $transaction?: (ops: unknown[]) => Promise<unknown[]>;
    };
    if (!db.conversation || !db.message || !db.progressEvent) {
      console.error("persistChat: modelos de persistencia no disponibles");
      return;
    }

    const existing = await db.conversation.findFirst({
      where: { userId, subjectId },
      orderBy: { updatedAt: "desc" },
    });
    const conversation =
      existing ??
      (await db.conversation.create({
        data: { userId, subjectId, title: message.trim().slice(0, 60) },
      }));

    const ops = [
      db.message.create({
        data: { conversationId: conversation.id, role: "user", content: message },
      }),
      db.message.create({
        data: { conversationId: conversation.id, role: "assistant", content: answer },
      }),
      db.progressEvent.create({
        data: {
          userId,
          subjectId,
          type: "chat",
          payload: {
            // Citas completas (finding 6): Message no tiene columna de
            // citas, así que el payload es la copia recuperable por UI.
            citations: citations.map((c) => ({
              chunkId: c.chunkId,
              chunkIndex: c.chunkIndex,
              fileId: c.fileId,
              ...(c.snippet ? { snippet: c.snippet } : {}),
            })),
          },
        },
      }),
    ];
    if (typeof db.$transaction === "function") {
      await db.$transaction(ops);
    } else {
      for (const op of ops) await op;
    }
  } catch (err) {
    console.error("persistChat failed", err);
  }
}

function errorResponse(err: unknown): Response | null {
  if (err instanceof AiNotConfiguredError) {
    return Response.json({ error: "IA no configurada" }, { status: 503 });
  }
  if (err instanceof AiRateLimitError || err instanceof AiUpstreamError) {
    return Response.json({ error: "IA no disponible" }, { status: 503 });
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  const session = await requireSession();
  const userId = session.user!.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { subjectId, message, fileId, stream } = (body ?? {}) as {
    subjectId?: unknown;
    message?: unknown;
    fileId?: unknown;
    stream?: unknown;
  };
  if (typeof subjectId !== "string" || !subjectId.trim() ||
      typeof message !== "string" || !message.trim()) {
    return Response.json(
      { error: "falta subjectId o message" },
      { status: 400 },
    );
  }
  if (fileId !== undefined && (typeof fileId !== "string" || !fileId.trim())) {
    return Response.json({ error: "fileId inválido" }, { status: 400 });
  }

  if (!isAiConfigured()) {
    return Response.json({ error: "IA no configurada" }, { status: 503 });
  }

  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!subject || subject.userId !== userId) {
    return Response.json({ error: "materia no encontrada" }, { status: 404 });
  }

  if (typeof fileId === "string" && fileId.trim()) {
    // Alcance a un archivo: debe ser propio y de esta materia.
    try {
      const fileModel = (prisma as unknown as {
        file?: { findUnique: (a: unknown) => Promise<{ userId: string; subjectId: string } | null> };
      }).file;
      if (fileModel) {
        const file = await fileModel.findUnique({ where: { id: fileId.trim() } });
        if (!file || file.userId !== userId || file.subjectId !== subjectId) {
          return Response.json({ error: "archivo no encontrado" }, { status: 404 });
        }
      }
    } catch (err) {
      console.error("file scope check failed", err);
    }
  }

  const tutorInput = {
    subjectId,
    message,
    ...(typeof fileId === "string" && fileId.trim() ? { fileId: fileId.trim() } : {}),
  };

  // Streaming SSE al navegador (finding 3): eventos token* + done final
  // con answer/citations ya persistidas. Sin stream=true -> JSON (R-03).
  if (stream === true) {
    try {
      const encoder = new TextEncoder();
      const sse = (data: unknown) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
      const readable = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            const out = await askTutorStream(tutorInput, (token) => {
              controller.enqueue(sse({ token }));
            });
            const citations = await withSnippets(out.citations, userId);
            await persistChat(userId, subjectId, message, out.answer, citations);
            controller.enqueue(sse({ done: true, answer: out.answer, citations }));
            controller.close();
          } catch (err) {
            console.error("chat stream failed", err);
            const msg = err instanceof AiNotConfiguredError
              ? "IA no configurada"
              : err instanceof AiRateLimitError || err instanceof AiUpstreamError
                ? "IA no disponible"
                : "Error inesperado";
            controller.enqueue(sse({ error: msg }));
            controller.close();
          }
        },
      });
      return new Response(readable, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } catch (err) {
      const res = errorResponse(err);
      if (res) return res;
      throw err;
    }
  }

  try {
    const out = await askTutor(tutorInput);
    const citations = await withSnippets(out.citations, userId);
    await persistChat(userId, subjectId, message, out.answer, citations);
    return Response.json({ answer: out.answer, citations });
  } catch (err) {
    const res = errorResponse(err);
    if (res) return res;
    throw err;
  }
}

/**
 * GET /api/chat?subjectId= — historial persistido (finding 5). Devuelve
 * los Message de la última Conversation de la materia; las citas de
 * cada respuesta assistant se recuperan del payload del ProgressEvent
 * 'chat' correspondiente (orden 1:1 con las respuestas).
 */
export async function GET(request: Request): Promise<Response> {
  const session = await requireSession();
  const userId = session.user!.id;
  const subjectId = new URL(request.url).searchParams.get("subjectId");
  if (!subjectId?.trim()) {
    return Response.json({ error: "falta subjectId" }, { status: 400 });
  }

  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!subject || subject.userId !== userId) {
    return Response.json({ error: "materia no encontrada" }, { status: 404 });
  }

  const db = prisma as unknown as {
    conversation?: {
      findFirst: (a: unknown) => Promise<{ id: string } | null>;
    };
    message?: {
      findMany: (a: unknown) => Promise<Array<{ role: string; content: string; createdAt: Date }>>;
    };
    progressEvent?: {
      findMany: (a: unknown) => Promise<Array<{ payload: unknown }>>;
    };
  };
  if (!db.conversation || !db.message) {
    return Response.json({ conversationId: null, messages: [] });
  }

  const conversation = await db.conversation.findFirst({
    where: { userId, subjectId },
    orderBy: { updatedAt: "desc" },
  });
  if (!conversation) {
    return Response.json({ conversationId: null, messages: [] });
  }

  const rows = await db.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
  });

  let citationSets: unknown[] = [];
  try {
    const events = db.progressEvent
      ? await db.progressEvent.findMany({
          where: { userId, subjectId, type: "chat" },
          orderBy: { createdAt: "asc" },
        })
      : [];
    citationSets = events.map((e) => {
      const p = e.payload as { citations?: unknown } | null;
      return p && Array.isArray(p.citations) ? p.citations : [];
    });
  } catch (err) {
    console.error("chat history citations failed", err);
  }

  let assistantIdx = 0;
  const messages = rows.map((m) => {
    if (m.role === "assistant") {
      const citations = citationSets[assistantIdx++] ?? [];
      return { role: m.role, content: m.content, citations };
    }
    return { role: m.role, content: m.content, citations: [] };
  });

  return Response.json({ conversationId: conversation.id, messages });
}
