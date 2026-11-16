/**
 * Modo de estudio y cuota por modo (Task 9).
 *
 * Copiado del comportamiento de Astra AI (§3 y §5.4 del análisis): cada
 * tipo de actividad es una `action` con su propio contador mensual
 * (`usage.getActionAccessStatus`), y la UI muestra "Consume más de tu
 * límite mensual" cuando se agota.
 *
 * Acá es config-driven: `lib/track.ts` mapea `taskId -> action`, y cada
 * acción tiene un tope. Se resuelve en servidor (no hay estado en cliente).
 */

export interface ActionQuota {
  limit: number;
  used: number;
  remaining: number;
  exhausted: boolean;
}

/** Def de acciones: { label, limit }. `limit: 0` = ilimitado. */
const ACTIONS: Record<string, { label: string; limit: number }> = {
  chat: { label: "Tutor conversacional", limit: 0 }, // ilimitado (precio base)
  generation: { label: "Generación con IA", limit: 100 },
  quiz: { label: "Prácticas calificables", limit: 0 },
  transcription: { label: "Transcripción de audio", limit: 0 },
  "oral-tutor-chat": { label: "Examen oral simulado", limit: 20 },
};

export function actionLabel(action: string): string {
  return ACTIONS[action]?.label ?? action;
}

export function actionLimit(action: string): number {
  return ACTIONS[action]?.limit ?? 0;
}

/**
 * Cuota por acción para un usuario/materia. Sin DB: el `used` se pasa
 * como parámetro (lo calcula lib/track con el ProgressEvent).
 */
export function quotaFor(action: string, used: number): ActionQuota {
  const limit = actionLimit(action);
  const safeUsed = Math.max(0, Math.floor(used));
  const remaining = limit > 0 ? Math.max(0, limit - safeUsed) : Number.POSITIVE_INFINITY;
  return {
    limit,
    used: safeUsed,
    remaining,
    exhausted: limit > 0 && safeUsed >= limit,
  };
}

/** Texto de UI: "Consume más de tu límite mensual" o "Disponible". */
export function quotaMessage(q: ActionQuota): string {
  if (q.limit === 0) return "Disponible";
  if (q.exhausted) return "Consume más de tu límite mensual";
  return `${q.remaining} de ${q.limit} disponibles este mes`;
}