// Crea la base de datos local de la app (astra_study) contra el Postgres local.
// Uso: node scripts/create-db.mjs
import pg from "pg";

const url = process.env.DATABASE_URL ?? "postgresql://astra:astra@localhost:5432/astra_study?schema=public";
const target = new URL(url);
const dbName = target.pathname.replace(/^\//, "") || "astra_study";

const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";

const client = new pg.Client({ connectionString: adminUrl.toString() });
try {
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rowCount > 0) {
    console.log(`La base "${dbName}" ya existe.`);
  } else {
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`Base "${dbName}" creada.`);
  }
} catch (err) {
  console.error(`No se pudo crear la base: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
