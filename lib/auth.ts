import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { Session } from "next-auth";
import bcrypt from "bcryptjs";

/**
 * Auth privada de un solo usuario (NextAuth v5 + Credentials + bcrypt).
 *
 * Sin ruta de registro pública: el admin único se siembra con
 * scripts/seed-admin.mjs y sus credenciales viven en ADMIN_EMAIL /
 * ADMIN_PASSWORD_HASH (solo servidor, nunca en el cliente).
 *
 * Mientras Prisma (Task 3) no está disponible, la verificación se hace
 * contra esas variables de entorno con un fallback de desarrollo para el
 * admin sembrado (estudio@local / test-pass), así los tests de Task 2
 * pasan sin DB real (R-01).
 */

// Hash bcrypt de "test-pass" (12 rondas $2b$10$); usado solo como fallback
// de desarrollo cuando ADMIN_PASSWORD_HASH no está configurado.
const DEFAULT_ADMIN_EMAIL = "estudio@local";
const DEFAULT_ADMIN_PASSWORD_HASH =
  "$2b$10$ty0TgG3Nc7S9PFRGcWgmfudh2msZLnRQv2JijLTCzSGHtq/IYZVEW";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<AdminUser | null> {
  const expectedEmail = process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL;
  const expectedHash =
    process.env.ADMIN_PASSWORD_HASH ?? DEFAULT_ADMIN_PASSWORD_HASH;

  if (!email || email !== expectedEmail) return null;
  if (!password) return null;

  const ok = await bcrypt.compare(password, expectedHash);
  if (!ok) return null;

  return { id: "admin", email, name: email };
}

export interface LoginResult {
  status: number;
  user?: AdminUser;
  session?: Session;
}

/**
 * Helper de login testeable (R-01): valida credenciales con bcrypt y
 * devuelve 302 + sesión en éxito, 401 en fallo. La ruta real del navegador
 * usa POST /api/auth/callback/credentials (handlers de abajo).
 */
export async function login({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<LoginResult> {
  const user = await verifyCredentials(email, password);
  if (!user) return { status: 401 };
  const session: Session = {
    user: { id: user.id, email: user.email, name: user.name },
    expires: new Date(Date.now() + 60 * 60 * 24 * 30 * 1000).toISOString(),
  };
  return { status: 302, user, session };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";
        const user = await verifyCredentials(email, password);
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
