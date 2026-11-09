"use client";

import { useCallback, useEffect, useState } from "react";

export interface FlashcardView {
  front: string;
  back: string;
}

interface FlashcardDeckProps {
  subjectId: string;
}

/**
 * Mazo de fichas (Task 7). Genera vía POST /api/flashcards
 * ({ subjectId, topic? }) y muestra una carta por vez con flip
 * anverso/reverso, anterior/siguiente y contador. Al montar genera
 * el mazo; el campo de tema permite regenerar acotado a un tema.
 */
export default function FlashcardDeck({ subjectId }: FlashcardDeckProps) {
  const [cards, setCards] = useState<FlashcardView[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (requestedTopic?: string) => {
      const t = (requestedTopic ?? topic).trim();
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/flashcards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subjectId, ...(t ? { topic: t } : {}) }),
        });
        const body = (await res.json()) as FlashcardView[] | { error?: string };
        if (!res.ok) {
          throw new Error((body as { error?: string }).error ?? "No se pudo generar fichas");
        }
        const list = Array.isArray(body) ? body : [];
        setCards(list);
        setIndex(0);
        setFlipped(false);
      } catch (err) {
        setCards([]);
        setError(err instanceof Error ? err.message : "Error inesperado");
      } finally {
        setLoading(false);
      }
    },
    [subjectId, topic],
  );

  useEffect(() => {
    void generate("");
    // Genera una sola vez al montar (o al cambiar de materia).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  const current = cards[index];

  return (
    <section aria-label="Mazo de fichas">
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
        <button type="submit" disabled={loading}>
          Generar mazo
        </button>
      </form>

      <div aria-live="polite">
        {loading ? <p>Armando fichas…</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {!loading && !error && cards.length === 0 ? (
          <p>Sin fichas todavía. Genera un mazo desde tu material.</p>
        ) : null}
        {current ? (
          <article>
            <p>
              Carta {index + 1} de {cards.length}
            </p>
            <p>{flipped ? `Reverso: ${current.back}` : `Anverso: ${current.front}`}</p>
            <button type="button" onClick={() => setFlipped((v) => !v)}>
              {flipped ? "Ver anverso" : "Ver reverso"}
            </button>
            <button
              type="button"
              disabled={index === 0}
              onClick={() => {
                setIndex((i) => Math.max(0, i - 1));
                setFlipped(false);
              }}
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={index >= cards.length - 1}
              onClick={() => {
                setIndex((i) => Math.min(cards.length - 1, i + 1));
                setFlipped(false);
              }}
            >
              Siguiente
            </button>
          </article>
        ) : null}
      </div>
    </section>
  );
}
