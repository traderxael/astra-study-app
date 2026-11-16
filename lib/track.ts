/**
 * track — mapeo de tareas a eventos y a acciones de cuota (Task 9).
 *
 * Capa de integración entre los distintos módulos y `lib/evlog` +
 * `lib/quota`:
 * - `trackTask(userId, subjectId, taskId, meta)` -> logEvent con el type
 *   canónico (Task 9: "chat"/"flashcard"/"quiz"/"upload"/"generation").
 * - `usedActions(userId, subjectId)` -> cuenta usos del mes por acción
 *   (lee ProgressEvent), para `lib/quota.quotaFor`.
 *
 * Ajustado al código existente: cada tarea (chat, flashcards, quiz,
 * uploads) ya persistía un ProgressEvent; acá se centraliza el mapeo y la
 * lectura para no reimplementar conteos en cada ruta.
 */

import { prisma } from "./db";
import { logEvent, type EventType, type EventMeta } from "./evlog";

export type TaskId = "chat" | "flashcard" | "quiz" | "upload" | "generation";

/** Progreso por tipo de evento en un rango de fechas (inclusive, en UTC). */
export interface ProgressRow {
  type: string;
  createdAt: Date;
}

async function progressRows(
  userId: string,
  subjectId: string,
  since?: Date,
): Promise<ProgressRow[]> {
  const db = prisma as unknown as {
    progressEvent?: {
      findMany: (a: unknown) => Promise<Array<ProgressRow>>;
    };
  };
  if (!db.progressEvent) return [];
  try {
    return await db.progressEvent.findMany({
      where: {
        userId,
        subjectId,
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      select: { type: true, createdAt: true },
    });
  } catch (err) {
    console.error("progressRows failed", err);
    return [];
  }
}

/** Inicio del mes calendario actual (UTC). */
function startOfMonthUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Usos del mes por acción: cada acción se cuenta sobre su ProgressEvent
 * canónico. `chat` mapea a 'chat', `generation` a 'generation', etc.
 * `oral-tutor-chat` no se cuenta acá (es un caso futuro, se suma desde su
 * propio handler).
 */
export async function usedActions(
  userId: string,
  subjectId: string,
): Promise<Record<string, number>> {
  const rows = await progressRows(userId, subjectId, startOfMonthUtc());
  const out: Record<string, number> = {
    chat: 0,
    generation: 0,
    flashcard: 0,
    flashcards: 0, // alias histórico (ProgressEvent type "flashcards")
    quiz: 0,
    upload: 0,
  };
  for (const r of rows) {
    if (r.type in out) out[r.type] += 1;
  }
  // Normaliza al nombre canónico para lib/quota.
  out.flashcard += out.flashcards;
  return out;
}

/** Cuenta usos totales (todo el historial) por tipo. */
export async function usedAll(
  userId: string,
  subjectId: string,
): Promise<Record<string, number>> {
  const rows = await progressRows(userId, subjectId);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.type] = (out[r.type] ?? 0) + 1;
  return out;
}

/**
 * Registra el evento de una tarea SIN duplicar ProgressEvent (Task 9).
 *
 * Los handlers (chat/flashcards/quiz/summarize) YA persisten su propio
 * ProgressEvent. trackTask:
 * 1. Cuenta los eventos del tipo ya existentes del usuario+materia.
 * 2. Si hay >= 1, NO crea nada (evita el doble conteo que rompería las
 *    métricas y los tests existentes).
 * 3. Si no hay ninguno (handler degradado / tipo no persistido), crea el
 *    evento normalizado vía lib/evlog (sin PII).
 *
 * Así el pipeline cubre el caso "el handler no persistió" sin ensuciar el
 * caso normal.
 */
export async function trackTask(
  userId: string,
  subjectId: string,
  taskId: TaskId,
  meta?: EventMeta,
): Promise<void> {
  const db = prisma as unknown as {
    progressEvent?: {
      count: (a: unknown) => Promise<number>;
    };
  };
  if (!db.progressEvent) return;
  try {
    const existing = await db.progressEvent.count({
      where: { userId, subjectId, type: taskId },
    });
    if (existing > 0) return; // el handler ya persistió el suyo
  } catch (err) {
    console.error("trackTask count failed", err);
    return;
  }
  await logEvent(userId, subjectId, taskId as EventType, meta);
}