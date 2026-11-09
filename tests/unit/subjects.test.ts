import { describe, it, expect, vi, beforeEach } from 'vitest'

type SubjectRow = {
  id: string
  userId: string
  name: string
  createdAt: Date
  updatedAt: Date
}

// Store en memoria + mock de lib/db (mismo patrón que tests/api/auth-guard.test.ts):
// el test verifica el scoping por dueño sin requerir Postgres real (R-01).
const { store } = vi.hoisted(() => ({
  store: { subjects: [] as SubjectRow[] },
}))

vi.mock('../../lib/db', () => ({
  prisma: {
    subject: {
      create: vi.fn(
        async ({ data }: { data: { userId: string; name: string } }) => {
          const now = new Date()
          const row: SubjectRow = {
            id: `subj-${store.subjects.length + 1}`,
            userId: data.userId,
            name: data.name,
            createdAt: now,
            updatedAt: now,
          }
          store.subjects.push(row)
          return { ...row }
        },
      ),
      findMany: vi.fn(
        async ({ where }: { where: { userId: string } }) =>
          store.subjects
            .filter((s) => s.userId === where.userId)
            .map((s) => ({ ...s })),
      ),
    },
  },
}))

import { createSubject, listSubjects } from '../../lib/subjects'

describe('materias con scoping por dueño', () => {
  beforeEach(() => {
    store.subjects.length = 0
  })

  it('createSubject persiste scoped por userId', async () => {
    const s = await createSubject('u1', 'Biología')
    expect(s.userId).toBe('u1')
    expect(await listSubjects('u2')).toEqual([])
  })

  it('listSubjects solo devuelve las materias del dueño', async () => {
    await createSubject('u1', 'Biología')
    await createSubject('u1', 'Historia')
    const mine = await listSubjects('u1')
    expect(mine.map((s) => s.name).sort()).toEqual(['Biología', 'Historia'])
    expect(await listSubjects('u3')).toEqual([])
  })
})
