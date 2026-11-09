import { requireSession } from "../../../lib/auth-guard";
import { listSubjects } from "../../../lib/subjects";
import { prisma } from "../../../lib/db";
import SubjectNav from "../../../components/SubjectNav";

/**
 * Dashboard de progreso (Task 7). Server component: para la materia
 * preseleccionada (?subjectId= o la primera) agrega ProgressEvent
 * (sessions) y QuizAttempt (attempts, accuracy = Σscore/Σtotal),
 * la misma agregación de GET /api/progress?subjectId=.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ subjectId?: string }>;
}) {
  const session = await requireSession();
  const userId = session.user!.id;
  const params = (await searchParams?.catch(() => undefined)) ?? {};
  const subjects = await listSubjects(userId).catch(() => []);
  const active =
    subjects.find((s) => s.id === params.subjectId) ?? subjects[0] ?? null;

  let sessions = 0;
  let attempts = 0;
  let accuracy = 0;
  if (active) {
    try {
      const events = await prisma.progressEvent.findMany({
        where: { userId, subjectId: active.id },
      });
      sessions = events.length;
    } catch {
      sessions = 0;
    }
    try {
      const rows = await prisma.quizAttempt.findMany({
        where: { userId, subjectId: active.id },
      });
      attempts = rows.length;
      let sumScore = 0;
      let sumTotal = 0;
      for (const row of rows) {
        if (row.total > 0) {
          sumScore += row.score;
          sumTotal += row.total;
        }
      }
      accuracy = sumTotal > 0 ? sumScore / sumTotal : 0;
    } catch {
      attempts = 0;
      accuracy = 0;
    }
  }

  return (
    <main>
      <h1>Dashboard</h1>
      <SubjectNav
        subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
        activeId={active?.id}
      />
      {active ? (
        <section aria-label={`Progreso de ${active.name}`}>
          <h2>{active.name}</h2>
          <p>Sesiones de estudio: {sessions}</p>
          <p>Intentos de práctica: {attempts}</p>
          <p>Precisión: {Math.round(accuracy * 100)}%</p>
          {attempts === 0 ? (
            <p>Practica con /practice para ver tu precisión acá.</p>
          ) : null}
        </section>
      ) : (
        <p>No tienes materias todavía.</p>
      )}
    </main>
  );
}
