/**
 * Helpers para escribir valores sensibles en archivos `.env`.
 *
 * Next.js carga los `.env` con dotenv-expand: cualquier `$` dentro de un
 * valor se interpreta como referencia a otra variable. Un hash bcrypt
 * (`$2b$10$...`) pegado tal cual queda mutilado (`$2b$10$abc` -> `abc`) y
 * el login falla silenciosamente con `CredentialsSignin`.
 *
 * `escapeEnvValue` escapa los `$` con una barra invertida para que
 * dotenv-expand entregue el valor literal, y `formatEnvAssignment` arma
 * la línea lista para pegar en `.env.local`.
 */

/** Escapa los `$` de un valor para que dotenv-expand no lo expanda. */
export function escapeEnvValue(value) {
  return String(value).replace(/\$/g, "\\$");
}

/** Arma `NOMBRE="valor"` con el valor escapado para dotenv-expand. */
export function formatEnvAssignment(name, value) {
  return `${name}="${escapeEnvValue(value)}"`;
}
