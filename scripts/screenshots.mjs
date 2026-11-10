// Captura pantallas de la app (login -> chat -> fichas -> práctica -> dashboard).
// Uso: node scripts/screenshots.mjs [directorio]
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const outDir = process.argv[2] ?? ".data/screenshots";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(`${BASE}/login`);
await page.screenshot({ path: `${outDir}/01-login.png`, fullPage: true });

await page.fill("[name=email]", "estudio@local");
await page.fill("[name=password]", "test-pass");
await page.click("button[type=submit]");
await page.waitForURL("**/chat");
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/02-chat.png`, fullPage: true });

for (const [path, name] of [
  ["/material", "03-material"],
  ["/flashcards", "04-fichas"],
  ["/practice", "05-practica"],
  ["/dashboard", "06-dashboard"],
]) {
  await page.goto(`${BASE}${path}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
}

await browser.close();
console.log(`Capturas guardadas en ${outDir}`);
