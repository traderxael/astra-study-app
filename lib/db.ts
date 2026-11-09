import { PrismaClient } from "@prisma/client";

/**
 * Singleton de PrismaClient (Task 3).
 *
 * En desarrollo, Next.js recarga módulos con hot reload: reutilizar la
 * instancia global evita agotar el pool de conexiones. Solo servidor.
 */
const globalForPrisma = globalThis as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
