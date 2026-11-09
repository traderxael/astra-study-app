import { defineConfig } from "@playwright/test";

/**
 * Smoke E2E (Task 8). Requiere app corriendo + DB con seed:
 *   docker compose up -d && npx prisma migrate deploy
 *   ADMIN_EMAIL=estudio@local ADMIN_PASSWORD=test-pass node scripts/seed-admin.mjs
 *   OPENAI_API_KEY=... npm run dev   (o stub local vía OPENAI_BASE_URL)
 * En CI: levantar el servicio web (externo o webServer) y correr
 * `npm run test:e2e`. `baseURL` se puede fijar con E2E_BASE_URL.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
  },
});
