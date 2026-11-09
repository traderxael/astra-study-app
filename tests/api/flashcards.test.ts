// tests/api/flashcards.test.ts — Task 7 (TDD, sin DB real, R-01).
// Mockea requireSession, prisma (store en memoria) y fetch global (SSE de la IA).
// - POST /api/flashcards { subjectId } -> Flashcard[] desde generateFlashcards() + retrieveChunks().
// - Persiste Flashcard + ProgressEvent 'flashcards'.
// - GET /api/progress?subjectId -> { sessions, attempts, accuracy } (Task 7 extiende Task 6).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type SubjectRow = { id: string; userId: string; name: string; createdAt: Date; updatedAt: Date }
type ChunkRow = { id: string; userId: string; subjectId: string; fileId: string; chunkIndex: number; content: string; tokenCount: number; createdAt: Date }
type FlashcardRow = { id: string; userId: string; subjectId: string; front: string; back: string; source: string; reviewCount: number; nextReviewAt: Date | null; createdAt: Date; updatedAt: Date }
type ProgressRow = { id: string; userId: string; subjectId: string; type: string; payload: unknown; createdAt: Date }
type QuizAttemptRow = { id: string; userId: string; subjectId: string; score: number; total: number; answers: unknown; createdAt: Date }

const { store } = vi.hoisted(() => ({
  store: {
    subjects: [] as SubjectRow[],
    chunks: [] as ChunkRow[],
    flashcards: [] as FlashcardRow[],
    progressEvents: [] as ProgressRow[],
    quizAttempts: [] as QuizAttemptRow[],
  },
}))

vi.mock('../../lib/auth-guard', () => ({
  requireSession: vi.fn(async () => ({
    user: { id: 'admin', email: 'estudio@local', name: 'Estudio' },
    expires: new Date(Date.now() + 86400000).toISOString(),
  })),
}))

