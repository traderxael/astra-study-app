// tests/api/files.test.ts — Task 4 (TDD, sin DB real, R-01).
// Mockea requireSession, prisma (store en memoria) y storage.
// - Review Focus 1: upload >10MB -> 400 sin huerfanos (sin fila File ni saveFile).
// - Review Focus 2: PDF escaneado sin texto -> 422 { error: 'v1 solo texto digital, OCR en v2' }.

import { describe, it, expect, vi, beforeEach } from 'vitest'

type SubjectRow = {
  id: string
  userId: string
  name: string
  createdAt: Date
  updatedAt: Date
}
type FileRow = {
  id: string
  userId: string
  subjectId: string
  name: string
  mimeType: string
  size: number
  status: string
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

const { store, mockSaveFile, mockDeleteFile } = vi.hoisted(() => ({
  store: {
    subjects: [] as SubjectRow[],
    files: [] as FileRow[],
    chunks: [] as ChunkRow[],
  },
  mockSaveFile: vi.fn(),
  mockDeleteFile: vi.fn(),
}))

vi.mock('../../lib/auth-guard', () => ({
  requireSession: vi.fn(async () => ({
    user: { id: 'admin', email: 'estudio@local', name: 'Estudio' },
    expires: new Date(Date.now() + 86400000).toISOString(),
  })),
}))

vi.mock('../../lib/storage', () => ({
  saveFile: mockSaveFile,
  deleteFile: mockDeleteFile,
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  buildStoragePath: (userId: string, subjectId: string, filename: string) =>
    `${userId}/${subjectId}/${filename.split('/').pop()?.split('\\').pop() ?? filename}`,
}))

vi.mock('../../lib/db', () => ({
  prisma: {
    subject: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = store.subjects.find((s) => s.id === where.id)
        return row ? { ...row } : null
      }),
    },
    file: {
      create: vi.fn(
        async ({ data }: { data: Omit<FileRow, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status?: string } }) => {
          const now = new Date()
          const row: FileRow = {
            id: `file-${store.files.length + 1}`,
            userId: data.userId,
            subjectId: data.subjectId,
            name: data.name,
            mimeType: data.mimeType,
            size: data.size,
            status: data.status ?? 'uploaded',
            createdAt: now,
            updatedAt: now,
          }
          store.files.push(row)
          return { ...row }
        },
      ),
      delete: vi.fn(
        async ({ where }: { where: { id: string } }) => {
          const i = store.files.findIndex((f) => f.id === where.id)
          if (i >= 0) store.files.splice(i, 1)
          return { id: where.id }
        },
      ),
    },
    chunk: {
      createMany: vi.fn(
        async ({ data }: { data: ChunkRow[] }) => {
          for (const d of data) {
            store.chunks.push({
              ...d,
              id: `chunk-${store.chunks.length + 1}`,
              createdAt: new Date(),
            })
          }
          return { count: data.length }
        },
      ),
      deleteMany: vi.fn(
        async ({ where }: { where: { fileId: string } }) => {
          const before = store.chunks.length
          store.chunks = store.chunks.filter((c) => c.fileId !== where.fileId)
          return { count: before - store.chunks.length }
        },
      ),
    },
  },
}))

// pdf-parse mockeado: 'scanned' simula PDF escaneado (texto vacio).
vi.mock('pdf-parse', () => ({
  default: vi.fn(async (buf: Buffer) => {
    const s = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf)
    if (s.includes('scanned')) return { text: '   \n' }
    return { text: 'hola pdf digital' }
  }),
}))

import { POST } from '../../app/api/subjects/[subjectId]/files/route'

function postArgs(file: File, subjectId = 'subj-1'): {
  req: Request
  ctx: { params: Promise<{ subjectId: string }> }
} {
  const fd = new FormData()
  fd.append('file', file)
  const req = new Request(`http://localhost/api/subjects/${subjectId}/files`, {
    method: 'POST',
    body: fd,
  })
  return { req, ctx: { params: Promise.resolve({ subjectId }) } }
}

async function countFiles(): Promise<number> {
  return store.files.length
}

describe('POST /api/subjects/:id/files — ingeston', () => {
  beforeEach(() => {
    store.subjects.length = 0
    store.files.length = 0
    store.chunks.length = 0
    mockSaveFile.mockReset()
    mockDeleteFile.mockReset()
    mockSaveFile.mockImplementation(
      async (_userId: string, _subjectId: string, file: { name: string }) =>
        `admin/subj-1/${file.name}`,
    )
    store.subjects.push({
      id: 'subj-1',
      userId: 'admin',
      name: 'Biologia',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  it('rechaza upload >10MB sin huerfanos (Review Focus 1)', async () => {
    const big = new File(
      [new Uint8Array(11 * 1024 * 1024)],
      'grande.pdf',
      { type: 'application/pdf' },
    )
    const { req, ctx } = postArgs(big)
    const res = await POST(req, ctx)
    expect(res.status).toBe(400)
    expect(await countFiles()).toBe(0)
    expect(mockSaveFile).not.toHaveBeenCalled()
    expect(store.chunks).toEqual([])
  })

  it('PDF escaneado sin texto devuelve mensaje v2 sin crash (Review Focus 2)', async () => {
    const scanned = new File(
      ['scanned-pdf-bytes'],
      'escaneo.pdf',
      { type: 'application/pdf' },
    )
    const { req, ctx } = postArgs(scanned)
    const res = await POST(req, ctx)
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({
      error: 'v1 solo texto digital, OCR en v2',
    })
    expect(await countFiles()).toBe(0)
    expect(mockSaveFile).not.toHaveBeenCalled()
  })

  it('acepta un .txt y crea File + chunks (happy path)', async () => {
    const txt = new File(['hola mundo fotosintesis'], 'notas.txt', {
      type: 'text/plain',
    })
    const { req, ctx } = postArgs(txt)
    const res = await POST(req, ctx)
    expect(res.status).toBe(201)
    expect(await countFiles()).toBe(1)
    expect(store.chunks.length).toBeGreaterThan(0)
    expect(mockSaveFile).toHaveBeenCalledOnce()
  })

  it('rechaza materia de otro dueno con 404 sin guardar', async () => {
    store.subjects.push({
      id: 'subj-ajena',
      userId: 'otro',
      name: 'Historia',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const txt = new File(['hola'], 'notas.txt', { type: 'text/plain' })
    const { req, ctx } = postArgs(txt, 'subj-ajena')
    const res = await POST(req, ctx)
    expect(res.status).toBe(404)
    expect(await countFiles()).toBe(0)
    expect(mockSaveFile).not.toHaveBeenCalled()
  })
})
