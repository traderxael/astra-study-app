// tests/unit/ai-tutor.test.ts — Task 5 (TDD, sin red ni clave real).
// Mockea requireSession, prisma (store en memoria) y fetch global.
// - Review Focus 3: sin OPENAI_API_KEY -> 503 { error: 'IA no configurada' }
//   sin 500 y sin filtrar la clave (sin header x-openai-key).
// - Review Focus 4: materia sin material -> /sin material/i y citations [],
//   sin llamar a la IA (sin alucinacion).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type SubjectRow = {
  id: string
  userId: string
  name: string
  createdAt: Date
  updatedAt: Date
}
type ChunkRow = {
  id: string
  userId: string
  subjectId: string
  fileId: string
  chunkIndex: number
  content: string
  tokenCount: number
  createdAt: Date
}

const { store } = vi.hoisted(() => ({
  store: { subjects: [] as SubjectRow[], chunks: [] as ChunkRow[] },
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
      findMany: vi.fn(
        async ({ where }: { where: { subjectId: string } }) =>
          store.chunks
            .filter((c) => c.subjectId === where.subjectId)
            .map((c) => ({ ...c })),
      ),
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
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let out = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    out += decoder.decode(value, { stream: true })
  }
  return out
}

import { POST as POSTChat } from '../../app/api/chat/route'
import { POST as POSTSummarize } from '../../app/api/ai/summarize/route'
import { askTutor, summarize, generateFlashcards, generateQuiz } from '../../lib/ai/tutor'
import { chatCompletion, AiNotConfiguredError } from '../../lib/ai/provider'

function postChat(body: { subjectId: string; message: string }): Promise<Response> {
  const req = new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POSTChat(req)
}

function postSummarize(body: { subjectId: string; topic: string }): Promise<Response> {
  const req = new Request('http://localhost/api/ai/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POSTSummarize(req)
}

function seed() {
  store.subjects.push({
    id: 's1',
    userId: 'admin',
    name: 'Biología',
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  store.chunks.push(
    {
      id: 'chunk-1',
      userId: 'admin',
      subjectId: 's1',
      fileId: 'file-1',
      chunkIndex: 0,
      content:
        'La fotosíntesis es el proceso por el que las plantas convierten la luz solar en energía dentro de las hojas.',
      tokenCount: 20,
      createdAt: new Date(),
    },
    {
      id: 'chunk-2',
      userId: 'admin',
      subjectId: 's1',
      fileId: 'file-1',
      chunkIndex: 1,
      content:
        'La respiración celular libera energía a partir de la glucosa.',
      tokenCount: 10,
      createdAt: new Date(),
    },
  )
}

describe('servicio de IA — tutor, resumen, fichas y quiz', () => {
  beforeEach(() => {
    store.subjects.length = 0
    store.chunks.length = 0
    seed()
    fetchMock.mockReset()
    delete process.env.OPENAI_API_KEY
  })

  afterEach(() => {
    delete process.env.OPENAI_API_KEY
  })

  it('sin OPENAI_API_KEY devuelve degradado sin 500 ni filtrar clave (Review Focus 3)', async () => {
    const res = await postChat({ subjectId: 's1', message: 'hola' })
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'IA no configurada' })
    expect(res.headers.get('x-openai-key')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('materia sin material no alucina (Review Focus 4)', async () => {
    const out = await askTutor({ subjectId: 'sin-material', message: 'hola' })
    expect(out.answer).toMatch(/sin material/i)
    expect(out.citations).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('chat con IA configurada responde con answer y citas del material', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-clave'
    fetchMock.mockResolvedValue(sseResponse('La fotosíntesis usa la luz [1].'))
    const res = await postChat({ subjectId: 's1', message: 'fotosíntesis' })
    expect(res.status).toBe(200)
    expect(res.headers.get('x-openai-key')).toBeNull()
    const body = await res.json()
    expect(body.answer).toContain('fotosíntesis')
    expect(body.citations).toEqual([
      { chunkId: 'chunk-1', chunkIndex: 0, fileId: 'file-1' },
    ])
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/chat/completions')
    expect(JSON.parse(String(init.body)).model).toBe('gpt-4o-mini')
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer sk-test-clave',
    )
  })

  it('tutor con material pero sin clave lanza AiNotConfiguredError', async () => {
    await expect(
      askTutor({ subjectId: 's1', message: 'fotosíntesis' }),
    ).rejects.toBeInstanceOf(AiNotConfiguredError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('chatCompletion devuelve un ReadableStream con el texto del modelo', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-clave'
    fetchMock.mockResolvedValue(sseResponse('hola mundo'))
    const stream = await chatCompletion([{ role: 'user', content: 'hola' }])
    expect(stream).toBeInstanceOf(ReadableStream)
    expect(await readAll(stream)).toBe('hola mundo')
  })

  it('summarize resume el material con citas', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-clave'
    fetchMock.mockResolvedValue(
      sseResponse('Resumen: las plantas usan la luz para hacer energía.'),
    )
    const out = await summarize({ subjectId: 's1', topic: 'fotosíntesis' })
    expect(out.summary).toContain('Resumen')
    expect(out.citations).toEqual([
      { chunkId: 'chunk-1', chunkIndex: 0, fileId: 'file-1' },
    ])
  })

  it('summarize sin material no alucina', async () => {
    const out = await summarize({ subjectId: 'sin-material', topic: 'fotosíntesis' })
    expect(out.summary).toMatch(/sin material/i)
    expect(out.citations).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('generateFlashcards parsea el JSON de la IA', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-clave'
    fetchMock.mockResolvedValue(
      sseResponse(
        JSON.stringify([
          { front: '¿Qué es la fotosíntesis?', back: 'Convertir luz en energía.' },
        ]),
      ),
    )
    const cards = await generateFlashcards({ subjectId: 's1', topic: 'fotosíntesis' })
    expect(cards).toHaveLength(1)
    expect(cards[0].front).toContain('fotosíntesis')
    expect(cards[0].back).toBe('Convertir luz en energía.')
  })

  it('generateQuiz parsea preguntas de opción múltiple', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-clave'
    fetchMock.mockResolvedValue(
      sseResponse(
        JSON.stringify([
          {
            question: '¿Dónde ocurre la fotosíntesis?',
            options: ['En las raíces', 'En las hojas', 'En las flores', 'En el tallo'],
            answerIndex: 1,
            explanation: 'Las hojas contienen clorofila.',
          },
        ]),
      ),
    )
    const items = await generateQuiz({ subjectId: 's1', topic: 'fotosíntesis' })
    expect(items).toHaveLength(1)
    expect(items[0].options).toHaveLength(4)
    expect(items[0].answerIndex).toBe(1)
  })

  it('ruta summarize sin clave devuelve 503 degradado', async () => {
    const res = await postSummarize({ subjectId: 's1', topic: 'fotosíntesis' })
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'IA no configurada' })
    expect(res.headers.get('x-openai-key')).toBeNull()
  })

  it('rate-limit de la IA devuelve 503 degradado sin 500', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-clave'
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }))
    const res = await postChat({ subjectId: 's1', message: 'fotosíntesis' })
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('IA no disponible')
    expect(res.headers.get('x-openai-key')).toBeNull()
  })

  it('materia de otro dueño devuelve 404 sin llamar a la IA', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-clave'
    store.subjects.push({
      id: 'ajena',
      userId: 'otro',
      name: 'Historia',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const res = await postChat({ subjectId: 'ajena', message: 'hola' })
    expect(res.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('chat con body inválido devuelve 400', async () => {
    const res = await POSTChat(new Request('http://localhost/api/chat', { method: 'POST', body: 'no-json' }))
    expect(res.status).toBe(400)
  })
})
