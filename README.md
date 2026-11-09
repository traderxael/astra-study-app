# Astra Study

App personal y privada de estudio: subes tu propio material (.txt o .pdf
digital), el tutor responde con citas a los fragmentos, y generas
flashcards y quizzes sobre ese material. Una sola persona, sin registro
público.

## Desarrollo local

Requisitos: Node 20+, Docker (para Postgres local).

```bash
docker compose up -d                 # Postgres local en :5432
cp .env.example .env.local           # ajusta valores (nunca commitees .env.local)
npx prisma migrate deploy            # o: npx prisma db push
ADMIN_EMAIL=estudio@local ADMIN_PASSWORD=test-pass node scripts/seed-admin.mjs
npm run dev                          # http://localhost:3000
```

El seed genera el hash bcrypt (cópialo a `ADMIN_PASSWORD_HASH` en
`.env.local`) y crea la fila `User` + la materia por defecto
(`ADMIN_DEFAULT_SUBJECT`, por defecto "Biología"). La sesión usa el
userId `"admin"` (ver `lib/auth.ts`): la auth es env-based
(`ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH`), no hay tabla de usuarios con
contraseña.

Sin Supabase, el storage cae a disco local bajo `STORAGE_DIR`
(por defecto `.data/uploads`); sin `OPENAI_API_KEY`, las rutas de IA
responden 503 degradado `{ error: "IA no configurada" }`.

## Smoke E2E

```bash
npm run test:e2e   # tests/e2e/smoke.spec.ts con Playwright
```

El smoke logea con `estudio@local` / `test-pass`, sube
`tests/fixtures/bio.txt` vía `data-testid=file-input`, pregunta
"resumen" y espera la cita (`data-testid=citation`).

Prerrequisitos para PASS completo:

1. App corriendo (`npm run dev`) con DB migrada y seed aplicado.
2. `OPENAI_API_KEY` válida **o** un stub compatible con OpenAI vía
   `OPENAI_BASE_URL` (el proveedor acepta cualquier endpoint
   `/v1/chat/completions` con SSE; un stub local de CI vale).
3. Browsers de Playwright instalados (una vez):
   `npx playwright install chromium`.

`E2E_BASE_URL` cambia el `baseURL` (p. ej. contra la URL privada
desplegada). Sin los prerrequisitos 1–2 el test falla en login o en el
paso de chat/IA, no por la app.

## Deploy privado (Vercel + Supabase)

Arquitectura: front+API en Vercel (Next.js, HTTPS automático con
certificado Let's Encrypt en `*.vercel.app` o dominio propio), datos en
Supabase Postgres y Storage (también HTTPS). Sin servidor propio;
barato por diseño (free tier de ambos; el costo real es el consumo de
`gpt-4o-mini` en OpenAI).

Checklist:

| # | Paso | Detalle / comando |
|---|------|-------------------|
| 1 | Crear proyecto en Supabase | Nuevo proyecto → región cercana. Anota **Project URL** y credenciales de Postgres. |
| 2 | Crear bucket de Storage | Bucket `files` (el de `SUPABASE_BUCKET`) en **Storage**. |
| 3 | Fijar `DATABASE_URL` | URL de conexión de Postgres con `?sslmode=require` (ver `.env.example`). |
| 4 | Migrar | `DATABASE_URL=... npx prisma migrate deploy` desde tu máquina o en CI. |
| 5 | Subir a Vercel | Importa el repo en Vercel → framework Next.js (sin build custom). |
| 6 | Variables de entorno (Vercel) | `DATABASE_URL`, `NEXTAUTH_SECRET` (genera: `openssl rand -base64 32`), `NEXTAUTH_URL=https://TU-URL-PRIVADA`, `OPENAI_API_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. |
| 7 | Sembrar el admin | En local con la `DATABASE_URL` de Supabase: `ADMIN_EMAIL=estudio@local ADMIN_PASSWORD=... node scripts/seed-admin.mjs` y pega el hash impreso en `ADMIN_PASSWORD_HASH` (Vercel). |
| 8 | Deploy | `vercel --prod` o push a la rama configurada. |
| 9 | Verificar | Abre `https://TU-URL-PRIVADA/login` desde cualquier navegador → login → sube un .txt en `/chat` → pregunta → cita visible. Opcional: `E2E_BASE_URL=https://TU-URL-PRIVADA npm run test:e2e`. |
| 10 | Acceso privado | No hay registro público: el login es una sola cuenta. No compartas la URL; si quieres, protégela además con Vercel Deployment Protection (password) en **Settings → Deployment Protection**. |

Costo y backups:

- **Costo:** Vercel Hobby y Supabase free cubren el uso personal; el
  gasto realista es OpenAI (`gpt-4o-mini`, respuestas cortas sobre tus
  chunks): céntimos por sesión de estudio. Sin tráfico público, el
  free tier sobra.
- **Backup:** Supabase free incluye backups diarios automáticos (7 días
  de retención). Para descargas manuales:
  `pg_dump "$DATABASE_URL" > astra-backup-$(date +%F).sql`
  (requiere `postgresql-client` local).

## Variables de entorno

Ver [`.env.example`](.env.example) para la lista completa con valores
finales: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`,
`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD_HASH`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_BUCKET`, `STORAGE_DIR`.

## Diseño

Tema propio sobrio: una columna, tipografía del sistema, paleta neutra
con acento azul (`app/globals.css`), responsive a partir de 640 px.
Diseñado para usarse a pantalla completa en el navegador, sin instalar
nada.
