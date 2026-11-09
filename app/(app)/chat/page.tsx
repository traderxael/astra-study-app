import { requireSession } from "../../../lib/auth-guard";
import { listSubjects } from "../../../lib/subjects";
import { prisma } from "../../../lib/db";
import ChatPanel from "../../../components/ChatPanel";
import SubjectNav from "../../../components/SubjectNav";

/**
 * Página de chat del tutor (Task 6). Server component: carga las
 * materias del dueño, preselecciona ?subjectId= (o la primera) y
 * delega la conversación a ChatPanel (cliente, POST /api/chat).
 */
export default async function ChatPage({
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

  let files: { id: string; name: string }[] = [];
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
      <h1>Tutor</h1>
      <SubjectNav
        subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
        activeId={active?.id}
      />
      {active ? (
        <ChatPanel subjectId={active.id} files={files} />
      ) : (
        <p>Sube material en /material para empezar a preguntar.</p>
      )}
    </main>
  );
}
