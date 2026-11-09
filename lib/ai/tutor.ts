/**
 * Servicio de IA: tutor, resumen, fichas y quiz (Task 5).
 *
 * Toda salida se genera desde chunks recuperados con `retrieveChunks()`
 * (nunca de memoria del modelo). Sin material => respuesta "sin material"
 * con citations [] SIN llamar a la IA (Review Focus 4, sin alucinacion).
 * Sin clave y con material => AiNotConfiguredError (las rutas responden
 * 503). La clave vive solo en servidor (lib/ai/provider.ts). Solo servidor.
 */

import type { Chunk } from "@prisma/client";
import { retrieveChunks } from "../retrieval";
import {
  chatCompletion,
  isAiConfigured,
  AiNotConfiguredError,
} from "./provider";
import {
  buildContext,
  buildTutorMessages,
  buildSummaryMessages,
  buildFlashcardsMessages,
  buildQuizMessages,
} from "./prompts";

export interface Citation {
  chunkId: string;
  chunkIndex: number;
  fileId: string;
}

export interface TutorInput {
  subjectId: string;
  message: string;
}

export interface TutorOutput {
  answer: string;
  citations: Citation[];
}

export interface SummaryInput {
  subjectId: string;
  topic: string;
}

export interface SummaryOutput {
  summary: string;
  citations: Citation[];
}

export interface FlashcardsInput {
  subjectId: string;
  topic: string;
  count?: number;
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface QuizInput {
  subjectId: string;
  topic: string;
  count?: number;
}

export interface QuizItem {
  question: string;
  options: string[];
  answerIndex: number;
  explanation?: string;
}

/** Mensaje fijo cuando no hay material recuperado (Review Focus 4). */
export const NO_MATERIAL_MESSAGE =
  "No tengo material de esta materia todavía (sin material cargado), así que no puedo responder. Subí un archivo para empezar.";

const DEFAULT_COUNT = 6;
const MAX_COUNT = 12;

function clampCount(count: number | undefined): number {
  const n = count ?? DEFAULT_COUNT;
  return Math.min(Math.max(Math.trunc(n), 1), MAX_COUNT);
}

function toCitations(chunks: Chunk[]): Citation[] {
  return chunks.map((c) => ({
    chunkId: c.id,
    chunkIndex: c.chunkIndex,
    fileId: c.fileId,
  }));
}

/**
 * Citas desde los marcadores `[n]` del modelo (n = posicion 1-based en
 * buildContext). Sin marcadores válidos => todos los chunks usados.
 */
function citationsFromAnswer(answer: string, chunks: Chunk[]): Citation[] {
  const seen = new Set<number>();
  const matched: number[] = [];
  for (const m of answer.matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= chunks.length && !seen.has(n)) {
      seen.add(n);
      matched.push(n);
    }
  }
  if (matched.length === 0) return toCitations(chunks);
  return matched.map((n) => {
    const c = chunks[n - 1];
    return { chunkId: c.id, chunkIndex: c.chunkIndex, fileId: c.fileId };
  });
}

async function readStreamText(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

function requireApiKey(): void {
  if (!isAiConfigured()) throw new AiNotConfiguredError();
}

/** Extrae el primer arreglo JSON del texto del modelo (tolerante). */
function extractJsonArray(text: string): unknown {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) {
    throw new Error("La IA devolvió un formato inválido (sin arreglo JSON)");
  }
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

function toFlashcards(value: unknown): Flashcard[] {
  if (!Array.isArray(value)) {
    throw new Error("La IA devolvió un formato inválido (arreglo esperado)");
  }
  return value.map((item) => {
    const card = item as { front?: unknown; back?: unknown };
    if (typeof card.front !== "string" || typeof card.back !== "string") {
      throw new Error("La IA devolvió un formato inválido (front/back)");
    }
    return { front: card.front, back: card.back };
  });
}

function toQuizItems(value: unknown): QuizItem[] {
  if (!Array.isArray(value)) {
    throw new Error("La IA devolvió un formato inválido (arreglo esperado)");
  }
  return value.map((item) => {
    const q = item as {
      question?: unknown;
      options?: unknown;
      answerIndex?: unknown;
      explanation?: unknown;
    };
    if (
      typeof q.question !== "string" ||
      !Array.isArray(q.options) ||
      q.options.length !== 4 ||
      !q.options.every((o) => typeof o === "string") ||
      !Number.isInteger(q.answerIndex) ||
      (q.answerIndex as number) < 0 ||
      (q.answerIndex as number) > 3
    ) {
      throw new Error("La IA devolvió un formato inválido (pregunta/opciones)");
    }
    const quizItem: QuizItem = {
      question: q.question,
      options: q.options as string[],
      answerIndex: q.answerIndex as number,
    };
    if (typeof q.explanation === "string") quizItem.explanation = q.explanation;
    return quizItem;
  });
}

export async function askTutor(input: TutorInput): Promise<TutorOutput> {
  const chunks = await retrieveChunks(input.subjectId, input.message);
  if (chunks.length === 0) {
    // Sin material: nunca llamar a la IA (Review Focus 4).
    return { answer: NO_MATERIAL_MESSAGE, citations: [] };
  }
  requireApiKey();
  const stream = await chatCompletion(
    buildTutorMessages(buildContext(chunks), input.message),
  );
  const answer = (await readStreamText(stream)).trim();
  return { answer, citations: citationsFromAnswer(answer, chunks) };
}

export async function summarize(input: SummaryInput): Promise<SummaryOutput> {
  const chunks = await retrieveChunks(input.subjectId, input.topic);
  if (chunks.length === 0) {
    // Sin material: nunca llamar a la IA (Review Focus 4).
    return { summary: NO_MATERIAL_MESSAGE, citations: [] };
  }
  requireApiKey();
  const stream = await chatCompletion(buildSummaryMessages(buildContext(chunks)));
  const summary = (await readStreamText(stream)).trim();
  return { summary, citations: toCitations(chunks) };
}

export async function generateFlashcards(
  input: FlashcardsInput,
): Promise<Flashcard[]> {
  const chunks = await retrieveChunks(input.subjectId, input.topic);
  if (chunks.length === 0) return [];
  requireApiKey();
  const stream = await chatCompletion(
    buildFlashcardsMessages(buildContext(chunks), clampCount(input.count)),
  );
  return toFlashcards(extractJsonArray(await readStreamText(stream)));
}

export async function generateQuiz(input: QuizInput): Promise<QuizItem[]> {
  const chunks = await retrieveChunks(input.subjectId, input.topic);
  if (chunks.length === 0) return [];
  requireApiKey();
  const stream = await chatCompletion(
    buildQuizMessages(buildContext(chunks), clampCount(input.count)),
  );
  return toQuizItems(extractJsonArray(await readStreamText(stream)));
}
