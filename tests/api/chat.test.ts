// tests/api/chat.test.ts — Task 6 (TDD, sin DB real, R-01).
// Mockea requireSession, prisma (store en memoria) y fetch global (SSE de la IA).
// - POST /api/chat { subjectId, message } -> { answer, citations[{ fileId, chunkId, ... }] }
//   sin cambiar la firma de Task 5 (R-03). Con persistencia: Conversation/Message + ProgressEvent.
// - POST /api/progress { type: 'chat', subjectId } -> 201 crea ProgressEvent.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type SubjectRow = { id: string; userId: string; name: string; createdAt: Date; updatedAt: Date }
type ChunkRow = { id: string; userId: string; subjectId: string; fileId: string; chunkIndex: number; content: string; tokenCount: number; createdAt: Date }
type ConversationRow = { id: string; userId: string; subjectId: string; title: string | null; createdAt: Date; updatedAt: Date }
type MessageRow = { id: string; conversationId: string; role: string; content: string; createdAt: Date }
type ProgressRow = { id: string; userId: string; subjectId: string; type: string; payload: unknown; createdAt: Date }

const { store } = vi.hoisted(() => ({
  store: {
    subjects: [] as SubjectRow[],
    chunks: [] as ChunkRow[],
    conversations: [] as ConversationRow[],
    messages: [] as MessageRow[],
    progressEvents: [] as ProgressRow[],
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
      findMany: vi.fn(async ({ where }: { where: { subjectId?: string; id?: { in: string[] } } }) => {
        if (where?.id?.in) {
          return store.chunks.filter((c) => where.id!.in!.includes(c.id)).map((c) => ({ ...c }))
        }
        return store.chunks.filter((c) => c.subjectId === where?.subjectId).map((c) => ({ ...c }))
      }),
    },
    conversation: {
      findFirst: vi.fn(async ({ where }: { where: { userId: string; subjectId: string } }) => {
        const row = store.conversations.find(
          (c) => c.userId === where.userId && c.subjectId === where.subjectId,
        )
        return row ? { ...row } : null
      }),
      create: vi.fn(async ({ data }: { data: { userId: string; subjectId: string; title?: string } }) => {
        const now = new Date()
        const row: ConversationRow = {
          id: `conv-${store.conversations.length + 1}`,
          userId: data.userId,
          subjectId: data.subjectId,
          title: data.title ?? null,
          createdAt: now,
          updatedAt: now,
        }
        store.conversations.push(row)
        return { ...row }
      }),
    },
    message: {
      create: vi.fn(async ({ data }: { data: { conversationId: string; role: string; content: string } }) => {
        const row: MessageRow = {
          id: `msg-${store.messages.length + 1}`,
          conversationId: data.conversationId,
          role: data.role,
          content: data.content,
          createdAt: new Date(),
        }
        store.messages.push(row)
        return { ...row }
      }),
    },
    progressEvent: {
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

// Import dinámico: en RED el módulo de progress aún no existe y el import estático
// fallaría en colección; el test de chat sigue corriendo y falla por persistencia.
import { POST as POSTChat } from '../../app/api/chat/route'

function postChat(body: { subjectId: string; message: string }): Promise<Response> {
  const req = new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POSTChat(req)
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

describe('Task 6 — chat tutor con persistencia y progreso', () => {
  beforeEach(() => {
    store.subjects.length = 0
    store.chunks.length = 0
    store.conversations.length = 0
    store.messages.length = 0
    store.progressEvents.length = 0
    seed()
    fetchMock.mockReset()
    process.env.OPENAI_API_KEY = 'sk-test-clave'
    fetchMock.mockResolvedValue(sseResponse('La mitosis divide una célula en dos hijas idénticas [1].'))
  })

  afterEach(() => {
    delete process.env.OPENAI_API_KEY
  })

  it('POST /api/chat con contexto de materia devuelve citas', async () => {
    const res = await postChat({ subjectId: 'bio', message: '¿qué es mitosis?' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.answer).toContain('mitosis')
    expect(body.citations.length).toBeGreaterThan(0)
    expect(body.citations[0]).toMatchObject({ fileId: 'file-bio-1', chunkId: 'chunk-mitosis' })
  })

  it('POST /api/chat persiste Conversation/Message y emite ProgressEvent', async () => {
    const res = await postChat({ subjectId: 'bio', message: '¿qué es mitosis?' })
    expect(res.status).toBe(200)
    expect(store.conversations).toHaveLength(1)
    expect(store.conversations[0]).toMatchObject({ userId: 'admin', subjectId: 'bio' })
    expect(store.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(store.messages[0].content).toBe('¿qué es mitosis?')
    expect(store.messages[1].content).toContain('mitosis')
    expect(store.progressEvents).toHaveLength(1)
    expect(store.progressEvents[0]).toMatchObject({ userId: 'admin', subjectId: 'bio', type: 'chat' })
  })

  it("POST /api/progress { type: 'chat', subjectId } crea ProgressEvent", async () => {
    const { POST: POSTProgress } = await import('../../app/api/progress/route')
    const req = new Request('http://localhost/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'chat', subjectId: 'bio' }),
    })
    const res = await POSTProgress(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.type).toBe('chat')
    expect(body.subjectId).toBe('bio')
    expect(store.progressEvents).toHaveLength(1)
    expect(store.progressEvents[0]).toMatchObject({ userId: 'admin', subjectId: 'bio', type: 'chat' })
  })

  it('POST /api/progress rechaza materia ajena (404) y body inválido (400)', async () => {
    const { POST: POSTProgress } = await import('../../app/api/progress/route')
    store.subjects.push({ id: 'ajena', userId: 'otro', name: 'Historia', createdAt: new Date(), updatedAt: new Date() })
    const res404 = await POSTProgress(
      new Request('http://localhost/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'chat', subjectId: 'ajena' }),
      }),
    )
    expect(res404.status).toBe(404)

    const res400 = await POSTProgress(
      new Request('http://localhost/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId: 'bio' }),
      }),
    )
    expect(res400.status).toBe(400)
    expect(store.progressEvents).toHaveLength(0)
  })
})
