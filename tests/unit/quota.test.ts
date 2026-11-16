import { describe, it, expect } from "vitest";
import { quotaFor, quotaMessage, actionLimit } from "../../lib/quota";

describe("quota — cuota por acción (Task 9)", () => {
  it("acción con límite 0 = ilimitada", () => {
    const q = quotaFor("chat", 999);
    expect(q.limit).toBe(0);
    expect(q.exhausted).toBe(false);
    expect(q.remaining).toBe(Number.POSITIVE_INFINITY);
    expect(quotaMessage(q)).toBe("Disponible");
  });

  it("acción con tope: restante = límite - usado", () => {
    const q = quotaFor("generation", 3);
    expect(q.limit).toBe(actionLimit("generation"));
    expect(q.used).toBe(3);
    expect(q.remaining).toBe(q.limit - 3);
    expect(q.exhausted).toBe(false);
  });

  it("marcar exhausta al llegar al tope", () => {
    const limit = actionLimit("generation");
    const q = quotaFor("generation", limit);
    expect(q.exhausted).toBe(true);
    expect(quotaMessage(q)).toBe("Consume más de tu límite mensual");
  });

  it("usado negativo se normaliza a 0", () => {
    const q = quotaFor("generation", -5);
    expect(q.used).toBe(0);
    expect(q.remaining).toBe(q.limit);
  });

  it("acción desconocida = ilimitada", () => {
    expect(quotaFor("nada", 0).limit).toBe(0);
  });
});