// Seed del admin único (un solo usuario privado, sin registro público).
//
// Uso:
//   node scripts/seed-admin.mjs
//
// Lee ADMIN_EMAIL (def: estudio@local) y ADMIN_PASSWORD (def: test-pass),
// genera el hash bcrypt y lo deja listo para ADMIN_PASSWORD_HASH en .env.
// Cuando Prisma + DATABASE_URL estén disponibles (Task 3) hace upsert del
// usuario. Nunca imprime la contraseña en claro más que como default local.
import bcrypt from "bcryptjs";
import { formatEnvAssignment } from "../lib/env-value.mjs";

const email = process.env.ADMIN_EMAIL ?? "estudio@local";
const password = process.env.ADMIN_PASSWORD ?? "test-pass";

const hash = bcrypt.hashSync(password, 10);

console.log(`Admin email: ${email}`);
// La línea va escapada (los `$` del hash bcrypt se expandirían al cargar
// el .env y el login fallaría con CredentialsSignin). Pegala tal cual.
console.log(formatEnvAssignment("ADMIN_PASSWORD_HASH", hash));
console.log("Copia esa línea a tu .env.local (solo servidor).");

let PrismaClient;
try {
  // Prisma llega en Task 3; si aún no está, solo se imprime el hash (éxito).
  ({ PrismaClient } = await import("@prisma/client"));
} catch {
  console.log("Prisma/DB aún no disponible (Task 3): hash listo para ADMIN_PASSWORD_HASH.");
  process.exit(0);
}

const prisma = new PrismaClient();
try {
  if (process.env.DATABASE_URL) {
    // La auth real es env-based (ADMIN_EMAIL / ADMIN_PASSWORD_HASH,
    // lib/auth.ts, userId de sesión "admin"); la fila User es el
    // registro canónico para deploy. Sin passwordHash en el schema.
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: email },
    });
    // Materia por defecto para que /chat renderice el panel sin pasos extra
    // (el smoke E2E logea y espera el ChatPanel con file-input). OJO: el
    // scope es el userId de sesión ("admin", ver lib/auth.ts), no el id
    // cuid de la fila User.
    const subjectName = process.env.ADMIN_DEFAULT_SUBJECT ?? "Biología";
    const existing = await prisma.subject.findFirst({
      where: { userId: "admin", name: subjectName },
    });
    if (!existing) {
      await prisma.subject.create({
        data: { userId: "admin", name: subjectName },
      });
    }
    console.log(`Usuario ${email} creado/actualizado en la base de datos.`);
  } else {
    console.log("Sin DATABASE_URL: hash listo para ADMIN_PASSWORD_HASH.");
  }
} catch (err) {
  console.error(`Error creando admin en DB: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
