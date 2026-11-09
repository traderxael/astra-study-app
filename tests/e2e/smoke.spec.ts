import { test, expect } from "@playwright/test";

test("logea, sube txt, pregunta y ve cita", async ({ page }) => {
  await page.goto("/login");
  await page.fill("[name=email]", "estudio@local");
  await page.fill("[name=password]", "test-pass");
  await page.click("button[type=submit]");
  await page.waitForURL("**/chat");
  await page.setInputFiles("[data-testid=file-input]", "tests/fixtures/bio.txt");
  await page.fill("[data-testid=chat-input]", "resumen");
  await page.click("[data-testid=chat-send]");
  await expect(page.locator("[data-testid=citation]")).toBeVisible();
});
