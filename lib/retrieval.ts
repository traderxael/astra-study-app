/**
 * Retrieval keyword scoped por materia (Task 4, sin vectores en v1).
 *
 * Ranking por conteo de ocurrencias de los terminos de la query dentro de
 * cada chunk, solo entre chunks del subjectId dado. En produccion el
 * contrato equivale a un ILIKE/tsvector + ORDER BY conteo; aqui se puntua
 * en memoria para que el mismo codigo corra con Prisma real y con mocks
 * de test (R-01). Solo servidor.
 */

import type { Chunk } from "@prisma/client";
import { prisma } from "./db";

function termsOf(query: string): string[] {
  return query
    .toLowerCase()
    .match(/[a-z0-9áéíóúñü]+/gi)
    ?.map((t) => t.toLowerCase())
    .filter(Boolean) ?? [];
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  while (true) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    count += 1;
    from = at + needle.length;
  }
  return count;
}

export async function retrieveChunks(
  subjectId: string,
  query: string,
  k = 6,
): Promise<Chunk[]> {
  const terms = termsOf(query);
  if (terms.length === 0) return [];
  const rows = await prisma.chunk.findMany({ where: { subjectId } });
  const scored = rows
    .map((row) => {
      const lower = row.content.toLowerCase();
      const score = terms.reduce(
        (acc, t) => acc + countOccurrences(lower, t),
        0,
      );
      return { row, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.row.chunkIndex - b.row.chunkIndex);
  return scored.slice(0, k).map((s) => s.row);
}
