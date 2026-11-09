/**
 * Agregación de progreso por materia (Task 7 fix round 1).
 *
 * Fuente única para GET /api/progress y el dashboard: evita que la
 * página reimplemente el conteo con findMany y se desincronice.
 * `sessions` es honesto: cuenta cada ProgressEvent (un tick por chat,
 * ficha, generación y práctica), no días ni conversaciones distintas.
 * `attempts` cuenta QuizAttempt (prácticas calificables).
 * `accuracy = Σscore / Σtotal` sobre intentos con total > 0 (0 si
 * ninguno). Solo servidor.
 */

import { prisma } from "./db";

export interface ProgressSummary {
  sessions: number;
  attempts: number;
  accuracy: number;
}

export async function aggregateProgress(
  userId: string,
  subjectId: string,
): Promise<ProgressSummary> {
  const db = prisma as unknown as {
    progressEvent?: { findMany: (a: unknown) => Promise<Array<unknown>> };
    quizAttempt?: {
      findMany: (a: unknown) => Promise<Array<{ score: number; total: number }>>;
    };
  };

  let sessions = 0;
  try {
    if (db.progressEvent) {
      const events = await db.progressEvent.findMany({ where: { userId, subjectId } });
      sessions = Array.isArray(events) ? events.length : 0;
    }
  } catch (err) {
    console.error("aggregateProgress events failed", err);
  }

  let attempts = 0;
  let accuracy = 0;
  try {
    if (db.quizAttempt) {
      const rows = await db.quizAttempt.findMany({ where: { userId, subjectId } });
      const list = Array.isArray(rows) ? rows : [];
      attempts = list.length;
      let sumScore = 0;
      let sumTotal = 0;
      for (const row of list) {
        if (
          typeof row.score === "number" &&
          typeof row.total === "number" &&
          row.total > 0
        ) {
          sumScore += row.score;
          sumTotal += row.total;
        }
      }
      accuracy = sumTotal > 0 ? sumScore / sumTotal : 0;
    }
  } catch (err) {
    console.error("aggregateProgress attempts failed", err);
  }

  return { sessions, attempts, accuracy };
}
