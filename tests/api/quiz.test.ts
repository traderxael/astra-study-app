// tests/api/quiz.test.ts — Task 7 (TDD, sin DB real, R-01).
// Mockea requireSession, prisma (store en memoria) y fetch global (SSE de la IA).
// - POST /api/quiz { subjectId, n } -> QuizItem[] (opción múltiple; QuizRunner suma abierta corta).
// - POST /api/quiz { subjectId, answers, score, total } -> QuizAttempt 201 (práctica).
// - GET /api/progress?subjectId -> { sessions, attempts, accuracy }.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type SubjectRow = { id: string; userId: string; name: string; createdAt: Date; updatedAt: Date }
type ChunkRow = { id: string; userId: string; subjectId: string; fileId: string; chunkIndex: number; content: string; tokenCount: number; createdAt: Date }
type ProgressRow = { id: string; userId: string; subjectId: string; type: string; payload: unknown; createdAt: Date }
type QuizAttemptRow = { id: string; userId: string; subjectId: string; score: number; total: number; answers: unknown; createdAt: Date }

const { store } = vi.hoisted(() => ({
  store: {
    subjects: [] as SubjectRow[],
    chunks: [] as ChunkRow[],
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

import { POST as POSTQuiz } from '../../app/api/quiz/route'
import { GET as GETProgress } from '../../app/api/progress/route'

function postQuiz(body: Record<string, unknown>): Promise<Response> {
  const req = new Request('http://localhost/api/quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POSTQuiz(req)
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

describe('Task 7 — POST /api/quiz', () => {
  beforeEach(() => {
    store.subjects.length = 0
    store.chunks.length = 0
    store.progressEvents.length = 0
    store.quizAttempts.length = 0
    seed()
    fetchMock.mockReset()
    process.env.OPENAI_API_KEY = 'sk-test-clave'
    fetchMock.mockResolvedValue(
      sseResponse(
        JSON.stringify([
          {
            question: '¿Qué produce la mitosis?',
            options: ['Dos hijas idénticas', 'Dos hijas distintas', 'Cuatro células', 'Una célula'],
            answerIndex: 0,
            explanation: 'Produce dos células hijas idénticas.',
          },
        ]),
      ),
    )
  })

  afterEach(() => {
    delete process.env.OPENAI_API_KEY
  })

  it('POST /api/quiz genera cuestionario desde el material', async () => {
    const res = await postQuiz({ subjectId: 'bio', n: 1 })
    expect(res.status).toBe(200)
    const items = await res.json()
    expect(Array.isArray(items)).toBe(true)
    expect(items.length).toBeGreaterThan(0)
    expect(items[0]).toHaveProperty('question')
    expect(items[0].options).toHaveLength(4)
    expect(items[0]).toHaveProperty('answerIndex')
  })

  it('POST /api/quiz sin n usa un tamaño por defecto', async () => {
    const res = await postQuiz({ subjectId: 'bio', topic: 'mitosis' })
    expect(res.status).toBe(200)
    const items = await res.json()
    expect(items.length).toBeGreaterThan(0)
  })

  it('POST /api/quiz persiste ProgressEvent de práctica', async () => {
    const res = await postQuiz({ subjectId: 'bio', n: 1, topic: 'mitosis' })
    expect(res.status).toBe(200)
    expect(store.progressEvents.length).toBeGreaterThanOrEqual(1)
    expect(store.progressEvents.some((p) => p.type === 'quiz' || p.type === 'quiz-generated')).toBe(true)
  })

  it('POST /api/quiz sin OPENAI_API_KEY devuelve 503 degradado', async () => {
    delete process.env.OPENAI_API_KEY
    const res = await postQuiz({ subjectId: 'bio', n: 1 })
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'IA no configurada' })
    expect(res.headers.get('x-openai-key')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POST /api/quiz rechaza materia ajena (404) y body inválido (400)', async () => {
    store.subjects.push({ id: 'ajena', userId: 'otro', name: 'Historia', createdAt: new Date(), updatedAt: new Date() })
    const res404 = await postQuiz({ subjectId: 'ajena', n: 1 })
    expect(res404.status).toBe(404)

    const res400 = await postQuiz({ n: 1 })
    expect(res400.status).toBe(400)
  })

  it('POST /api/quiz con answers persiste QuizAttempt y ProgressEvent quiz', async () => {
    const res = await postQuiz({
      subjectId: 'bio',
      answers: [{ question: '¿Qué produce la mitosis?', chosen: 0 }],
      score: 1,
      total: 1,
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.score).toBe(1)
    expect(body.total).toBe(1)
    expect(store.quizAttempts).toHaveLength(1)
    expect(store.quizAttempts[0]).toMatchObject({ userId: 'admin', subjectId: 'bio', score: 1, total: 1 })
    expect(store.progressEvents.some((p) => p.type === 'quiz')).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('GET /api/progress refleja intentos y accuracy', async () => {
    await postQuiz({ subjectId: 'bio', answers: [{ question: 'q', chosen: 0 }], score: 2, total: 4 })
    const res = await GETProgress(new Request('http://localhost/api/progress?subjectId=bio'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessions).toBeGreaterThanOrEqual(1)
    expect(body.attempts).toBe(1)
    expect(body.accuracy).toBeCloseTo(0.5, 5)
  })

  it('GET /api/progress sin intentos devuelve accuracy 0', async () => {
    const res = await GETProgress(new Request('http://localhost/api/progress?subjectId=bio'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ sessions: expect.any(Number), attempts: 0, accuracy: 0 })
  })
})
