import { requireSession } from "../../../lib/auth-guard";
import { listSubjects } from "../../../lib/subjects";
import QuizRunner from "../../../components/QuizRunner";
import SubjectNav from "../../../components/SubjectNav";

/**
 * Página de práctica (Task 7). Server component: carga las materias
 * del dueño, preselecciona ?subjectId= (o la primera) y delega el
 * cuestionario a QuizRunner (cliente, POST /api/quiz).
 */
export default async function PracticePage({
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

  return (
    <main>
      <h1>Práctica</h1>
      <SubjectNav
        subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
        activeId={active?.id}
      />
      {active ? (
        <QuizRunner subjectId={active.id} />
      ) : (
        <p>Sube material en /material para practicar.</p>
      )}
    </main>
  );
}