vi.mock('../../lib/db', () => ({
  prisma: {
    subject: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = store.subjects.find((s) => s.id === where.id)
        return row ? { ...row } : null
      }),
    },
    chunk: {
      findMany: vi.fn(async ({ where }: { where?: { subjectId?: string; fileId?: string; userId?: string; id?: { in: string[] } } }) => {
        const w = where ?? {}
        if (w.id?.in) {
          return store.chunks
            .filter((c) => w.id!.in!.includes(c.id))
            .filter((c) => !w.userId || c.userId === w.userId)
            .map((c) => ({ ...c }))
        }
        return store.chunks
          .filter((c) => !w.subjectId || c.subjectId === w.subjectId)
          .filter((c) => !w.fileId || c.fileId === w.fileId)
          .filter((c) => !w.userId || c.userId === w.userId)
          .map((c) => ({ ...c }))
      }),
    },
    flashcard: {
      create: vi.fn(async ({ data }: { data: { userId: string; subjectId: string; front: string; back: string; source?: string } }) => {
        const now = new Date()
        const row: FlashcardRow = {
          id: `fc-${store.flashcards.length + 1}`,
          userId: data.userId,
          subjectId: data.subjectId,
          front: data.front,
          back: data.back,
          source: data.source ?? 'ai',
          reviewCount: 0,
          nextReviewAt: null,
          createdAt: now,
          updatedAt: now,
        }
        store.flashcards.push(row)
        return { ...row }
      }),
      findMany: vi.fn(async ({ where }: { where: { userId: string; subjectId: string } }) =>
        store.flashcards.filter((f) => f.userId === where.userId && f.subjectId === where.subjectId).map((f) => ({ ...f })),
      ),
    },
    progressEvent: {
      findMany: vi.fn(async ({ where }: { where?: { userId?: string; subjectId?: string; type?: string } }) =>
        store.progressEvents
          .filter((p) => (!where?.userId || p.userId === where.userId) && (!where?.subjectId || p.subjectId === where.subjectId) && (!where?.type || p.type === where.type))
          .map((p) => ({ ...p })),
      ),
      create: vi.fn(async ({ data }: { data: { userId: string; subjectId: string; type: string; payload?: unknown } }) => {
        const row: ProgressRow = {
          id: `prog-${store.progressEvents.length + 1}`,
          userId: data.userId,
          subjectId: data.subjectId,
          type: data.type,
          payload: data.payload ?? null,
          createdAt: new Date(),
        }
        store.progressEvents.push(row)
        return { ...row }
      }),
    },
    quizAttempt: {
      findMany: vi.fn(async ({ where }: { where?: { userId?: string; subjectId?: string } }) =>
        store.quizAttempts
          .filter((q) => (!where?.userId || q.userId === where.userId) && (!where?.subjectId || q.subjectId === where.subjectId))
          .map((q) => ({ ...q })),
      ),
      create: vi.fn(async ({ data }: { data: { userId: string; subjectId: string; score: number; total: number; answers?: unknown } }) => {
        const row: QuizAttemptRow = {
          id: `qa-${store.quizAttempts.length + 1}`,
          userId: data.userId,
          subjectId: data.subjectId,
          score: data.score,
          total: data.total,
          answers: data.answers ?? null,
          createdAt: new Date(),
        }
        store.quizAttempts.push(row)
        return { ...row }
      }),
    },
  },
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function sseResponse(text: string): Response {
  const body =
    `data: {"choices":[{"delta":{"content":${JSON.stringify(text)}}}]}\n` +
    '\n' +
    'data: [DONE]\n\n'
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

import { POST as POSTFlashcards } from '../../app/api/flashcards/route'
import { GET as GETProgress } from '../../app/api/progress/route'

function postFlashcards(body: Record<string, unknown>): Promise<Response> {
  const req = new Request('http://localhost/api/flashcards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POSTFlashcards(req)
}

function seed() {
  store.subjects.push({ id: 'bio', userId: 'admin', name: 'Biología', createdAt: new Date(), updatedAt: new Date() })
  store.chunks.push({
    id: 'chunk-mitosis',
    userId: 'admin',
    subjectId: 'bio',
    fileId: 'file-bio-1',
    chunkIndex: 0,
    content: 'La mitosis es la división celular que produce dos células hijas idénticas con el mismo número de cromosomas.',
    tokenCount: 20,
    createdAt: new Date(),
  })
}

describe('Task 7 — POST /api/flashcards', () => {
  beforeEach(() => {
    store.subjects.length = 0
    store.chunks.length = 0
    store.flashcards.length = 0
    store.progressEvents.length = 0
    store.quizAttempts.length = 0
    seed()
    fetchMock.mockReset()
    process.env.OPENAI_API_KEY = 'sk-test-clave'
    fetchMock.mockResolvedValue(
      sseResponse(JSON.stringify([{ front: '¿Qué es la mitosis?', back: 'División celular en dos hijas idénticas.' }])),
    )
  })

  afterEach(() => {
    delete process.env.OPENAI_API_KEY
  })

  it("POST /api/flashcards genera mazo desde el material", async () => {
    const res = await postFlashcards({ subjectId: 'bio' })
    expect(res.status).toBe(200)
    const cards = await res.json()
    expect(Array.isArray(cards)).toBe(true)
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0]).toHaveProperty('front')
    expect(cards[0]).toHaveProperty('back')
  })

  it('POST /api/flashcards persiste Flashcard y emite ProgressEvent flashcards', async () => {
    const res = await postFlashcards({ subjectId: 'bio', topic: 'mitosis' })
    expect(res.status).toBe(200)
    expect(store.flashcards).toHaveLength(1)
    expect(store.flashcards[0]).toMatchObject({ userId: 'admin', subjectId: 'bio', front: '¿Qué es la mitosis?' })
    expect(store.progressEvents).toHaveLength(1)
    expect(store.progressEvents[0]).toMatchObject({ userId: 'admin', subjectId: 'bio', type: 'flashcards' })
  })

  it('POST /api/flashcards rechaza count fuera de rango (400)', async () => {
    for (const bad of [0, -1, 13, 2.5, 100, '5']) {
      const res = await postFlashcards({ subjectId: 'bio', count: bad })
      expect(res.status).toBe(400)
    }
  })

  it('POST /api/flashcards sin OPENAI_API_KEY devuelve 503 degradado', async () => {
    delete process.env.OPENAI_API_KEY
    const res = await postFlashcards({ subjectId: 'bio' })
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'IA no configurada' })
    expect(res.headers.get('x-openai-key')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(store.flashcards).toHaveLength(0)
  })

  it('POST /api/flashcards rechaza materia ajena (404) y body inválido (400)', async () => {
    store.subjects.push({ id: 'ajena', userId: 'otro', name: 'Historia', createdAt: new Date(), updatedAt: new Date() })
    const res404 = await postFlashcards({ subjectId: 'ajena' })
    expect(res404.status).toBe(404)

    const res400 = await postFlashcards({ topic: 'mitosis' })
    expect(res400.status).toBe(400)
  })

  it('GET /api/progress agrega sessions, attempts y accuracy por materia', async () => {
    await postFlashcards({ subjectId: 'bio', topic: 'mitosis' })
    store.quizAttempts.push({ id: 'qa-1', userId: 'admin', subjectId: 'bio', score: 1, total: 2, answers: [], createdAt: new Date() })
    const res = await GETProgress(new Request('http://localhost/api/progress?subjectId=bio'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessions).toBeGreaterThanOrEqual(1)
    expect(body.attempts).toBe(1)
    expect(body.accuracy).toBeCloseTo(0.5, 5)
  })
})
