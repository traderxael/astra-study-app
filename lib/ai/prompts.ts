/**
 * Prompts propios del servicio de IA (Task 5).
 *
 * Textos originales en español (sin copiar textos de otros productos).
 * Cada tarea (tutor, resumen, fichas, quiz) tiene su prompt de sistema y
 * un constructor de mensajes que antepone el contexto numerado [1..n]
 * (los numeros [n] son las citas que tutor.ts mapea a chunkIds).
 * Solo servidor (lo consume lib/ai/tutor.ts).
 */

import type { ChatMessage } from "./provider";

/** Tope de contexto en caracteres (~3000 tokens) para limitar costo. */
export const MAX_CONTEXT_CHARS = 12000;

type ContextChunk = {
  content: string;
  fileId: string;
  chunkIndex: number;
};

/**
 * Bloques numerados `[n] (archivo ..., fragmento ...): contenido`.
 * El numero n es la cita que el modelo debe usar en su respuesta.
 */
export function buildContext(chunks: ContextChunk[]): string {
  const blocks = chunks.map(
    (c, i) =>
      `[${i + 1}] (archivo ${c.fileId}, fragmento ${c.chunkIndex}):\n${c.content}`,
  );
  return blocks.join("\n\n").slice(0, MAX_CONTEXT_CHARS);
}

export const TUTOR_SYSTEM_PROMPT = [
  "Sos un tutor de estudio que ayuda a una sola persona a aprender de su propio material.",
  "Respondé en español, de forma clara y breve, usando SOLO la información del material numerado que te paso.",
  "Cita cada afirmación con su número de bloque, por ejemplo: 'Ocurre en las hojas [1].'.",
  "Si el material no alcanza para responder, decilo explícitamente y no inventes datos.",
  "Nunca afirmes cosas que no estén respaldadas por los bloques citados.",
].join(" ");

export function buildTutorMessages(
  context: string,
  question: string,
): ChatMessage[] {
  return [
    { role: "system", content: TUTOR_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Material:\n${context}\n\nPregunta: ${question}`,
    },
  ];
}

export const SUMMARIZER_SYSTEM_PROMPT = [
  "Resumís el material numerado en español, de forma fiel y breve.",
  "Usá puntos cortos. No agregues información que no esté en el material.",
  "Terminá con una línea 'Citas: [n], [m]' con los números de bloque usados.",
].join(" ");

export function buildSummaryMessages(context: string): ChatMessage[] {
  return [
    { role: "system", content: SUMMARIZER_SYSTEM_PROMPT },
    { role: "user", content: `Material:\n${context}` },
  ];
}

export const FLASHCARDS_SYSTEM_PROMPT = [
  "Generás tarjetas de estudio en español desde el material numerado.",
  "Respondé SOLO con un arreglo JSON, sin texto extra ni bloques de código.",
  "Cada tarjeta: {\"front\": \"pregunta corta\", \"back\": \"respuesta breve\"}.",
  "Las tarjetas deben salir estrictamente del material; nada inventado.",
].join(" ");

export function buildFlashcardsMessages(
  context: string,
  count: number,
): ChatMessage[] {
  return [
    { role: "system", content: FLASHCARDS_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Material:\n${context}\n\nGenerá ${count} tarjetas.`,
    },
  ];
}

export const QUIZ_SYSTEM_PROMPT = [
  "Generás preguntas de opción múltiple en español desde el material numerado.",
  "Respondé SOLO con un arreglo JSON, sin texto extra ni bloques de código.",
  "Cada pregunta: {\"question\": \"...\", \"options\": [\"a\",\"b\",\"c\",\"d\"], \"answerIndex\": 0, \"explanation\": \"breve\"}.",
  "answerIndex es el índice (0-3) de la opción correcta. Nada inventado: todo sale del material.",
].join(" ");

export function buildQuizMessages(context: string, count: number): ChatMessage[] {
  return [
    { role: "system", content: QUIZ_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Material:\n${context}\n\nGenerá ${count} preguntas.`,
    },
  ];
}
