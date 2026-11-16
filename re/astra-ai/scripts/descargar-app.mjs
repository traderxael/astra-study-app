#!/usr/bin/env node
// Re-descarga la app de Astra AI y (opcionalmente) reimprime el mapa de superficie.
//
//   node scripts/descargar-app.mjs          -> baja index.html, manifest y los chunks
//   node scripts/descargar-app.mjs --grep   -> ademas imprime endpoints, trackers y campos
//
// No requiere dependencias: solo fetch (Node 18+).

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://app.astra-ai.co";
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "app");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";

const get = async (path) => {
  const res = await fetch(BASE + path, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res;
};

await mkdir(join(OUT, "chunks"), { recursive: true });

const html = await (await get("/es-MX")).text();
await writeFile(join(OUT, "index.html"), html);

const manifest = await (await get("/manifest.webmanifest")).text();
await writeFile(join(OUT, "manifest.webmanifest"), manifest);

const urls = new Set(
  [...html.matchAll(/src="(\/_next\/static\/immutable\/[^"]+\.js)"/g)].map((m) => m[1])
);
console.log(`chunks referenciados en el HTML: ${urls.size}`);

let blobs = [];
for (const u of urls) {
  try {
    const text = await (await get(u)).text();
    blobs.push([u, text]);
    await writeFile(join(OUT, "chunks", u.split("/").pop()), text);
  } catch (e) {
    console.warn("  fallo", u, e.message);
  }
}

// Turbopack anida chunks: dos rondas de descubrimiento.
for (let round = 0; round < 2; round++) {
  const next = new Set();
  for (const [, text] of blobs) {
    for (const m of text.matchAll(/"(\/_next\/static\/immutable\/chunks\/[^"]+\.js)"/g)) {
      if (!urls.has(m[1])) next.add(m[1]);
    }
  }
  if (!next.size) break;
  for (const u of next) {
    urls.add(u);
    try {
      const text = await (await get(u)).text();
      blobs.push([u, text]);
      await writeFile(join(OUT, "chunks", u.split("/").pop()), text);
    } catch (e) {
      console.warn("  fallo", u, e.message);
    }
  }
}
console.log(`chunks descargados: ${blobs.length}`);

if (process.argv.includes("--grep")) {
  const all = blobs.map(([, t]) => t).join("\n");
  const count = (re) => (all.match(re) || []).length;
  const uniq = (re, cap = 30) => [...new Set(all.match(re) || [])].slice(0, cap);

  console.log("\n== endpoints ==");
  uniq(/["'](\/api\/[a-zA-Z0-9._/-]{3,60})["']/g).forEach((u) => console.log("  " + u));
  console.log("\n== hosts ==");
  uniq(/https?:\/\/([a-zA-Z0-9.-]{4,60}\.[a-z]{2,10})/g, 40).forEach((h) => console.log("  " + h));
  console.log("\n== trackers ==");
  for (const k of [
    "sentry", "posthog", "singular", "segment", "amplitude", "mixpanel",
    "gtag", "google-analytics", "googletagmanager", "doubleclick", "facebook",
    "tiktok", "stripe", "vercel", "hotjar", "clarity",
  ]) {
    const n = count(new RegExp(k, "gi"));
    if (n) console.log(`  ${String(n).padStart(5)}  ${k}`);
  }
  console.log("\n== claves publicas de telemetry ==");
  uniq(/(phc_[A-Za-z0-9]{20,}|[0-9a-f]{32}|G-[A-Z0-9]{6,14}|GTM-[A-Z0-9]{4,8}|astra_ai_[0-9a-f]{8})/g, 20).forEach(
    (k) => console.log("  " + k)
  );
  console.log("\n== campos de datos personales ==");
  uniq(/\b(user_email|user_name|user_info|user_id|email|timezone|device_id|screen_width|screen_height|utm_source|utm_campaign|prompt)\b/g, 25).forEach(
    (k) => console.log("  " + k)
  );
}
console.log("\nlisto ->", OUT);
