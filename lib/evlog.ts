/**
 * evlog — pipeline de eventos propio, tipado y SIN datos personales (Task 9).
 *
 * Tomado del análisis de Astra AI (`re/astra-ai/ANALISIS.md` §4.1): su
 * pipeline `evlog` manda `user_email`, `user_name` e `user_info` en cada
 * evento. Acá se hace lo mismo pero al revés a propósito: el payload se
 * restringe a `Meta` (claves numeros/strings cortos) y NUNCA incluye
 * email, nombre, userId ni el contenido del chat.
 *
 * Reglas:
 * - Solo servidor (módulo `server-only`-like: no importar desde cliente).
 * - Un intento de persistencia por evento; los fallos se loguean y no
 *   propagan (el progreso nunca debe romper una respuesta).
 * - Si `evlogEnabled()` es false (por config), no toca la DB.
 *
 * Ejemplo (Task 9, desde /api/chat):
 *   await logEvent(userId, subjectId, "chat", { citations: 3, fileScoped: true });
 */

import { prisma } from "./db";

/** Tipos de evento soportados. Cualquier string futuro se acepta (forward-compat). */
export type EventType =
  | "chat"
  | "flashcard"
  | "quiz"
  | "upload"
  | "generation"
  | "signup"
  | "login";

/** Meta acotada: claves simples, valores cortos. Sin PII por diseño. */
export type EventMeta = Record<
  string,
  string | number | boolean | null | undefined
>;

/** El payload solo acepta lo que Meta permite: nunca userId/email/tokens. */
function safePayload(meta?: EventMeta): Record<string, unknown> | null {
  if (!meta) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined) continue;
    // Bloqueo defensivo: claves que delatan PII jamás entran.
    if (/^(user|email|name|phone|token|secret|password)/i.test(k)) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Activa/desactiva el pipeline (config de entorno). Default: activo. */
export function evlogEnabled(): boolean {
  return process.env.EVLOG_DISABLED?.trim().toLowerCase() !== "true";
}

/**
 * Registra un evento de progreso. Idempotente no es trivial (cada llamada
 * crea fila), pero la garantía es: si falla, se loguea y no rompe.
 */
export async function logEvent(
  userId: string,
  subjectId: string,
  type: EventType,
  meta?: EventMeta,
): Promise<void> {
  if (!evlogEnabled()) return;
  const db = prisma as unknown as {
    progressEvent?: { create: (a: unknown) => Promise<unknown> };
  };
  if (!db.progressEvent) {
    // Base sin el modelo (tests / entorno degradado): no-op silencioso.
    return;
  }
  try {
    await db.progressEvent.create({
      data: { userId, subjectId, type, payload: safePayload(meta) },
    });
  } catch (err) {
    console.error(`evlog: evento "${type}" no se pudo registrar`, err);
  }
}