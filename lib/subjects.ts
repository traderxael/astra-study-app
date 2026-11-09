import type { Subject } from "@prisma/client";
import { prisma } from "./db";

export type { Subject };

/**
 * Crea una materia para el dueño dado (Task 3).
 *
 * `userId` es el id de sesión (Task 2: 'admin' para el único usuario
 * privado). Solo servidor.
 */
export async function createSubject(
  userId: string,
  name: string,
): Promise<Subject> {
  return prisma.subject.create({ data: { userId, name } });
}

/**
 * Lista solo las materias del dueño dado (scoping por userId).
 * Orden cronológico ascendente. Solo servidor.
 */
export async function listSubjects(userId: string): Promise<Subject[]> {
  return prisma.subject.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}
