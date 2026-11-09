import { requireSession } from "../../../lib/auth-guard";
import { listSubjects } from "../../../lib/subjects";
import { prisma } from "../../../lib/db";
import SubjectNav from "../../../components/SubjectNav";

/**
 * Página de material (Task 6). Server component: lista las materias
 * del dueño y, para la preseleccionada (?subjectId= o la primera), sus
 * archivos ya ingeridos (File). La subida vive en
 * POST /api/subjects/:id/files (Task 4).
 */
export default async function MaterialPage({
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

  let files: { id: string; name: string; status: string }[] = [];
  if (active) {
    try {
      files = await prisma.file.findMany({
        where: { userId, subjectId: active.id },
        orderBy: { createdAt: "asc" },
      });
    } catch {
      files = [];
    }
  }

  return (
    <main>
      <h1>Material</h1>
      <SubjectNav
        subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
        activeId={active?.id}
      />
      {active ? (
        <section aria-label={`Archivos de ${active.name}`}>
          <h2>{active.name}</h2>
          {files.length === 0 ? (
            <p>Sin archivos todavía. Sube uno para empezar.</p>
          ) : (
            <ul>
              {files.map((f) => (
                <li key={f.id}>
                  {f.name} <small>({f.status})</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <p>No tienes materias todavía.</p>
      )}
    </main>
  );
}
