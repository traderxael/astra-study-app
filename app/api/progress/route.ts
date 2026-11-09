/**
 * POST /api/progress — registra actividad de estudio (Task 6).
 * GET /api/progress?subjectId= — agrega progreso por materia (Task 7).
 *
 * POST: { type: 'chat', subjectId } -> 201 { id, type, subjectId }.
 * GET:  -> 200 { sessions, attempts, accuracy } vía aggregateProgress
 *  (fuente única también para el dashboard). `sessions` es honesto:
 *  cuenta cada ProgressEvent (un tick por chat, ficha, generación y
 *  práctica), no días ni conversaciones distintas. `attempts` = los
 *  QuizAttempt calificables. `accuracy = Σscore / Σtotal` (0 si none).
 * Validación ambos: requireSession, subjectId propio (404 si no existe
 * o es de otro dueño). Solo servidor.
 */
import { requireSession } from "../../../lib/auth-guard";
import { prisma } from "../../../lib/db";
import { aggregateProgress } from "../../../lib/progress";

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

export async function GET(request: Request): Promise<Response> {
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

  return Response.json(await aggregateProgress(userId, subjectId));
}
