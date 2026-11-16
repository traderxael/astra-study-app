// Levanta Postgres embebido ya inicializado (Task 9).
// Uso: node scripts/dev-db.mjs   (si .data/pg ya existe, solo hace start)
import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const dataDir = process.env.PG_DATA_DIR ?? join(process.cwd(), ".data", "pg");
mkdirSync(dataDir, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "astra",
  password: "astra",
  port: 5432,
  persistent: true,
});

const alreadyInit = existsSync(join(dataDir, "PG_VERSION"));
console.log(alreadyInit ? "reutilizando data dir" : "inicializando data dir", dataDir);

try {
  if (!alreadyInit) await pg.initialise();
  await pg.start();
  console.log("POSTGRES_READY 127.0.0.1:5432 user=astra pass=astra");
} catch (e) {
  console.error("POSTGRES_FAIL", e?.message ?? e);
  process.exit(1);
}
// Mantener vivo.
setInterval(() => {}, 1 << 30);