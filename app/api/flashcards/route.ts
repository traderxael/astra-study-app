/**
 * POST /api/flashcards — mazo de fichas desde el material (Task 7).
 *
 * Contrato: POST { subjectId, topic? } -> 200 Flashcard[] [{ front, back }].
 * `topic` opcional: si falta, se deriva del primer chunk de la materia
 * (si no, 'la' como consulta genérica en español) para que retrieveChunks
 * tenga términos. `count` opcional (tope del servicio).
 *
 * Orden degradado (Review Focus 3, como chat/summarize): sesión →
 * body 400 → sin clave 503 'IA no configurada' → materia ajena 404 →
 * IA (503 'IA no disponible' ante rate-limit/fallo).
 *
 * Persistencia best-effort (nunca rompe el 200, loguea): cada carta como
 * Flashcard (source 'ai') + ProgressEvent type 'flashcards' con {count}.
 * Solo servidor, clave solo en el proveedor.
 */
import { requireSession } from "../../../lib/auth-guard";
import { prisma } from "../../../lib/db";
import {
  isAiConfigured,
  AiNotConfiguredError,
  AiRateLimitError,
  AiUpstreamError,
} from "../../../lib/ai/provider";
import { generateFlashcards } from "../../../lib/ai/tutor";

async function resolveTopic(subjectId: string, topic?: unknown): Promise<string> {
  if (typeof topic === "string" && topic.trim()) return topic.trim();
  // Sin tema: derivar uno del material real para que el retrieval puntúe.
  try {
    const db = prisma as unknown as {
      chunk?: { findMany: (a: unknown) => Promise<Array<{ content: string }>> };
    };
    if (db.chunk) {
      const rows = await db.chunk.findMany({ where: { subjectId } });
      const first = rows?.[0]?.content?.trim();
      if (first) return first.slice(0, 500);
    }
  } catch (err) {
    console.error("resolveTopic flashcards failed", err);
  }
  return "la";
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
  const { subjectId, topic, count } = (body ?? {}) as {
    subjectId?: unknown;
    topic?: unknown;
    count?: unknown;
  };
  if (typeof subjectId !== "string" || !subjectId.trim()) {
    return Response.json({ error: "falta subjectId" }, { status: 400 });
  }
  if (topic !== undefined && typeof topic !== "string") {
    return Response.json({ error: "topic inválido" }, { status: 400 });
  }
  if (count !== undefined && typeof count !== "number") {
    return Response.json({ error: "count inválido" }, { status: 400 });
  }

  if (!isAiConfigured()) {
    return Response.json({ error: "IA no configurada" }, { status: 503 });
  }

  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!subject || subject.userId !== userId) {
    return Response.json({ error: "materia no encontrada" }, { status: 404 });
  }

  try {
    const effectiveTopic = await resolveTopic(subjectId, topic);
    const cards = await generateFlashcards({
      subjectId,
      topic: effectiveTopic,
      ...(typeof count === "number" ? { count } : {}),
    });

    // Persistencia best-effort: Flashcard por carta + ProgressEvent.
    try {
      const db = prisma as unknown as {
        flashcard?: { create: (a: unknown) => Promise<unknown> };
        progressEvent?: { create: (a: unknown) => Promise<unknown> };
      };
      if (db.flashcard) {
        for (const card of cards) {
          await db.flashcard.create({
            data: { userId, subjectId, front: card.front, back: card.back, source: "ai" },
          });
        }
      } else if (cards.length > 0) {
        console.error("flashcards: modelo flashcard no disponible");
      }
      if (db.progressEvent) {
        await db.progressEvent.create({
          data: { userId, subjectId, type: "flashcards", payload: { count: cards.length } },
        });
      }
    } catch (err) {
      console.error("flashcards persist failed", err);
    }

    return Response.json(cards);
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
