/**
 * Ayudas compartidas de generación (Task 7 fix round 1).
 *
 * - resolveGenerationTopic(): tema compartido para fichas y quiz sin
 *   duplicar la heurística. Si el cliente manda un tema, se usa tal
 *   cual. Si no, se deriva de TODOS los chunks de la materia contando
 *   frecuencia de términos de contenido (sin sesgar a un solo chunk
 *   ni usar un literal "la"). Sin material => "" (la generación
 *   devuelve [] sin llamar a la IA).
 * - isValidCount(): 1..12 entero (rango de QuizRunner) para n/count.
 *
 * Solo servidor (lo consumen las rutas /api/flashcards y /api/quiz).
 */

import { prisma } from "./db";

const STOPWORDS = new Set([
  "la", "el", "los", "las", "de", "del", "en", "que", "es", "y", "a",
  "con", "por", "un", "una", "para", "como", "al", "se", "su", "sus",
  "lo", "o", "e", "ni", "si", "no", "mas", "más", "muy", "ser", "son",
  "esta", "este", "esto", "estos", "estas", "ese", "esa", "esos", "esas",
  "hay", "fue", "fueron", "era", "eran", "fueron", "puede", "pueden",
  "the", "and", "or", "to", "of", "in", "is", "are", "it", "this", "that",
]);

function termsOf(text: string): string[] {
  return (
    text
      .toLowerCase()
      .match(/[a-z0-9áéíóúñü]+/gi)
      ?.map((t) => t.toLowerCase())
      .filter(Boolean) ?? []
  );
}

/** true si value es un conteo válido 1..12 entero (n/count). */
export function isValidCount(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 12
  );
}

export async function resolveGenerationTopic(
  subjectId: string,
  topic?: unknown,
): Promise<string> {
  if (typeof topic === "string" && topic.trim()) return topic.trim();
  try {
    const db = prisma as unknown as {
      chunk?: {
        findMany: (a: unknown) => Promise<Array<{ content: string }>>;
      };
    };
    if (!db.chunk) return "";
    const rows = await db.chunk.findMany({ where: { subjectId } });
    if (!rows || rows.length === 0) return "";

    const freq = new Map<string, number>();
    const fallbackFreq = new Map<string, number>();
    for (const row of rows) {
      if (typeof row.content !== "string") continue;
      for (const term of termsOf(row.content)) {
        fallbackFreq.set(term, (fallbackFreq.get(term) ?? 0) + 1);
        if (!STOPWORDS.has(term) && term.length >= 3) {
          freq.set(term, (freq.get(term) ?? 0) + 1);
        }
      }
    }
    const source = freq.size > 0 ? freq : fallbackFreq;
    if (source.size === 0) return "";
    return [...source.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([term]) => term)
      .join(" ");
  } catch (err) {
    console.error("resolveGenerationTopic failed", err);
    return "";
  }
}
