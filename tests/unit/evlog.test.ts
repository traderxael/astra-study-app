import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock de lib/db: evita requerir Postgres (mismo patrón que tests/unit/subjects.test.ts).
const { mockDb, mockProgressCreate } = vi.hoisted(() => {
  const mockProgressCreate = vi.fn();
  const mockDb = {
    progressEvent: { create: mockProgressCreate },
  };
  return { mockDb, mockProgressCreate };
});

vi.mock("../../lib/db", () => ({ prisma: mockDb }));

import { logEvent, evlogEnabled } from "../../lib/evlog";

describe("evlog — pipeline de eventos sin PII (Task 9)", () => {
  beforeEach(() => {
    mockProgressCreate.mockReset();
    delete process.env.EVLOG_DISABLED;
  });

  it("registra un evento con type y payload acotado", async () => {
    await logEvent("u1", "s1", "chat", { citations: 3, fileScoped: true });
    expect(mockProgressCreate).toHaveBeenCalledTimes(1);
    const arg = mockProgressCreate.mock.calls[0][0];
    expect(arg.data.userId).toBe("u1");
    expect(arg.data.subjectId).toBe("s1");
    expect(arg.data.type).toBe("chat");
    expect(arg.data.payload).toEqual({ citations: 3, fileScoped: true });
  });

  it("filtra claves que delatan PII (user/email/name/token)", async () => {
    await logEvent("u1", "s1", "chat", {
      userId: "no-va",
      email: "no-va@x.com",
      userName: "no-va",
      token: "secret",
      citations: 2,
    });
    const payload = mockProgressCreate.mock.calls[0][0].data.payload;
    expect(payload).toEqual({ citations: 2 });
  });

  it("no rompe si el modelo no existe en la DB (tests/entorno degradado)", async () => {
    mockProgressCreate.mockRejectedValueOnce(new Error("boom"));
    await expect(logEvent("u1", "s1", "chat")).resolves.toBeUndefined();
  });

  it("EVLOG_DISABLED=true desactiva el pipeline", async () => {
    process.env.EVLOG_DISABLED = "true";
    expect(evlogEnabled()).toBe(false);
    await logEvent("u1", "s1", "chat");
    expect(mockProgressCreate).not.toHaveBeenCalled();
  });

  it("evlogEnabled() es true por defecto", () => {
    expect(evlogEnabled()).toBe(true);
  });
});