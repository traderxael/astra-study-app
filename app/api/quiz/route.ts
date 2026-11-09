/**
 * POST /api/quiz — cuestionario de práctica (Task 7).
 *
 * Dos modos sobre el mismo endpoint:
 * 1. Generación: POST { subjectId, n?, topic?, count? } -> 200 QuizItem[]
 *    mix opción múltiple (kind "multiple", options[4], answerIndex 0-3)
 *    + abierta corta (kind "open", options [], answerIndex -1) vía
 *    generateQuiz(). `n` es el alias del brief para la cantidad (count
 *    también vale). `n`/`count` deben ser entero 1..12 o 400.
 *    `topic` opcional (resolveGenerationTopic compartido). Persiste
 *    ProgressEvent 'quiz-generated' {count} (best-effort).
 * 2. Práctica terminada con calificación server-side (fix round 1):
 *    POST { subjectId, items, answers } -> 201 QuizAttempt { id, score,
 *    total, graded }. `items` es el set generado (misma forma que
 *    arriba) y `answers` son los elegidos en el mismo orden (número
 *    0-3 para múltiple, string para abierta, null sin responder).
 *    El servidor calcula score/total sobre las múltiple (abiertas no se
 *    auto-califican); cualquier score/total del cliente se ignora.
 *    Si no hay múltiple (todo abiertas), no se crea QuizAttempt
 *    (graded false, total 0) para no sesgar attempts/accuracy — solo
 *    se registra el evento de actividad. Sin llamada a la IA.
 *
 * Orden (Review Focus 3): sesión → body 400 → generación: sin clave
 * 503 → materia ajena 404 → IA 503. Práctica: materia ajena 404 →
 * calificación server-side. Solo servidor.
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
import type { QuizItem } from "../../../lib/ai/tutor";
import {
  resolveGenerationTopic,
  isValidCount,
} from "../../../lib/generation-topic";

type RawItem = {
  question?: unknown;
  options?: unknown;
  answerIndex?: unknown;
  kind?: unknown;
  explanation?: unknown;
};

function parseItems(raw: unknown): QuizItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: QuizItem[] = [];
  for (const entry of raw) {
    const q = entry as RawItem;
    if (typeof q.question !== "string" || !q.question.trim()) return null;
    const kind =
      q.kind === "open" || q.kind === "multiple"
        ? (q.kind as "open" | "multiple")
        : Array.isArray(q.options) && q.options.length === 0
          ? "open"
          : Array.isArray(q.options) && q.options.length === 4
            ? "multiple"
            : null;
    if (!kind) return null;
    if (kind === "open") {
      if (!Array.isArray(q.options) || q.options.length !== 0 || q.answerIndex !== -1) {
        return null;
      }
      const item: QuizItem = {
        question: q.question,
        options: [],
        answerIndex: -1,
        kind: "open",
      };
      if (typeof q.explanation === "string") item.explanation = q.explanation;
      out.push(item);
    } else {
      if (
        !Array.isArray(q.options) ||
        q.options.length !== 4 ||
        !q.options.every((o) => typeof o === "string") ||
        !Number.isInteger(q.answerIndex) ||
        (q.answerIndex as number) < 0 ||
        (q.answerIndex as number) > 3
      ) {
        return null;
      }
      const item: QuizItem = {
        question: q.question,
        options: q.options as string[],
        answerIndex: q.answerIndex as number,
        kind: "multiple",
      };
      if (typeof q.explanation === "string") item.explanation = q.explanation;
      out.push(item);
    }
  }
  return out;
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
  const { subjectId, topic, n, count, answers, items: rawItems } = payload;
  if (typeof subjectId !== "string" || !subjectId.trim()) {
    return Response.json({ error: "falta subjectId" }, { status: 400 });
  }

  // Modo práctica: calificación server-side contra los items generados.
  if (answers !== undefined || rawItems !== undefined) {
    if (!Array.isArray(answers)) {
      return Response.json({ error: "answers inválido" }, { status: 400 });
    }
    const parsedItems = parseItems(rawItems);
    if (!parsedItems) {
      return Response.json({ error: "items inválido" }, { status: 400 });
    }
    if (answers.length !== parsedItems.length) {
      return Response.json({ error: "answers inválido" }, { status: 400 });
    }
    for (let i = 0; i < parsedItems.length; i++) {
      const item = parsedItems[i];
      const chosen = answers[i];
      if (item.kind === "open" || (item.options.length === 0 && item.kind !== "multiple")) {
        if (chosen !== null && typeof chosen !== "string") {
          return Response.json({ error: "answers inválido" }, { status: 400 });
        }
      } else {
        if (
          chosen !== null &&
          !(Number.isInteger(chosen) && (chosen as number) >= 0 && (chosen as number) <= 3)
        ) {
          return Response.json({ error: "answers inválido" }, { status: 400 });
        }
      }
    }

    const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject || subject.userId !== userId) {
      return Response.json({ error: "materia no encontrada" }, { status: 404 });
    }

    // Cálculo server-side: solo múltiple suma a score/total.
    let score = 0;
    let total = 0;
    parsedItems.forEach((item, i) => {
      if (item.kind === "open") return;
      total += 1;
      if (answers[i] === item.answerIndex) score += 1;
    });

    try {
      const db = prisma as unknown as {
        quizAttempt?: {
          create: (a: unknown) => Promise<{ id: string; score: number; total: number }>;
        };
        progressEvent?: { create: (a: unknown) => Promise<unknown> };
      };
      if (total === 0) {
        // Todas abiertas: sin calificación automática. No crear
        // QuizAttempt (evita el falso 0/N); solo evento de actividad.
        if (db.progressEvent) {
          await db.progressEvent.create({
            data: {
              userId,
              subjectId,
              type: "quiz",
              payload: { score: 0, total: 0, graded: false, openCount: parsedItems.length },
            },
          });
        }
        return Response.json({ id: null, score: 0, total: 0, graded: false }, { status: 201 });
      }

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
          data: { userId, subjectId, type: "quiz", payload: { score, total, graded: true } },
        });
      }
      if (!created) {
        return Response.json({ id: null, score, total, graded: true }, { status: 201 });
      }
      return Response.json({ ...created, graded: true }, { status: 201 });
    } catch (err) {
      console.error("quiz attempt persist failed", err);
      return Response.json({ id: null, score, total, graded: total > 0 }, { status: 201 });
    }
  }

  // Modo generación.
  if (topic !== undefined && typeof topic !== "string") {
    return Response.json({ error: "topic inválido" }, { status: 400 });
  }
  const requested = n ?? count;
  if (requested !== undefined && !isValidCount(requested)) {
    return Response.json({ error: "n/count inválido" }, { status: 400 });
  }
  if (n !== undefined && count !== undefined && (!isValidCount(n) || !isValidCount(count))) {
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
    const effectiveTopic = await resolveGenerationTopic(subjectId, topic);
    const quizItems = await generateQuiz({
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
          data: {
            userId,
            subjectId,
            type: "quiz-generated",
            payload: {
              count: quizItems.length,
              open: quizItems.filter((i) => i.kind === "open").length,
            },
          },
        });
      }
    } catch (err) {
      console.error("quiz generate persist failed", err);
    }

    return Response.json(quizItems);
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
