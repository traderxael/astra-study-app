/**
 * metrics — agregaciones de estudio para el dashboard (Task 9).
 *
 * Reúne lo que el dashboard viejo no tenía: racha (lib/streak), documentos
 * procesados, precisión por sesión, y desglose por actividad. Todo con
 * los ProgressEvent y QuizAttempt como fuente única (evita reimplementar
 * conteos en la página, como ya hacía lib/progress.ts).
 */

import { prisma } from "./db";
import { getStreak, type StreakInfo } from "./streak";

export interface ActivityBreakdown {
  chat: number;
  flashcard: number;
  quiz: number;
  upload: number;
  generation: number;
}

export interface SessionAccuracy {
  accuracy: number;
  attempts: number;
  sessions: number; // sesiones de chat con al menos una práctica
}

export interface StudyMetrics {
  streak: StreakInfo;
  sessions: number;
  attempts: number;
  accuracy: number;
  docs: number; // archivos cargados (status != error)
  breakdown: ActivityBreakdown;
  lastActivity: string | null;
  subjectName: string;
  subjectId: string;
}

interface ProgressEventRow {
  type: string;
  payload: unknown;
  createdAt: Date;
}

interface QuizRow {
  score: number;
  total: number;
  createdAt: Date;
}

function emptyBreakdown(): ActivityBreakdown {
  return { chat: 0, flashcard: 0, quiz: 0, upload: 0, generation: 0 };
}

/**
 * Métricas completas de una materia. Si la DB no tiene los modelos (tests
 * / entorno degradado), devuelve ceros con la materia tal cual.
 */
export async function getMetrics(
  userId: string,
  subjectId: string,
  subjectName: string,
): Promise<StudyMetrics> {
  const streak = await getStreak(userId, subjectId);

  const db = prisma as unknown as {
    progressEvent?: { findMany: (a: unknown) => Promise<Array<ProgressEventRow>> };
    quizAttempt?: { findMany: (a: unknown) => Promise<Array<QuizRow>> };
    file?: {
      findMany: (a: unknown) => Promise<Array<{ status: string }>>;
    };
  };

  const breakdown = emptyBreakdown();
  let events: ProgressEventRow[] = [];
  try {
    events = db.progressEvent
      ? await db.progressEvent.findMany({
          where: { userId, subjectId },
          select: { type: true, payload: true, createdAt: true },
        })
      : [];
  } catch (err) {
    console.error("getMetrics events failed", err);
  }

  let sessions = 0;
  let lastActivity: string | null = null;
  for (const e of events) {
    if (e.type === "chat") sessions += 1;
    if (e.type === "flashcard" || e.type === "flashcards") breakdown.flashcard += 1;
    else if (e.type === "quiz") breakdown.quiz += 1;
    else if (e.type === "upload") breakdown.upload += 1;
    else if (e.type === "generation") breakdown.generation += 1;
    const key = e.createdAt.toISOString().slice(0, 10);
    if (!lastActivity || key > lastActivity) lastActivity = key;
  }

  let attempts = 0;
  let accuracy = 0;
  try {
    const rows = db.quizAttempt
      ? await db.quizAttempt.findMany({
          where: { userId, subjectId },
          select: { score: true, total: true, createdAt: true },
        })
      : [];
    let sumScore = 0;
    let sumTotal = 0;
    for (const r of rows) {
      if (typeof r.score === "number" && typeof r.total === "number" && r.total > 0) {
        attempts += 1;
        sumScore += r.score;
        sumTotal += r.total;
      }
    }
    accuracy = sumTotal > 0 ? sumScore / sumTotal : 0;
  } catch (err) {
    console.error("getMetrics attempts failed", err);
  }

  let docs = 0;
  try {
    const files = db.file
      ? await db.file.findMany({
          where: { userId, subjectId },
          select: { status: true },
        })
      : [];
    docs = files.filter((f) => f.status !== "error").length;
  } catch (err) {
    console.error("getMetrics docs failed", err);
  }

  return {
    streak,
    sessions,
    attempts,
    accuracy,
    docs,
    breakdown,
    lastActivity,
    subjectName,
    subjectId,
  };
}