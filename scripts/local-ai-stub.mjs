/**
 * Stub local de IA compatible con OpenAI (solo para desarrollo/E2E).
 *
 * NO es una IA real: devuelve respuestas fijas y deterministas para poder
 * probar el flujo completo (tutor con citas, resumen, fichas, quiz) sin
 * gastar tokens ni exponer una clave real.
 *
 * Uso:
 *   node scripts/local-ai-stub.mjs            # escucha en 127.0.0.1:4010
 *   OPENAI_BASE_URL="http://127.0.0.1:4010/v1" \
 *   OPENAI_API_KEY="stub-local" npm run start
 */
import { createServer } from "node:http";

const PORT = Number(process.env.STUB_PORT ?? 4010);
const HOST = process.env.STUB_HOST ?? "127.0.0.1";

const TUTOR_TEXT = [
  "La mitosis es la división celular que produce dos células hijas idénticas [1].",
  "Pasa por cuatro fases: profase, metafase, anafase y telofase [1].",
].join(" ");

const FLASHCARDS_JSON = JSON.stringify([
  { front: "¿Qué produce la mitosis?", back: "Dos células hijas idénticas." },
  { front: "¿Cuáles son sus fases?", back: "Profase, metafase, anafase y telofase." },
  { front: "¿En qué consiste la profase?", back: "Es la primera fase de la mitosis." },
]);

const QUIZ_JSON = JSON.stringify([
  {
    kind: "multiple",
    question: "¿Qué produce la mitosis?",
    options: [
      "Dos células hijas idénticas",
      "Una célula más grande",
      "Ninguna célula",
      "Tres células distintas",
    ],
    answerIndex: 0,
    explanation: "La mitosis divide la célula madre en dos células hijas idénticas.",
  },
  {
    kind: "open",
    question: "¿Cuáles son las fases de la mitosis?",
    options: [],
    answerIndex: -1,
    explanation: "Profase, metafase, anafase y telofase.",
  },
]);

function answerFor(systemPrompt) {
  if (systemPrompt.includes("tarjetas de estudio")) return FLASHCARDS_JSON;
  if (systemPrompt.includes("preguntas de práctica")) return QUIZ_JSON;
  if (systemPrompt.includes("Resumís el material")) {
    return "- La mitosis divide la célula en dos.\n- Tiene cuatro fases [1].\n\nCitas: [1]";
  }
  return TUTOR_TEXT;
}

function sseChunks(text) {
  const encoder = new TextEncoder();
  const pieces = text.match(/.{1,24}/gs) ?? [text];
  const events = [];
  for (const piece of pieces) {
    events.push(
      `data: ${JSON.stringify({
        choices: [{ delta: { content: piece } }],
      })}\n\n`,
    );
  }
  events.push("data: [DONE]\n\n");
  return encoder.encode(events.join(""));
}

const server = createServer((req, res) => {
  if (!req.url?.endsWith("/chat/completions")) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    let systemPrompt = "";
    try {
      const parsed = JSON.parse(body || "{}");
      const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
      systemPrompt =
        messages.find((m) => m.role === "system")?.content ?? "";
    } catch {
      /* respuesta por defecto */
    }

    const text = answerFor(systemPrompt);

    if (body.includes('"stream":true')) {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.end(sseChunks(text));
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: text } }] }));
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Stub de IA escuchando en http://${HOST}:${PORT}/v1`);
});
