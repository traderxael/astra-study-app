# Ingeniería inversa de Astra AI (`app.astra-ai.co`)

> Análisis estático + dinámico de la PWA instalada en Brave en esta máquina.
> Todo con toolchain libre. **Sin credenciales ni tokens en este dossier.**

---

## 1. Qué es

**Astra AI** — *"Tu tutor de IA 24/7 para todas las materias"*.
Producto de preparación del **PAES** (examen de acceso a la universidad en Chile), con foco en
*Historia y Ciencias Sociales* (prueba electiva) y con una ruta de matemáticas.

App instalada como **PWA** en Brave:

```
Escritorio\Astra AI.lnk
  → C:\Program Files\BraveSoftware\Brave-Browser\Application\chrome_proxy.exe
      --profile-directory=Default --app-id=cnpmobboefeaffhibiackainejnmplpd
```

Manifest (descargado del propio sitio):

```json
{"id":"https://app.astra-ai.co/","name":"Astra AI","short_name":"Astra AI",
 "description":"The most advanced AI math tutor","start_url":"/onboarding",
 "scope":"https://app.astra-ai.co/","display":"standalone",
 "background_color":"#0d0d0d","theme_color":"#0d0d0d",
 "categories":["education"],"dir":"ltr","lang":"en",
 "launch_handler":{"client_mode":["navigate-existing","auto"]}}
```

Funciones visibles en la app: cuestionarios, **examen oral simulado**, examen escrito simulado,
tarjetas de memoria, podcast, duelos, rachas, insignias y un tutor conversacional.
Modelo de negocio: suscripción ("Aprovecha más Astra / Comprar") con **cuota mensual de uso**.

---

## 2. Stack detectado (del bundle, 39 chunks / 2.01 MB)

| Capa | Tecnología |
|---|---|
| Framework | **Next.js 15** (App Router) compilado con **Turbopack** |
| API | **tRPC v10** (`/api/trpc/...`, batching `?batch=1`) |
| Versión de API | `apiVersion: 7` |
| Auth | **Better Auth** (`/api/auth/get-session`) |
| Telemetría propia | pipeline **"evlog"** → `POST /api/evlog/ingest` |
| CDN | `cdn.astra-ai.co` |
| Storage | **Cloudflare R2** (`pub-52ddbfade8b641de80810e91dd746ae0.r2.dev`) |
| Deploy | **Vercel** (`va.vercel-scripts.com`, `POST /api/e`) |
| Locale | `es-MX` |

No se encontró **ningún token ni secret de servidor** en el bundle: solo claves públicas de telemetría.

---

## 3. Superficie de API (procedimientos tRPC descubiertos en runtime)

**Perfil y cuenta**
`profile.getProfile` · `profile.updateDeviceIdentifiers` · `auth.saveYourAccount` · `marketingConsent.get`

**Contenido y tutor**
`artifacts.getStateByChat` · `appVersion.checkForUpdates` (input: `clientVersion`, `apiVersion`)

**Producto y upsell**
`subscriptions.getOwn` · `usage.getActionAccessStatus` · `usage.getSubscriptionTopUpClaimStatus` ·
`limits.getOwn` · `firstTimePromotion.featureFirstTimePromotionInfo` ·
`firstTimePromotion.activeFirstTimePromotionInfo` · `banners.list` · `productUpdates.feed`

**Gamificación**
`streak.getStreak` · `streak.getTodayStatus` · `stars.summary` · `badges.list` ·
`duel.today` · `duel.replyNotice` · `challenges.replyNotice`

**Social y soporte**
`subjects.list` · `userNotifications.getPendingNotifications` · `support.getStaffConversationSummary`

**Archivos** — `file.upload`

Inputs que el cliente envía: `timezone`, `platform`, `locale`, `publicOnly`, `pageTarget`,
`clientVersion`, `apiVersion`, y flags como `instructor.chat-message`.
Acciones de uso monitoreadas: `transcription`, `oral-tutor-chat`.

---

## 4. Qué sale de tu navegador

### 4.1 Pipeline propio "evlog" (primera parte)

`POST /api/evlog/ingest` con batching de **10 eventos**, backoff exponencial (1 s → 30 s),
drenaje por `visibilitychange`/`pagehide` y envío por `navigator.sendBeacon`.

Campos del payload encontrados en el código:

```
event  eventName  payload  timestamp  channel  environment  level
service  href
user_email  user_id  user_name  user_info      <-- PII
```

> **El pipeline propio manda email, nombre e id de usuario** junto a cada evento. No es un SDK
> externo: es código de ellos, y el endpoint es de ellos.

