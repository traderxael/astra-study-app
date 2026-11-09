/**
 * Chunking de texto para retrieval (Task 4).
 *
 * Bloques de ~2000 caracteres (~500 tokens) con overlap de 200 chars:
 * el siguiente bloque re-incluye los ultimos 200 chars del bloque anterior
 * para no perder contexto entre cortes. Puro y sin I/O. Solo servidor.
 */

export const CHUNK_SIZE = 2000;
export const CHUNK_OVERLAP = 200;

export function chunkText(text: string): string[] {
  if (!text || !text.trim()) return [];
  const step = CHUNK_SIZE - CHUNK_OVERLAP;
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += step) {
    chunks.push(text.slice(start, start + CHUNK_SIZE));
  }
  return chunks;
}

/** Estimacion simple de tokens (~4 chars/token) para Chunk.tokenCount. */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
