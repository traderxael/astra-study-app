/**
 * POST /api/progress — registra actividad de estudio (Task 6).
 * GET /api/progress?subjectId= — agrega progreso por materia (Task 7).
 *
 * POST: { type: 'chat', subjectId } -> 201 { id, type, subjectId }.
 * GET:  -> 200 { sessions, attempts, accuracy } donde
 *  sessions = ProgressEvents de la materia (chat + quiz + flashcards...),
 *  attempts = QuizAttempt de la materia (prácticas terminadas),
 *  accuracy = Σscore / Σtotal de los QuizAttempt (0 si no hay intentos).
 * Validación ambos: requireSession, subjectId propio (404 si no existe o
 * es de otro dueño). Solo servidor.
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

  const db = prisma as unknown as {
    progressEvent?: {
      findMany: (a: unknown) => Promise<Array<unknown>>;
    };
    quizAttempt?: {
      findMany: (a: unknown) => Promise<Array<{ score: number; total: number }>>;
    };
  };

  let sessions = 0;
  try {
    if (db.progressEvent) {
      const events = await db.progressEvent.findMany({ where: { userId, subjectId } });
      sessions = Array.isArray(events) ? events.length : 0;
    }
  } catch (err) {
    console.error("GET /api/progress events failed", err);
  }

  let attempts = 0;
  let accuracy = 0;
  try {
    if (db.quizAttempt) {
      const rows = await db.quizAttempt.findMany({ where: { userId, subjectId } });
      const attemptsRows = Array.isArray(rows) ? rows : [];
      attempts = attemptsRows.length;
      let sumScore = 0;
      let sumTotal = 0;
      for (const row of attemptsRows) {
        if (typeof row.score === "number" && typeof row.total === "number" && row.total > 0) {
          sumScore += row.score;
          sumTotal += row.total;
        }
      }
      accuracy = sumTotal > 0 ? sumScore / sumTotal : 0;
    }
  } catch (err) {
    console.error("GET /api/progress attempts failed", err);
  }

  return Response.json({ sessions, attempts, accuracy });
}
