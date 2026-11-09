"use client";

import { useState } from "react";

export interface ChatCitationView {
  fileId: string;
  chunkId: string;
  snippet?: string;
}

export interface ChatMessageView {
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitationView[];
}

interface ChatPanelProps {
  subjectId: string;
  files?: { id: string; name: string }[];
}

/**
 * Panel del tutor (Task 6): selector de alcance (materia / un archivo),
 * historial en memoria y envío a POST /api/chat { subjectId, message }
 * -> { answer, citations }. El alcance por archivo es una preferencia
 * de UI (la firma de la API solo acepta subjectId/message, R-03); el
 * streaming de tokens lo hace el servidor (askTutor) y aquí la
 * respuesta se muestra al completarse, con estado "pensando…".
 */
export default function ChatPanel({ subjectId, files = [] }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [input, setInput] = useState("");
  const [scope, setScope] = useState<string>("subject");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || loading) return;
    setError(null);
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setInput("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, message }),
      });
      const body = (await res.json()) as {
        answer?: string;
        citations?: ChatCitationView[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error ?? "No se pudo responder");
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: body.answer ?? "",
          citations: body.citations ?? [],
        },
      ]);
      // Registra la actividad de chat como progreso (Task 7 lo agrega).
      fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "chat", subjectId }),
      }).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-label="Tutor">
      <label>
        Alcance
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="subject">Toda la materia</option>
          {files.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>

      <div aria-live="polite">
        {messages.map((m, i) => (
          <article key={i}>
            <p>
              <strong>{m.role === "user" ? "Tú" : "Tutor"}:</strong> {m.content}
            </p>
            {m.citations && m.citations.length > 0 ? (
              <ul>
                {m.citations.map((c) => (
                  <li key={c.chunkId}>
                    Fuente: archivo {c.fileId} · fragmento {c.chunkId}
                    {c.snippet ? <span> — {c.snippet}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
        {loading ? <p>Pensando…</p> : null}
        {error ? <p role="alert">{error}</p> : null}
      </div>

      <form onSubmit={send}>
        <label>
          Pregunta
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="¿qué es mitosis?"
          />
        </label>
        <button type="submit" disabled={loading || !input.trim()}>
          Preguntar
        </button>
      </form>
    </section>
  );
}
