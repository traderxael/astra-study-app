# Procedencia y licencias

## Qué es cada cosa

| Ruta | Origen | Licencia / permiso |
|---|---|---|
| `ANALISIS.md` | Trabajo propio de este análisis | Este repositorio |
| `datos/*.json` | Derivado del análisis (heurísticas sobre el bundle y captura de red) | Este repositorio |
| `capturas/*.png` | Capturas de pantalla de la app funcionando en esta máquina | Uso de estudio / documentación |
| `app/index.html`, `app/manifest.webmanifest` | Descargados de `https://app.astra-ai.co/` | Propiedad de Astra AI / Moonshot |
| `app/chunks/*` (39 archivos, 2 MB) | Bundle de producción compilado con Turbopack | **Propiedad de Astra AI / Moonshot** |
| `scripts/descargar-app.mjs` | Escrito para este análisis | Este repositorio |

## Aviso importante sobre `app/chunks/`

El bundle minificado es **código propietario de un producto comercial**. Se incluye acá porque el
análisis lo necesita y porque el repo es de uso personal de estudio.

- Si este repo se hace público, se está redistribuyendo código de terceros sin licencia.
- El bundle **no** contiene secretos ni claves de servidor (verificado: solo hay keys públicas de
  telemetría), pero eso no lo convierte en código libre.
- Para retirarlo: `git rm -r re/astra-ai/app/chunks` y commit.
- El script `scripts/descargar-app.mjs` vuelve a bajar todo, así que el material es reproducible
  sin necesidad de versionar el bundle.

## Datos personales

Los archivos de `datos/` y `capturas/` se generaron en una sesión autenticada del propio usuario de
este repositorio. **No se incluyen** cookies, tokens, session ids, emails ni identificadores de
dispositivo: los identificadores de terceros que aparecen (device id de Singular, `sdid`) son los
del navegador de análisis, no los de una persona real, y se dejan solo como ejemplo del formato
del evento.

No se incluye ningún archivo `.har` con cabeceras autenticadas.
