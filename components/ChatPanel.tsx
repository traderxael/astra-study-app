"use client";

import { useCallback, useEffect, useState } from "react";

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
 * Panel del tutor (Task 6, fix round 1):
 * - Alcance real: el selector envía `fileId` cuando se elige un archivo
 *   (POST /api/chat lo acota vía retrieveChunks y verifica propiedad).
 * - Streaming SSE al navegador: POST con `stream: true`, lee tokens
 *   (`data: {token}`) y pinta la respuesta incrementalmente; el evento
 *   final `done` trae answer/citations.
 * - Historial persistido: al montar carga GET /api/chat?subjectId=.
 * - Progreso: el servidor emite UN ProgressEvent 'chat' por chat en
 *   persistChat (única vía); el cliente ya no POSTea /api/progress.
 */
export default function ChatPanel({ subjectId, files = [] }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [input, setInput] = useState("");
  const [scope, setScope] = useState<string>("subject");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat?subjectId=${encodeURIComponent(subjectId)}`);
      if (!res.ok) return;
      const body = (await res.json()) as {
        messages?: ChatMessageView[];
      };
      if (Array.isArray(body.messages)) {
        setMessages(
          body.messages.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
            citations: m.citations ?? [],
          })),
        );
      }
    } catch {
      // Sin historial visible: el chat sigue usable.
    }
  }, [subjectId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || loading) return;
    setError(null);
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setInput("");

    const fileId = scope !== "subject" ? scope : undefined;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, message, stream: true, ...(fileId ? { fileId } : {}) }),
      });
      const contentType = res.headers.get("content-type") ?? "";

      if (!contentType.includes("text/event-stream")) {
        const body = (await res.json()) as {
          answer?: string;
          citations?: ChatCitationView[];
          error?: string;
        };
        if (!res.ok) throw new Error(body.error ?? "No se pudo responder");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: body.answer ?? "", citations: body.citations ?? [] },
        ]);
        return;
      }

      if (!res.ok || !res.body) {
        throw new Error("No se pudo responder");
      }

      // Lee el SSE token a token y pinta incrementalmente.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let draft = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "", citations: [] }]);
      const updateDraft = () => {
        const snapshot = draft;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: snapshot, citations: [] };
          return next;
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const raw of events) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          let data: { token?: string; done?: boolean; answer?: string; citations?: ChatCitationView[]; error?: string };
          try {
            data = JSON.parse(line.slice("data:".length).trim());
          } catch {
            continue;
          }
          if (data.error) throw new Error(data.error);
          if (typeof data.token === "string") {
            draft += data.token;
            updateDraft();
          }
          if (data.done) {
            const finalAnswer = data.answer ?? draft;
            const citations = data.citations ?? [];
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { role: "assistant", content: finalAnswer, citations };
              return next;
            });
          }
        }
      }
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
