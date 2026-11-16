// TEMPORAL (Task 9 debug): prueba la conexión a la DB desde el runtime de Vercel.
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { prisma } = await import("../../../lib/db");
    const subjects = await prisma.subject.findMany({ select: { id: true, name: true, userId: true } });
    const users = await prisma.user.findMany({ select: { id: true, email: true } });
    return Response.json({ ok: true, subjects, users });
  } catch (e) {
    return Response.json({ ok: false, error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}