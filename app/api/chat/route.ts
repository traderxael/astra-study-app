/**
 * POST /api/chat — ruta mínima del tutor (Task 5).
 *
 * Task 6 extiende esta ruta con persistencia (Conversation/Message,
 * ProgressEvent) sin cambiar la firma POST /api/chat (R-03).
 *
 * Orden de respuestas (Review Focus 3):
 * - 503 { error: 'IA no configurada' } sin clave (antes de tocar la IA,
 *   nunca expone la clave: sin header x-openai-key ni cuerpo con secretos).
 * - 503 { error: 'IA no disponible' } ante rate-limit u otro fallo del
 *   proveedor. Nunca 500 por falta de clave.
 * - 404 si la materia no existe o es de otro dueño (mismo criterio que
 *   la ingesta de archivos). 400 ante body inválido.
 *
 * Con clave y material: 200 { answer, citations } vía askTutor().
 */
import { requireSession } from "../../../lib/auth-guard";
import { prisma } from "../../../lib/db";
import { isAiConfigured, AiNotConfiguredError, AiRateLimitError, AiUpstreamError } from "../../../lib/ai/provider";
import { askTutor } from "../../../lib/ai/tutor";

export async function POST(request: Request): Promise<Response> {
  const session = await requireSession();
  const userId = session.user!.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { subjectId, message } = (body ?? {}) as {
    subjectId?: unknown;
    message?: unknown;
  };
  if (typeof subjectId !== "string" || !subjectId.trim() ||
      typeof message !== "string" || !message.trim()) {
    return Response.json(
      { error: "falta subjectId o message" },
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
    const out = await askTutor({ subjectId, message });
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
