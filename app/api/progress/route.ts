/**
 * POST /api/progress — registra actividad de estudio (Task 6).
 *
 * Contrato: POST /api/progress { type: 'chat', subjectId } -> 201
 * { id, type, subjectId }. Persiste ProgressEvent (lo consume el
 * dashboard de Task 7 vía GET /api/progreso agregado). Validación:
 * requireSession, subjectId propio (404 si no existe o es de otro
 * dueño), type requerido no vacío (400 si falta). Solo servidor.
 */
import { requireSession } from "../../../lib/auth-guard";
import { prisma } from "../../../lib/db";

export async function POST(request: Request): Promise<Response> {
  const session = await requireSession();
  const userId = session.user!.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { type, subjectId, payload } = (body ?? {}) as {
    type?: unknown;
    subjectId?: unknown;
    payload?: unknown;
  };
  if (typeof type !== "string" || !type.trim() ||
      typeof subjectId !== "string" || !subjectId.trim()) {
    return Response.json(
      { error: "falta type o subjectId" },
      { status: 400 },
    );
  }

  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!subject || subject.userId !== userId) {
    return Response.json({ error: "materia no encontrada" }, { status: 404 });
  }

  const event = await prisma.progressEvent.create({
    data: {
      userId,
      subjectId,
      type: type.trim(),
      payload: (payload ?? null) as never,
    },
  });

  return Response.json(
    { id: event.id, type: event.type, subjectId: event.subjectId },
    { status: 201 },
  );
}
