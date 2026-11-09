// tests/unit/text-extract.test.ts — Task 4 (TDD, sin DB real, R-01).
// - extractText: PDF vía pdf-parse (mockeado) y .txt/.md vía UTF-8.
// - chunkText: ~2000 chars, overlap 200.
// - retrieveChunks: keyword scoped por subjectId.

import { describe, it, expect, vi, beforeEach } from 'vitest'

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
  store: { chunks: [] as ChunkRow[] },
}))

vi.mock('../../lib/db', () => ({
  prisma: {
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

// pdf-parse mockeado: el marcador 'scanned' simula un PDF escaneado
// (pdf-parse devuelve texto vacío), el resto devuelve texto digital.
vi.mock('pdf-parse', () => ({
  default: vi.fn(async (buf: Buffer) => {
    const s = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf)
    if (s.includes('scanned')) return { text: '   \n' }
    return { text: 'hola pdf digital' }
  }),
}))

import { extractText } from '../../lib/text-extract'
import { chunkText } from '../../lib/chunk'
import { retrieveChunks } from '../../lib/retrieval'

function fakeFile(
  name: string,
  content: string,
  type: string,
): {
  name: string
  type: string
  size: number
  arrayBuffer: () => Promise<ArrayBuffer>
} {
  const bytes = new TextEncoder().encode(content)
  return {
    name,
    type,
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  }
}

describe('chunkText — bloques ~2000 chars con overlap 200', () => {
  it('chunkText parte en bloques de ~500 tokens con overlap', () => {
    const chunks = chunkText('x'.repeat(5000))
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('chunkText devuelve un solo bloque para texto corto', () => {
    expect(chunkText('hola mundo')).toEqual(['hola mundo'])
  })

  it('chunkText con texto vacio devuelve []', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   ')).toEqual([])
  })

  it('chunkText aplica overlap de 200 chars entre bloques contiguos', () => {
    const text = 'a'.repeat(1500) + 'b'.repeat(1500)
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThan(1)
    // El siguiente bloque debe re-incluir los ultimos 200 chars del anterior.
    expect(chunks[1].startsWith(chunks[0].slice(-200))).toBe(true)
  })
})

describe('extractText — pdf-parse para PDF, UTF-8 para .txt/.md', () => {
  it('extrae texto de un .txt con decoder UTF-8', async () => {
    const text = await extractText(
      fakeFile('notas.txt', 'fotosíntesis y mitosis', 'text/plain'),
    )
    expect(text).toContain('fotosíntesis')
  })

  it('extrae texto de un .md con decoder UTF-8', async () => {
    const text = await extractText(
      fakeFile('notas.md', '# Titulo\n\ncontenido markdown', 'text/markdown'),
    )
    expect(text).toContain('contenido markdown')
  })

  it('extrae texto digital de un PDF via pdf-parse', async () => {
    const text = await extractText(
      fakeFile('tema.pdf', '%PDF-1.4 digital', 'application/pdf'),
    )
    expect(text).toContain('hola pdf digital')
  })

  it('PDF escaneado sin texto lanza error v2 sin crash', async () => {
    await expect(
      extractText(fakeFile('escaneo.pdf', 'scanned-pdf-bytes', 'application/pdf')),
    ).rejects.toThrow('v1 solo texto digital, OCR en v2')
  })
})

describe('retrieveChunks — ranking keyword scoped por subjectId', () => {
  beforeEach(() => {
    store.chunks.length = 0
  })

  function push(
    subjectId: string,
    content: string,
    chunkIndex = 0,
  ): void {
    store.chunks.push({
      id: `c-${store.chunks.length + 1}`,
      userId: 'admin',
      subjectId,
      fileId: 'f-1',
      chunkIndex,
      content,
      tokenCount: 1,
      createdAt: new Date(),
    })
  }

  it('devuelve los chunks con mas ocurrencias primero y respeta k', async () => {
    push('s1', 'fotosintesis fotosintesis fotosintesis')
    push('s1', 'fotosintesis respiracion')
    push('s1', 'historia antigua romana')
    const ranked = await retrieveChunks('s1', 'fotosintesis', 1)
    expect(ranked).toHaveLength(1)
    expect(ranked[0].content).toContain('fotosintesis fotosintesis')
  })

  it('solo busca dentro del subjectId dado', async () => {
    push('s1', 'fotosintesis aqui')
    push('s2', 'fotosintesis fotosintesis fotosintesis')
    const ranked = await retrieveChunks('s1', 'fotosintesis')
    expect(ranked).toHaveLength(1)
    expect(ranked[0].subjectId).toBe('s1')
  })

  it('query sin coincidencias devuelve []', async () => {
    push('s1', 'fotosintesis aqui')
    expect(await retrieveChunks('s1', 'inexistente')).toEqual([])
  })
})
