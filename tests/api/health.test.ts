import { describe, it, expect } from 'vitest'
import { GET } from '../../app/api/health/route'

describe('GET /api/health', () => {
  it('GET /api/health devuelve 200', async () => {
    const res = await GET(new Request('http://localhost/api/health'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
