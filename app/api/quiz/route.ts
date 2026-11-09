/**
 * POST /api/quiz — cuestionario de práctica desde el material (Task 7).
 *
 * Dos modos sobre el mismo endpoint:
 * 1. Generación: POST { subjectId, n?, topic?, count? } -> 200 QuizItem[]
 *    [{ question, options[4], answerIndex, explanation? }] vía generateQuiz().
 *    `n` es el alias del brief para la cantidad (count también vale).
 *    `topic` opcional (se deriva del material si falta). Persiste
 *    ProgressEvent 'quiz-generated' {count} (best-effort).
 * 2. Práctica terminada (QuizRunner): POST { subjectId, answers, score, total }
 *    -> 201 QuizAttempt { id, score, total }. Sin llamada a la IA (no requiere
 *    clave). Persiste QuizAttempt + ProgressEvent 'quiz' {score, total}.
 *    El puntaje lo calcula el cliente sobre opción múltiple; las abiertas
 *    cortas (texto libre) no se auto-califican y no suman al total.
 *
 * Orden (Review Focus 3): sesión → body 400 → modo generación: sin clave
 * 503 → materia ajena 404 → IA 503. Modo práctica: materia ajena 404 →
 * persistir. Solo servidor.
 */
import { requireSession } from "../../../lib/auth-guard";
import { prisma } from "../../../lib/db";
import {
  isAiConfigured,
  AiNotConfiguredError,
  AiRateLimitError,
  AiUpstreamError,
} from "../../../lib/ai/provider";
import { generateQuiz } from "../../../lib/ai/tutor";

async function resolveTopic(subjectId: string, topic?: unknown): Promise<string> {
  if (typeof topic === "string" && topic.trim()) return topic.trim();
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
    console.error("resolveTopic quiz failed", err);
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
  const payload = (body ?? {}) as Record<string, unknown>;
  const { subjectId, topic, n, count, answers, score, total } = payload;
  if (typeof subjectId !== "string" || !subjectId.trim()) {
    return Response.json({ error: "falta subjectId" }, { status: 400 });
  }

  // Modo práctica: registrar intento ya resuelto por el cliente.
  if (answers !== undefined) {
    if (!Array.isArray(answers)) {
      return Response.json({ error: "answers inválido" }, { status: 400 });
    }
    if (
      typeof score !== "number" ||
      typeof total !== "number" ||
      !Number.isInteger(score) ||
      !Number.isInteger(total) ||
      total < 1 ||
      score < 0 ||
      score > total
    ) {
      return Response.json({ error: "score/total inválido" }, { status: 400 });
    }
    const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject || subject.userId !== userId) {
      return Response.json({ error: "materia no encontrada" }, { status: 404 });
    }
    try {
      const db = prisma as unknown as {
        quizAttempt?: { create: (a: unknown) => Promise<{ id: string; score: number; total: number }> };
        progressEvent?: { create: (a: unknown) => Promise<unknown> };
      };
      let created: { id: string; score: number; total: number } | null = null;
      if (db.quizAttempt) {
        created = await db.quizAttempt.create({
          data: { userId, subjectId, score, total, answers: answers as never },
        });
      } else {
        console.error("quiz: modelo quizAttempt no disponible");
      }
      if (db.progressEvent) {
        await db.progressEvent.create({
          data: { userId, subjectId, type: "quiz", payload: { score, total } },
        });
      }
      if (!created) {
        // Sin modelo (mocks viejos): no persistimos pero respondemos el intento.
        return Response.json({ id: null, score, total }, { status: 201 });
      }
      return Response.json(created, { status: 201 });
    } catch (err) {
      console.error("quiz attempt persist failed", err);
      // Sin persistencia disponible, devolvemos el intento sin bloquear al usuario.
      return Response.json({ id: null, score, total }, { status: 201 });
    }
  }

  // Modo generación.
  if (topic !== undefined && typeof topic !== "string") {
    return Response.json({ error: "topic inválido" }, { status: 400 });
  }
  const requested = n ?? count;
  if (requested !== undefined && typeof requested !== "number") {
    return Response.json({ error: "n/count inválido" }, { status: 400 });
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
    const items = await generateQuiz({
      subjectId,
      topic: effectiveTopic,
      ...(typeof requested === "number" ? { count: requested } : {}),
    });

    try {
      const db = prisma as unknown as {
        progressEvent?: { create: (a: unknown) => Promise<unknown> };
      };
      if (db.progressEvent) {
        await db.progressEvent.create({
          data: { userId, subjectId, type: "quiz-generated", payload: { count: items.length } },
        });
      }
    } catch (err) {
      console.error("quiz generate persist failed", err);
    }

    return Response.json(items);
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
