import { describe, it, expect, vi, beforeEach } from "vitest";

// Reproduce el mock degradado de los tests de API: `progressEvent` existe,
// pero no expone `count`. Antes esto lanzaba un TypeError silencioso y el
// evento de fallback nunca se registraba.
const { mockDb, mockFindMany, mockCreate, persisted } = vi.hoisted(() => {
  const persisted: Array<{ type: string; createdAt: Date }> = [];
  const mockFindMany = vi.fn(
    async ({ where }: { where: { type: string } }) =>
      persisted.filter((p) => p.type === where.type).map((p) => ({ ...p })),
  );
  const mockCreate = vi.fn(async (_args: { data: { type: string } }) => ({}));
  const mockDb = {
    progressEvent: {
      findMany: mockFindMany,
      create: mockCreate,
    },
  };
  return { mockDb, mockFindMany, mockCreate, persisted };
});

vi.mock("../../lib/db", () => ({ prisma: mockDb }));

import { trackTask } from "../../lib/track";

describe("trackTask con un mock sin progressEvent.count", () => {
  beforeEach(() => {
    delete process.env.EVLOG_DISABLED;
    persisted.length = 0;
    mockFindMany.mockClear();
    mockCreate.mockClear();
  });

  it("registra el evento de fallback cuando no hay nada persistido", async () => {
    await trackTask("u1", "s1", "chat");

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].data.type).toBe("chat");
  });

  it("no duplica si el handler ya persistió el evento", async () => {
    persisted.push({ type: "chat", createdAt: new Date() });

    await trackTask("u1", "s1", "chat");

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("reconoce el alias histórico flashcards como evento ya persistido", async () => {
    persisted.push({ type: "flashcards", createdAt: new Date() });

    await trackTask("u1", "s1", "flashcard");

    expect(mockCreate).not.toHaveBeenCalled();
  });
});
