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
 * Falla cerrado: si ADMIN_EMAIL o ADMIN_PASSWORD_HASH faltan o están
 * vacíos (como el placeholder "" de .env.example), verifyCredentials
 * lanza un error explícito de misconfiguración en lugar de aceptar
 * credenciales por defecto. Sin fallbacks en este módulo; los tests
 * fijan sus propias variables de entorno (R-01, sin DB real).
 */

export interface AdminUser {
  id: string;
  email: string;
  name: string;
}

function getExpectedAdminCredentials(): { email: string; hash: string } {
  const email = process.env.ADMIN_EMAIL?.trim();
  const hash = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (!email || !hash) {
    throw new Error(
      "Auth misconfiguration: ADMIN_EMAIL and ADMIN_PASSWORD_HASH must be set (server-only env). Run scripts/seed-admin.mjs.",
    );
  }
  return { email, hash };
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<AdminUser | null> {
  const expected = getExpectedAdminCredentials();

  if (!email || email !== expected.email) return null;
  if (!password) return null;

  const ok = await bcrypt.compare(password, expected.hash);
  if (!ok) return null;

  return { id: "admin", email, name: email };
}

export interface LoginResult {
  status: number;
  user?: AdminUser;
  session?: Session;
}

/**
 * ⚠ TEST-ONLY / SYNTHETIC — no crea una sesión NextAuth real.
 *
 * Helper sintético para tests (R-01): valida credenciales con bcrypt y
 * devuelve 302 + un objeto `session` construido a mano (sin cookies, sin
 * JWT, sin paso por NextAuth) en éxito, 401 en fallo. NUNCA confundir su
 * `session` con una sesión autenticada. La ruta real del navegador usa
 * POST /api/auth/callback/credentials (handlers de abajo).
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
