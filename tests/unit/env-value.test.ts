import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import bcrypt from "bcryptjs";
// @ts-expect-error - módulo .mjs sin tipos
import { escapeEnvValue, formatEnvAssignment } from "../../lib/env-value.mjs";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

/**
 * Regresión: Next.js carga los .env con dotenv-expand, así que un hash
 * bcrypt con `$` pegado tal cual llega mutilado al servidor y el login
 * falla con CredentialsSignin sin error visible.
 */
describe("valores sensibles en .env", () => {
  it("escapa los $ del hash bcrypt", () => {
    const hash = bcrypt.hashSync("test-pass", 4);
    const escaped = escapeEnvValue(hash);
    expect(escaped).not.toBe(hash);
    expect(escaped).toContain("\\$2b\\$");
  });

  it("el hash escapado llega intacto al proceso que carga .env.local", () => {
    const hash = bcrypt.hashSync("test-pass", 4);
    const dir = mkdtempSync(join(tmpdir(), "astra-env-"));
    writeFileSync(
      join(dir, ".env.local"),
      `${formatEnvAssignment("ADMIN_PASSWORD_HASH", hash)}\n`,
      "utf8",
    );

    const before = process.env.ADMIN_PASSWORD_HASH;
    const beforeMode = process.env.NODE_ENV;
    delete process.env.ADMIN_PASSWORD_HASH;
    // En modo "test" @next/env ignora .env.local: forzamos development.
    process.env.NODE_ENV = "development";
    try {
      loadEnvConfig(dir, true);
      expect(process.env.ADMIN_PASSWORD_HASH).toBe(hash);
      expect(bcrypt.compareSync("test-pass", process.env.ADMIN_PASSWORD_HASH)).toBe(true);
    } finally {
      if (before === undefined) delete process.env.ADMIN_PASSWORD_HASH;
      else process.env.ADMIN_PASSWORD_HASH = before;
      if (beforeMode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = beforeMode;
    }
  });
});
