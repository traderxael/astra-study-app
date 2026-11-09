import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // El smoke E2E (Playwright) vive en tests/e2e: fuera de vitest.
    exclude: ["node_modules", "tests/e2e/**"],
  },
});
