import { requireSession } from "../../../lib/auth-guard";
import { listSubjects } from "../../../lib/subjects";
import { aggregateProgress } from "../../../lib/progress";
import SubjectNav from "../../../components/SubjectNav";

/**
 * Dashboard de progreso (Task 7). Server component: para la materia
 * preseleccionada (?subjectId= o la primera) muestra la agregación
 * de GET /api/progress vía aggregateProgress (fuente única). Etiqueta
 * honesta: "Eventos de estudio" (ticks de ProgressEvent), no días.
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

  const summary = active
    ? await aggregateProgress(userId, active.id).catch(() => ({
        sessions: 0,
        attempts: 0,
        accuracy: 0,
      }))
    : { sessions: 0, attempts: 0, accuracy: 0 };

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
          <p>Eventos de estudio (chats, fichas y prácticas): {summary.sessions}</p>
          <p>Intentos de práctica: {summary.attempts}</p>
          <p>Precisión: {Math.round(summary.accuracy * 100)}%</p>
          {summary.attempts === 0 ? (
            <p>Practica con /practice para ver tu precisión acá.</p>
          ) : null}
        </section>
      ) : (
        <p>No tienes materias todavía.</p>
      )}
    </main>
  );
}
