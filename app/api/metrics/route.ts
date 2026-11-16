import { requireSession } from "../../../lib/auth-guard";
import { prisma } from "../../../lib/db";
import { getMetrics } from "../../../lib/metrics";
import { gamification } from "../../../lib/gamification";
import { quotaFor, quotaMessage } from "../../../lib/quota";

/**
 * GET /api/metrics?subjectId= — snapshot de progreso para clientes
 * (Task 9). No-cache: el dashboard y futuros widgets consumen esto en vez
 * de reimplementar agregaciones. Misma fuente que el dashboard
 * (lib/metrics → gamification → quota).
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireSession();
  const userId = session.user!.id;
  const subjectId = new URL(request.url).searchParams.get("subjectId");
  if (!subjectId?.trim()) {
    return Response.json({ error: "falta subjectId" }, { status: 400 });
  }

  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!subject || subject.userId !== userId) {
    return Response.json({ error: "materia no encontrada" }, { status: 404 });
  }

  const metrics = await getMetrics(userId, subjectId, subject.name);
  const g = gamification(metrics);
  const quota = quotaFor("generation", metrics.breakdown.generation);

  return Response.json(
    {
      subject: { id: subject.id, name: subject.name },
      streak: metrics.streak,
      sessions: metrics.sessions,
      attempts: metrics.attempts,
      accuracy: metrics.accuracy,
      docs: metrics.docs,
      breakdown: metrics.breakdown,
      lastActivity: metrics.lastActivity,
      gamification: g,
      quota: {
        action: "generation",
        label: "Generaciones con IA",
        limit: quota.limit,
        used: quota.used,
        remaining: quota.remaining,
        exhausted: quota.exhausted,
        message: quotaMessage(quota),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}