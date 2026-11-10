// Prueba end-to-end por HTTP: login -> chat -> subir archivo -> preguntar.
// Uso: node scripts/check-e2e.mjs
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const jar = new Map();
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
function saveCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (value === "" || /expires=Thu, 01 Jan 1970/i.test(c)) jar.delete(name);
    else jar.set(name, value);
  }
}
async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...(jar.size ? { cookie: cookieHeader() } : {}),
    },
  });
  saveCookies(res);
  return res;
}

function log(step, ok, extra = "") {
  console.log(`${ok ? "OK  " : "FALLA"} ${step}${extra ? ` -> ${extra}` : ""}`);
  if (!ok) process.exitCode = 1;
}

// 1. CSRF + login
const csrfRes = await req("/api/auth/csrf");
const { csrfToken } = await csrfRes.json();
log("GET /api/auth/csrf", csrfRes.status === 200 && !!csrfToken, `status=${csrfRes.status}`);

const loginRes = await req("/api/auth/callback/credentials", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ csrfToken, email: "estudio@local", password: "test-pass" }).toString(),
});
log(
  "POST login credentials",
  loginRes.status === 200 || loginRes.status === 302,
  `status=${loginRes.status} loc=${loginRes.headers.get("location")} cookies=${[...jar.keys()].join(",")}`,
);

// 2. Pagina privada con sesion
const chatRes = await req("/chat");
const chatHtml = await chatRes.text();
log("GET /chat con sesion", chatRes.status === 200, `status=${chatRes.status}`);
log("ChatPanel renderizado", chatHtml.includes('data-testid="chat-input"'), "");

// 3. Descubrir la materia real (id cuid) desde la base
const { default: pg } = await import("pg");
const dbUrl = process.env.DATABASE_URL ?? "postgresql://astra:astra@localhost:5432/astra_study?schema=public";
const db = new pg.Client({ connectionString: dbUrl });
await db.connect();
const { rows: subjects } = await db.query('SELECT id, name FROM "Subject" WHERE "userId" = $1', ["admin"]);
await db.end();
const subjectId = subjects[0]?.id ?? "admin";
log("Materia disponible", !!subjects[0], `id=${subjectId} nombre=${subjects[0]?.name}`);

// 4. Subir un archivo de texto a la materia por defecto
const body = "La mitosis es el proceso de division celular que produce dos celulas hijas identicas. La fase de profase es la primera, luego la metafase, la anafase y por ultimo la telofase.";
const form = new FormData();
form.append("file", new Blob([body], { type: "text/plain" }), "biologia.txt");
const filesRes = await req(`/api/subjects/${subjectId}/files`, { method: "POST", body: form });
const filesText = await filesRes.status === 200 ? await filesRes.json() : await filesRes.text();
log("POST files", filesRes.status === 201 || filesRes.status === 200, `status=${filesRes.status} ${String(filesText).slice(0, 140)}`);

// 5. Preguntar (degradado sin clave de IA, con citas si hay material)
const chatPost = await req("/api/chat", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ subjectId, message: "¿que es la mitosis?", stream: false }),
});
const chatText = await chatPost.text();
log("POST /api/chat", chatPost.status === 200 || chatPost.status === 503, `status=${chatPost.status} ${chatText.slice(0, 160)}`);

// 6. Historial
const histRes = await req(`/api/chat?subjectId=${subjectId}`);
log("GET /api/chat (historial)", histRes.status === 200, `status=${histRes.status}`);

// 7. Progreso
const progRes = await req(`/api/progress?subjectId=${subjectId}`);
log("GET /api/progress", progRes.status === 200, `status=${progRes.status} ${(await progRes.text()).slice(0, 120)}`);

// 8. Fichas y quiz (degradado sin clave)
const fcRes = await req("/api/flashcards", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ subjectId }),
});
log("POST /api/flashcards", fcRes.status === 200 || fcRes.status === 503, `status=${fcRes.status}`);

const quizRes = await req("/api/quiz", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ subjectId, n: 5 }),
});
log("POST /api/quiz", quizRes.status === 200 || quizRes.status === 503, `status=${quizRes.status}`);
