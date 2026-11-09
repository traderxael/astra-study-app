/**
 * POST /api/ai/summarize — resumen de material por tema (Task 5).
 *
 * Mismo contrato degradado que POST /api/chat (Review Focus 3):
 * 503 { error: 'IA no configurada' } sin clave (nunca 500, nunca header
 * con la clave), 503 { error: 'IA no disponible' } ante fallos del
 * proveedor, 404 materia ajena/inexistente, 400 body inválido.
 * Con clave: 200 { summary, citations } vía summarize(). Sin material:
 * 200 con el mensaje "sin material" y citations [] (sin llamar a la IA).
 */
import { requireSession } from "../../../../lib/auth-guard";
import { prisma } from "../../../../lib/db";
import { isAiConfigured, AiNotConfiguredError, AiRateLimitError, AiUpstreamError } from "../../../../lib/ai/provider";
import { summarize } from "../../../../lib/ai/tutor";

export async function POST(request: Request): Promise<Response> {
  const session = await requireSession();
  const userId = session.user!.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { subjectId, topic } = (body ?? {}) as {
    subjectId?: unknown;
    topic?: unknown;
  };
  if (typeof subjectId !== "string" || !subjectId.trim() ||
      typeof topic !== "string" || !topic.trim()) {
    return Response.json(
      { error: "falta subjectId o topic" },
      { status: 400 },
    );
  }

  if (!isAiConfigured()) {
    return Response.json({ error: "IA no configurada" }, { status: 503 });
  }

  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!subject || subject.userId !== userId) {
    return Response.json({ error: "materia no encontrada" }, { status: 404 });
  }

  try {
    const out = await summarize({ subjectId, topic });
    return Response.json(out);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return Response.json({ error: "IA no configurada" }, { status: 503 });
    }
    if (err instanceof AiRateLimitError || err instanceof AiUpstreamError) {
      return Response.json({ error: "IA no disponible" }, { status: 503 });
    }
    throw err;
  }
}
