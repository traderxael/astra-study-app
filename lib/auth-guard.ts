import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "./auth";

/**
 * Guarda de rutas privadas (Review Focus 5).
 *
 * Lanza redirect a /login cuando no hay sesión válida (sin datos filtrados).
 * Testeable con mocks de `auth()` sin DB real (R-01).
 */
export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session;
}
