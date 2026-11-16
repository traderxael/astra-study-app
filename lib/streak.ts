/**
 * streak — racha de días de estudio (Task 9).
 *
 * Idea tomada de Astra AI (`streak.getStreak` / `streak.getTodayStatus`):
 * cuenta días consecutivos con al menos un evento de estudio hasta hoy.
 * Día = fecha UTC (YYYY-MM-DD) derivada de ProgressEvent.createdAt, para
 * no depender de la zona horaria del cliente.
 *
 * Reglas:
 * - Días distintos = fechas distintas.
 * - Racha = longitud del tramo consecutivo que termina en hoy o ayer
 *   (si hoy todavía no hay evento, no rompe la racha: sigue desde ayer).
 * - `today` = hay evento hoy.
 */

import { prisma } from "./db";

export interface StreakInfo {
  current: number; // racha actual (días)
  today: boolean; // hay actividad hoy (UTC)
  totalDays: number; // días distintos con actividad
  lastDay: string | null; // 'YYYY-MM-DD' o null
}

/** Fecha UTC como YYYY-MM-DD. */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayNumber(key: string): number {
  // Días desde epoch para poder comparar fechas como enteros.
  const t = Date.parse(`${key}T00:00:00Z`);
  return Number.isNaN(t) ? 0 : Math.floor(t / 86_400_000);
}

/**
 * Calcula la racha de un usuario en una materia. Un evento "cuenta" sin
 * importar su tipo (chat, quiz, ficha...): cualquier actividad del día.
 */
export async function getStreak(
  userId: string,
  subjectId: string,
): Promise<StreakInfo> {
  const db = prisma as unknown as {
    progressEvent?: {
      findMany: (a: unknown) => Promise<Array<{ createdAt: Date }>>;
    };
  };
  let rows: Array<{ createdAt: Date }> = [];
  try {
    rows = db.progressEvent
      ? await db.progressEvent.findMany({
          where: { userId, subjectId },
          select: { createdAt: true },
        })
      : [];
  } catch (err) {
    console.error("getStreak failed", err);
    return { current: 0, today: false, totalDays: 0, lastDay: null };
  }

  if (rows.length === 0) {
    return { current: 0, today: false, totalDays: 0, lastDay: null };
  }

  const days = new Set(rows.map((r) => dayKey(r.createdAt)));
  const nums = [...days].map(dayNumber).sort((a, b) => a - b);
  const totalDays = nums.length;
  const todayKey = dayKey(new Date());
  const today = days.has(todayKey);
  const todayNum = dayNumber(todayKey);

  // Racha: desde el día más grande <= hoy, cuenta hacia atrás mientras
  // los días consecutivos existan. Si hoy no hay evento, arranca en ayer.
  let anchor = today ? todayNum : todayNum - 1;
  if (!nums.includes(anchor)) {
    // No hay actividad hoy ni ayer: racha en 0.
    return { current: 0, today, totalDays, lastDay: days.has(todayKey) ? todayKey : null };
  }
  let current = 0;
  let cursor = anchor;
  const set = new Set(nums);
  while (set.has(cursor)) {
    current += 1;
    cursor -= 1;
  }
  const last = [...days].sort().pop() ?? null;
  return { current, today, totalDays, lastDay: last };
}