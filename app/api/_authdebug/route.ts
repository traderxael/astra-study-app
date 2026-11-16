// TEMPORAL (Task 9 debug): diagnostica la config de auth sin exponer secretos.
// Se borra después de verificar.
export const dynamic = "force-dynamic";
export async function GET() {
  const h = process.env.ADMIN_PASSWORD_HASH?.trim() ?? "";
  const e = process.env.ADMIN_EMAIL?.trim() ?? "";
  const db = process.env.DATABASE_URL ? "set" : "missing";
  const nt = process.env.NEXTAUTH_SECRET ? "set" : "missing";
  const nu = process.env.NEXTAUTH_URL ?? "";
  return Response.json({
    adminEmail: e,
    hashLen: h.length,
    hashStartsWith: h.slice(0, 4),
    hashHasBackslash: h.includes("\\"),
    hashHasDollar: h.includes("$"),
    hashHasQuotes: h.includes('"'),
    databaseUrl: db,
    nextauthSecret: nt,
    nextauthUrl: nu,
    authTrustHost: process.env.AUTH_TRUST_HOST ?? "",
  });
}