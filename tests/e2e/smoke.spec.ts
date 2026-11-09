import { test, expect } from "@playwright/test";

test("logea, sube txt, pregunta y ve cita", async ({ page }) => {
  await page.goto("/login");
  await page.fill("[name=email]", "estudio@local");
  await page.fill("[name=password]", "test-pass");
  await page.click("button[type=submit]");
  await page.waitForURL("**/chat");
  // Espera a que la ingestión del archivo persista (POST /api/subjects/:id/files
  // con 201) antes de preguntar: si no, el chat puede recuperar chunks antes
  // de que existan y responder sin cita (race).
  const uploaded = page.waitForResponse(
    (res) =>
      res.url().includes("/api/subjects/") &&
      res.url().endsWith("/files") &&
      res.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.setInputFiles("[data-testid=file-input]", "tests/fixtures/bio.txt");
  const uploadRes = await uploaded;
  expect(uploadRes.status()).toBe(201);
  await expect(page.getByText("Subiendo…")).toBeHidden({ timeout: 10_000 });
  await page.fill("[data-testid=chat-input]", "resumen");
  await page.click("[data-testid=chat-send]");
  // Timeout explícito >5s por la latencia de la IA (streaming + citas).
  await expect(page.locator("[data-testid=citation]")).toBeVisible({ timeout: 60_000 });
});
