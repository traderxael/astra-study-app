import Link from "next/link";

export interface SubjectNavItem {
  id: string;
  name: string;
}

/**
 * Navegación entre materias (Task 6). Server component: recibe las
 * materias del dueño ya cargadas por la página y enla­za a /chat y
 * /material con ?subjectId= para preseleccionarlas.
 */
export default function SubjectNav({
  subjects,
  activeId,
}: {
  subjects: SubjectNavItem[];
  activeId?: string;
}) {
  if (subjects.length === 0) {
    return <p>No tienes materias todavía.</p>;
  }
  return (
    <nav aria-label="Materias">
      <ul>
        {subjects.map((s) => (
          <li key={s.id} aria-current={s.id === activeId ? "true" : undefined}>
            <Link href={`/chat?subjectId=${encodeURIComponent(s.id)}`}>{s.name}</Link>
            {" · "}
            <Link href={`/material?subjectId=${encodeURIComponent(s.id)}`}>
              Material
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
