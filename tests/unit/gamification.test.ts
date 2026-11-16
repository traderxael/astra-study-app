import { describe, it, expect } from "vitest";
import { gamification } from "../../lib/gamification";
import type { StudyMetrics } from "../../lib/metrics";

function base(over: Partial<StudyMetrics> = {}): StudyMetrics {
  return {
    streak: { current: 0, today: false, totalDays: 0, lastDay: null },
    sessions: 0,
    attempts: 0,
    accuracy: 0,
    docs: 0,
    breakdown: { chat: 0, flashcard: 0, quiz: 0, upload: 0, generation: 0 },
    lastActivity: null,
    subjectName: "Bio",
    subjectId: "s1",
    ...over,
  };
}

describe("gamification — niveles y logros (Task 9)", () => {
  it("sin actividad: nivel 1, 0 estrellas, sin logros", () => {
    const g = gamification(base());
    expect(g.level).toBe(1);
    expect(g.stars).toBe(0);
    expect(g.levelName).toBe("Curioso");
    expect(g.badges.every((b) => !b.unlocked)).toBe(true);
  });

  it("estrellas = 1/sesión + 2/intento + 0.2/ficha + 0.5/documento", () => {
    const g = gamification(
      base({
        sessions: 3,
        attempts: 2,
        docs: 1,
        breakdown: { chat: 3, flashcard: 10, quiz: 0, upload: 1, generation: 0 },
      }),
    );
    expect(g.stars).toBe(3 + 4 + 2 + 0.5);
  });

  it("nivel sube cada 50 estrellas", () => {
    const g = gamification(
      base({ sessions: 50, attempts: 0, docs: 0 }),
    );
    expect(g.level).toBe(2);
    expect(g.levelName).toBe("Estudioso");
  });

  it("desbloquea 'Racha de 3 días' con racha 3", () => {
    const g = gamification(base({ streak: { current: 3, today: true, totalDays: 3, lastDay: "2026-11-15" } }));
    expect(g.badges.find((b) => b.id === "streak-3")?.unlocked).toBe(true);
  });

  it("desbloquea 'Precisión ≥80% con 5 prácticas'", () => {
    const g = gamification(base({ attempts: 5, accuracy: 0.85 }));
    expect(g.badges.find((b) => b.id === "sharpshooter")?.unlocked).toBe(true);
  });

  it("no desbloquea 'Precisión ≥80%' con 4 intentos", () => {
    const g = gamification(base({ attempts: 4, accuracy: 0.99 }));
    expect(g.badges.find((b) => b.id === "sharpshooter")?.unlocked).toBe(false);
  });
});