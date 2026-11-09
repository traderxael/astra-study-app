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

const email = process.env.ADMIN_EMAIL ?? "estudio@local";
const password = process.env.ADMIN_PASSWORD ?? "test-pass";

const hash = bcrypt.hashSync(password, 10);

console.log(`Admin email: ${email}`);
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log("Copia ADMIN_PASSWORD_HASH a tu .env (solo servidor, .env.local).");

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
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash: hash },
      create: { email, passwordHash: hash, name: email },
    });
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