### 4.2 Trackers externos

| SDK | Identificador | Qué envía |
|---|---|---|
| **Sentry** | org `4507621849235456`, proyecto `4507621918376016`, key `157672002bf72e1c8cfdb41f3242aa6d`, release `63f64d08…` | errores, breadcrumbs, **session replay**, reports de CSP (`/security/`) |
| **PostHog** | `f7ad4b3a46642aa720687b4c4659b475` | eventos de producto |
| **Singular** | `astra_ai_9becea26` / `com.astra-ai.web` | device id (`sdid`), usuario (`u`), atribución (`s`, `ecid`), timezone, resolución de pantalla, SO, URL |
| **Google Analytics 4** | `G-BYYKE1LW9M` | métricas + advertising signals |
| **Google Tag Manager** | `GTM-WJ5ZPX4V` | orquestación de tags (incluye Google Ads / DoubleClick) |
| **Vercel Analytics** | `/api/e` | web vitals y eventos |

Permitidos por la CSP: Google Ads/DoubleClick, Facebook, **TikTok**, Singular, Trusted Shops,
GeoGebra, YouTube, **Stripe**, Vercel, jsdelivr, cdnjs.

**Dato fino:** el bundle incluye su propia regex de bloqueo de trackers
(`/google-analytics\.com/i, /googleadservices\.com/i, /doubleclick\.net/i, /hotjar\.com/i, /clarity\.ms/i`)
→ **Hotjar y Clarity no se cargan**. Y en runtime, Brave bloqueó Sentry y Singular con
`ERR_BLOCKED_BY_CLIENT`: en esta máquina la telemetría de terceros no sale, pero el `evlog` propio
sí (va a su propio dominio).

### 4.3 Cookies de primera parte

`astra-anon-id` · `astra-timezone` · `app_attribution_data` · `onboarding-complete` ·
`user-routing-snapshot` · `Next-Locale` · `Next-Country` · `better-auth.last_used_login_method` ·
`ph_phc_…_posthog` · `g_state`

---

## 5. Hallazgos técnicos

1. **Entornos administrativos filtrados en el bundle.** Turbopack deja los reemplazos de env en el
   cliente: aparecen `admin.astra-ai.co`, `sadmin.astra-ai.co`, `staging.astra-ai.co` y el bucket
   R2 con su URL pública de dev. No es una vulnerabilidad por sí solo, pero es superficie que
   no debería estar en producción.
2. **PII en eventos propios.** `user_email`, `user_name`, `user_info` viajan en cada evento del
   `evlog`, no solo en las llamadas de cuenta.
3. **Nombre del usuario en la respuesta del tutor** ("¡Listo, axael!"), o sea, la identidad real se
   usa como contexto del modelo.
4. **Cuota mensual** ("Consume más de tu límite mensual") → el uso del tutor se contabiliza en
   servidor y se expone en la UI.
5. **CSP en modo report-only**: los errores de CSP se reportan a Sentry (`sentry_environment=production-csp`),
   es decir, que rompen la CSP a propósito paracollectar datos de seguridad.
6. **Surface de negocio visible en el cliente**: suscripciones, límites, promos de primera vez,
   banners, feeds de updates de producto — todo por tRPC público (autenticado por sesión).
7. **Sin secretos de servidor en el cliente** ✓ (el único "secret" encontrado es la key pública
   de PostHog, que es pública por diseño).

---

## 6. Qué hay en este repositorio

```
re/astra-ai/
├─ ANALISIS.md              este documento
├─ NOTICE.md                procedencia y licencias de lo incluido
├─ datos/mapa.json          mapa machine-readable (stack, tRPC, trackers, datos)
├─ datos/trafico-runtime.json   captura real de red (resumida, sin credenciales)
├─ capturas/                3 capturas de la app funcionando
├─ app/                     espejo de la app descargada del sitio (HTML + manifest + 39 chunks)
└─ scripts/descargar-app.mjs  script para volver a bajar la app y regenerar el mapa
```

Para reproducir el análisis:

```bash
node scripts/descargar-app.mjs        # baja index.html, manifest y los 39 chunks
node scripts/descargar-app.mjs --grep  # imprime endpoints, trackers y campos de datos
```

Para capturar tráfico real:

```bash
mitmdump --listen-host 0.0.0.0 --listen-port 8080 --set hardump=session.har
# en el navegador: proxy 127.0.0.1:8080 (o 10.0.2.2:8080 desde un emulador)
```
