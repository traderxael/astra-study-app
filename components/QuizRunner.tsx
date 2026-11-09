"use client";

import { useCallback, useEffect, useState } from "react";

export interface QuizItemView {
  question: string;
  options: string[];
  answerIndex: number;
  explanation?: string;
  kind?: "multiple" | "open";
}

interface QuizRunnerProps {
  subjectId: string;
}

type AnswerMap = Record<number, number | string>;

/** Una pregunta es abierta corta si kind es open o no trae opciones. */
function isOpen(item: QuizItemView): boolean {
  if (item.kind === "open") return true;
  if (item.kind === "multiple") return false;
  return !Array.isArray(item.options) || item.options.length === 0;
}

/**
 * Práctica con cuestionario (Task 7, Quiz v1: opción múltiple + abierta corta).
 * Genera vía POST /api/quiz ({ subjectId, n, topic? }), navega por
 * preguntas, responde (radio múltiple o texto libre para abierta corta),
 * corrige al terminar y registra el intento con POST /api/quiz
 * ({ subjectId, items, answers }) — la calificación la computa el
 * servidor contra los items generados. Las abiertas cortas no se
 * auto-califican (no suman al total); un cuestionario todo-abiertas
 * se muestra sin calificación y SIN persistir un intento falso 0/N.
 */
export default function QuizRunner({ subjectId }: QuizRunnerProps) {
  const [items, setItems] = useState<QuizItemView[]>([]);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [index, setIndex] = useState(0);
  const [topic, setTopic] = useState("");
  const [n, setN] = useState("5");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [graded, setGraded] = useState<boolean | null>(null);

  const generate = useCallback(async () => {
    const t = topic.trim();
    const parsed = Number(n);
    setLoading(true);
    setError(null);
    setFinished(false);
    setGraded(null);
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId,
          ...(Number.isFinite(parsed) && parsed > 0 ? { n: Math.trunc(parsed) } : {}),
          ...(t ? { topic: t } : {}),
        }),
      });
      const body = (await res.json()) as QuizItemView[] | { error?: string };
      if (!res.ok) {
        throw new Error((body as { error?: string }).error ?? "No se pudo generar el cuestionario");
      }
      const list = Array.isArray(body) ? body : [];
      setItems(list);
      setAnswers({});
      setIndex(0);
      setScore(0);
      setTotal(0);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }, [subjectId, topic, n]);

  useEffect(() => {
    void generate();
    // Genera una sola vez al montar (o al cambiar de materia).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  async function finish() {
    const chosenAnswers = items.map((item, i) => answers[i] ?? null);
    // Cuenta múltiple para decidir si hay algo calificable.
    const gradedCount = items.filter((it) => !isOpen(it)).length;
    setFinished(true);

    if (gradedCount === 0) {
      // Todo abiertas cortas: sin calificación automática y SIN
      // persistir intento falso (ese 0/N sesgaría accuracy).
      setScore(0);
      setTotal(0);
      setGraded(false);
      return;
    }

    // Calificación server-side: el cliente envía items + elegidos.
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, items, answers: chosenAnswers }),
      });
      const body = (await res.json()) as {
        score?: number;
        total?: number;
        graded?: boolean;
        error?: string;
      };
      if (res.ok && typeof body.score === "number" && typeof body.total === "number") {
        setScore(body.score);
        setTotal(body.total);
        setGraded(body.graded !== false);
        return;
      }
      // Fallo del endpoint: corrección local solo para mostrar (no persiste).
      let correct = 0;
      let totalLocal = 0;
      items.forEach((item, i) => {
        if (isOpen(item)) return;
        totalLocal += 1;
        if (answers[i] === item.answerIndex) correct += 1;
      });
      setScore(correct);
      setTotal(totalLocal);
      setGraded(true);
    } catch {
      let correct = 0;
      let totalLocal = 0;
      items.forEach((item, i) => {
        if (isOpen(item)) return;
        totalLocal += 1;
        if (answers[i] === item.answerIndex) correct += 1;
      });
      setScore(correct);
      setTotal(totalLocal);
      setGraded(true);
    }
  }

  const current = items[index];

  return (
    <section aria-label="Práctica">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void generate();
        }}
      >
        <label>
          Tema (opcional)
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="mitosis"
          />
        </label>
        <label>
          Preguntas
          <input
            value={n}
            onChange={(e) => setN(e.target.value)}
            inputMode="numeric"
            min="1"
            max="12"
            style={{ width: "4rem" }}
          />
        </label>
        <button type="submit" disabled={loading}>
          Nuevo cuestionario
        </button>
      </form>

      <div aria-live="polite">
        {loading ? <p>Armando cuestionario…</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {!loading && !error && items.length === 0 ? (
          <p>Sin preguntas todavía. Genera un cuestionario desde tu material.</p>
        ) : null}

        {current && !finished ? (
          <article>
            <p>
              Pregunta {index + 1} de {items.length}
            </p>
            <p>{current.question}</p>
            {isOpen(current) ? (
              <label>
                Respuesta corta
                <input
                  value={typeof answers[index] === "string" ? (answers[index] as string) : ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [index]: e.target.value }))}
                  placeholder="Escribe tu respuesta breve"
                />
              </label>
            ) : (
              <fieldset>
                <legend>Opciones</legend>
                {current.options.map((opt, i) => (
                  <label key={i}>
                    <input
                      type="radio"
                      name="quiz-option"
                      checked={answers[index] === i}
                      onChange={() => setAnswers((prev) => ({ ...prev, [index]: i }))}
                    />
                    {opt}
                  </label>
                ))}
              </fieldset>
            )}
            <button
              type="button"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              Anterior
            </button>
            {index < items.length - 1 ? (
              <button type="button" onClick={() => setIndex((i) => i + 1)}>
                Siguiente
              </button>
            ) : (
              <button type="button" onClick={() => void finish()}>
                Terminar y corregir
              </button>
            )}
          </article>
        ) : null}

        {finished ? (
          <article>
            {graded === false ? (
              <p>Cuestionario de abiertas cortas (sin calificación automática) — revisá las explicaciones.</p>
            ) : (
              <p>
                Resultado: {score} de {total} correctas
              </p>
            )}
            <ul>
              {items.map((item, i) => (
                <li key={i}>
                  <p>{item.question}</p>
                  {item.explanation ? <p>Explicación: {item.explanation}</p> : null}
                </li>
              ))}
            </ul>
          </article>
        ) : null}
      </div>
    </section>
  );
}
