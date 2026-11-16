import { requireSession } from "../../../lib/auth-guard";
import { listSubjects } from "../../../lib/subjects";
import { getMetrics } from "../../../lib/metrics";
import { gamification } from "../../../lib/gamification";
import { quotaFor, quotaMessage } from "../../../lib/quota";
import { usedActions } from "../../../lib/track";
import SubjectNav from "../../../components/SubjectNav";
import StatCard from "../../../components/StatCard";
import ProgressBar from "../../../components/ProgressBar";
import Badge from "../../../components/Badge";

/**
 * Dashboard (Task 9) — paridad con Astra AI (§3 del análisis):
 * racha (streak), nivel + estrellas, logros (badges), desglose de
 * actividad, precisión y documentos, más la cuota por acción
 * (usage.getActionAccessStatus). Fuente única: lib/metrics sobre
 * ProgressEvent/QuizAttempt/File. Etiquetas honestas (sin inventar días).
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

  const metrics = active
    ? await getMetrics(userId, active.id, active.name)
    : null;
  const g = metrics ? gamification(metrics) : null;
  const quota = metrics ? quotaFor("generation", metrics.breakdown.generation) : null;

  return (
    <main>
      <SubjectNav
        subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
        activeId={active?.id}
      />

      {metrics && g ? (
        <section aria-label={`Progreso de ${metrics.subjectName}`}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <h2>{metrics.subjectName}</h2>
            <span className="pill ok">Nivel {g.level} · {g.levelName}</span>
          </div>

          <div className="grid">
            <StatCard
              label="Racha actual"
              value={
                <>
                  {metrics.streak.current}
                  <small> {metrics.streak.current === 1 ? "día" : "días"}</small>
                </>
              }
              hint={
                metrics.streak.today
                  ? "Hoy ya estudiaste ✓"
                  : metrics.streak.current > 0
                    ? "Estudia hoy para no perderla"
                    : "Empieza hoy"
              }
            />
            <StatCard
              label="Nivel"
              value={
                <>
                  {g.level}
                  <small> · {g.levelName}</small>
                </>
              }
              hint={`${g.stars} estrellas · siguiente nivel a ${g.nextLevelAt}`}
            />
            <StatCard
              label="Sesiones de tutor"
              value={metrics.sessions}
              hint={`Precisión ${Math.round(metrics.accuracy * 100)}% · ${metrics.attempts} intentos`}
            />
            <StatCard
              label="Documentos"
              value={metrics.docs}
              hint={`Última actividad: ${metrics.lastActivity ?? "—"}`}
            />
          </div>

          <h3>Progreso al siguiente nivel</h3>
          <ProgressBar value={g.stars} max={g.nextLevelAt} label="Estrellas" />

          <h3>Actividad</h3>
          <div className="grid">
            <StatCard label="Chat" value={metrics.breakdown.chat} />
            <StatCard label="Fichas" value={metrics.breakdown.flashcard} />
            <StatCard label="Prácticas" value={metrics.breakdown.quiz} />
            <StatCard label="Generaciones" value={metrics.breakdown.generation} />
            <StatCard label="Archivos" value={metrics.breakdown.upload} />
          </div>

          <h3>Cuota de este mes</h3>
          {quota ? (
            <>
              <p className="muted">{quotaMessage(quota)}</p>
              {quota.limit > 0 ? (
                <ProgressBar value={quota.used} max={quota.limit} label="Generaciones con IA" />
              ) : (
                <p className="muted">Generaciones con IA: ilimitadas.</p>
              )}
            </>
          ) : (
            <p className="muted">—</p>
          )}

          <h3>Logros</h3>
          <div>
            {g.badges.map((b) => (
              <Badge key={b.id} label={b.label} on={b.unlocked} />
            ))}
          </div>
        </section>
      ) : (
        <p>No tienes materias todavía.</p>
      )}
    </main>
  );
}