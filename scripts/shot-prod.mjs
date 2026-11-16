/**
 * Captura de la app desplegada (Task 10).
 *
 * Uso:
 *   node scripts/shot-prod.mjs [url] [outdir]
 *
 * Login con ADMIN_EMAIL/ADMIN_PASSWORD y screenshots de /dashboard, /material
 * y /chat. Requiere browsers de Playwright (`npx playwright install chromium`).
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const base = (process.argv[2] ?? "https://astra-study-app.vercel.app").replace(/\/$/, "");
const outDir = process.argv[3] ?? path.join(process.cwd(), "docs", "capturas");
const email = process.env.ADMIN_EMAIL ?? "estudio@local";
const password = process.env.ADMIN_PASSWORD ?? "test-pass";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const shots = [
  ["login", "/login", false],
  ["dashboard", "/dashboard", true],
  ["material", "/material", true],
  ["chat", "/chat", true],
];

await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 }).catch(() => {});

let ok = 0;
for (const [name, route] of shots) {
  if (route !== "/login") {
    await page.goto(`${base}${route}`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(2500);
  }
  const file = path.join(outDir, `prod-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ✓ ${file}`);
  ok += 1;
}

// Resumen de texto para verificar sin abrir las imagenes.
await page.goto(`${base}/dashboard`, { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(2000);
const text = await page.evaluate(() => document.body?.innerText ?? "");
console.log("\n--- dashboard (texto) ---\n" + text.slice(0, 900));
console.log(`\n${ok} capturas en ${outDir}`);
await browser.close();