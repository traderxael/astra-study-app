/**
 * gamification — niveles y logros (Task 9).
 *
 * Copia el espíritu de Astra AI (§3: `streak.*`, `stars.summary`,
 * `badges.list`, `duel.today`) sin copiar su código: todo es derivado de
 * las métricas locales (lib/metrics), sin tabla extra. Así el dashboard
 * puede mostrar "Nivel N / racha / insignias" sin una migración aparte.
 *
 * "Stars" (puntos) = f(x) simple: 1 por sesión, 2 por práctica, 0.2 por
 * ficha, 0.5 por documento. Nivel = floor(stars / 50) + 1.
 */

import type { StudyMetrics } from "./metrics";

export interface Badge {
  id: string;
  label: string;
  unlocked: boolean;
}

export interface Gamification {
  stars: number;
  level: number;
  levelName: string;
  nextLevelAt: number;
  badges: Badge[];
}

const LEVEL_NAMES = [
  "Curioso",
  "Estudioso",
  "Constante",
  "Dedicado",
  "Experto",
  "Maestro",
];

function levelName(level: number): string {
  return LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)] ?? `Nivel ${level}`;
}

export function gamification(m: StudyMetrics): Gamification {
  const stars =
    m.sessions * 1 +
    m.attempts * 2 +
    m.breakdown.flashcard * 0.2 +
    m.breakdown.upload * 0.5;
  const level = Math.floor(stars / 50) + 1;
  const nextLevelAt = level * 50;

  const badges: Badge[] = [
    {
      id: "first-step",
      label: "Primer paso",
      unlocked: m.sessions + m.attempts + m.breakdown.flashcard > 0,
    },
    {
      id: "streak-3",
      label: "Racha de 3 días",
      unlocked: m.streak.current >= 3,
    },
    {
      id: "streak-7",
      label: "Racha de 7 días",
      unlocked: m.streak.current >= 7,
    },
    {
      id: "deep-work",
      label: "10 sesiones de tutor",
      unlocked: m.sessions >= 10,
    },
    {
      id: "sharpshooter",
      label: "Precisión ≥ 80% con 5 prácticas",
      unlocked: m.attempts >= 5 && m.accuracy >= 0.8,
    },
    {
      id: "librarian",
      label: "5 documentos procesados",
      unlocked: m.docs >= 5,
    },
  ];

  return {
    stars: Math.round(stars * 10) / 10,
    level,
    levelName: levelName(level),
    nextLevelAt,
    badges,
  };
}