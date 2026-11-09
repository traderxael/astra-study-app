import { requireSession } from "../../../lib/auth-guard";
import { listSubjects } from "../../../lib/subjects";
import FlashcardDeck from "../../../components/FlashcardDeck";
import SubjectNav from "../../../components/SubjectNav";

/**
 * Página de fichas (Task 7). Server component: carga las materias
 * del dueño, preselecciona ?subjectId= (o la primera) y delega el
 * mazo a FlashcardDeck (cliente, POST /api/flashcards).
 */
export default async function FlashcardsPage({
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
      <h1>Fichas</h1>
      <SubjectNav
        subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
        activeId={active?.id}
      />
      {active ? (
        <FlashcardDeck subjectId={active.id} />
      ) : (
        <p>Sube material en /material para generar fichas.</p>
      )}
    </main>
  );
}
