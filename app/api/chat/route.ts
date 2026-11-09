/**
 * POST /api/chat — ruta mínima del tutor (Task 5).
 *
 * Task 6 extiende esta ruta con persistencia (Conversation/Message,
 * ProgressEvent) sin cambiar la firma POST /api/chat (R-03).
 *
 * Orden de respuestas (Review Focus 3):
 * - 503 { error: 'IA no configurada' } sin clave (antes de tocar la IA,
 *   nunca expone la clave: sin header x-openai-key ni cuerpo con secretos).
 * - 503 { error: 'IA no disponible' } ante rate-limit u otro fallo del
 *   proveedor. Nunca 500 por falta de clave.
 * - 404 si la materia no existe o es de otro dueño (mismo criterio que
 *   la ingesta de archivos). 400 ante body inválido.
 *
 * Con clave y material: 200 { answer, citations } vía askTutor().
 */
import { requireSession } from "../../../lib/auth-guard";
import { prisma } from "../../../lib/db";
import { isAiConfigured, AiNotConfiguredError, AiRateLimitError, AiUpstreamError } from "../../../lib/ai/provider";
import { askTutor } from "../../../lib/ai/tutor";
import type { Citation } from "../../../lib/ai/tutor";

export type ChatCitation = Citation & { snippet?: string };

/**
 * Enriquece citas con snippet (primeros 240 chars del chunk) cuando la
 * búsqueda por ids devuelve contenido; si no, devuelve las citas tal
 * cual (compatibilidad con mocks sin findMany por id, Task 5).
 */
async function withSnippets(citations: Citation[]): Promise<ChatCitation[]> {
  if (!citations.length) return citations;
  try {
    const ids = citations.map((c) => c.chunkId);
    const rows = await prisma.chunk.findMany({
      where: { id: { in: ids } } as never,
    });
    if (!rows || rows.length === 0) return citations;
    const byId = new Map(rows.map((r) => [r.id, r.content]));
    return citations.map((c) => {
      const content = byId.get(c.chunkId);
      return content ? { ...c, snippet: content.slice(0, 240) } : c;
    });
  } catch {
    return citations;
  }
}

/**
 * Persiste Conversation (reutiliza la última de la materia) + Message
 * user/assistant + ProgressEvent type 'chat' (Task 6). Defensivo: si el
 * cliente Prisma no expone estos modelos (mocks antiguos de Task 5) o la
 * persistencia falla, el chat sigue respondiendo 200.
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
    };
    if (!db.conversation || !db.message || !db.progressEvent) return;

    const existing = await db.conversation.findFirst({
      where: { userId, subjectId },
      orderBy: { updatedAt: "desc" },
    });
    const conversation =
      existing ??
      (await db.conversation.create({
        data: { userId, subjectId, title: message.trim().slice(0, 60) },
      }));

    await db.message.create({
      data: { conversationId: conversation.id, role: "user", content: message },
    });
    await db.message.create({
      data: { conversationId: conversation.id, role: "assistant", content: answer },
    });
    await db.progressEvent.create({
      data: {
        userId,
        subjectId,
        type: "chat",
        payload: { citations: citations.map((c) => c.chunkId) },
      },
    });
  } catch {
    // La persistencia es best-effort: nunca rompe la respuesta del tutor.
  }
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
  const { subjectId, message } = (body ?? {}) as {
    subjectId?: unknown;
    message?: unknown;
  };
  if (typeof subjectId !== "string" || !subjectId.trim() ||
      typeof message !== "string" || !message.trim()) {
    return Response.json(
      { error: "falta subjectId o message" },
      { status: 400 },
    );
  }

  if (!isAiConfigured()) {
    return Response.json({ error: "IA no configurada" }, { status: 503 });
  }

  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!subject || subject.userId !== userId) {
    return Response.json({ error: "materia no encontrada" }, { status: 404 });
  }

  try {
    const out = await askTutor({ subjectId, message });
    const citations = await withSnippets(out.citations);
    await persistChat(userId, subjectId, message, out.answer, citations);
    return Response.json({ answer: out.answer, citations });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return Response.json({ error: "IA no configurada" }, { status: 503 });
    }
    if (err instanceof AiRateLimitError || err instanceof AiUpstreamError) {
      return Response.json({ error: "IA no disponible" }, { status: 503 });
    }
    throw err;
  }
}
