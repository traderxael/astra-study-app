import { describe, it, expect, vi, beforeEach } from 'vitest'

// mockAuth se crea con vi.hoisted para poder usarlo dentro de los factories
// de vi.mock (que se elevan al inicio del archivo).
const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }))

vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    auth: mockAuth,
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}))

vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn((config: unknown) => config),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('../../lib/auth', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../lib/auth')>()
  return {
    ...mod,
    auth: mockAuth,
  }
})

import { requireSession } from '../../lib/auth-guard'
import { login } from '../../lib/auth'

describe('auth privada — guarda de rutas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ruta privada sin sesion redirige a /login (Review Focus 5)', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(requireSession()).rejects.toThrowError('REDIRECT:/login')
  })

  it('ruta privada sin user.id redirige a /login', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'estudio@local' } })
    await expect(requireSession()).rejects.toThrowError('REDIRECT:/login')
  })

  it('ruta privada con sesion valida no redirige', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'admin', email: 'estudio@local', name: 'Estudio' },
      expires: new Date(Date.now() + 86400000).toISOString(),
    })
    const session = await requireSession()
    expect(session.user?.id).toBe('admin')
    expect(session.user?.email).toBe('estudio@local')
  })

  it('login email valido crea sesion y entra a /(app)', async () => {
    const res = await login({ email: 'estudio@local', password: 'test-pass' })
    expect(res.status).toBe(302)
  })

  it('login con password incorrecta no crea sesion', async () => {
    const res = await login({ email: 'estudio@local', password: 'wrong-password' })
    expect(res.status).toBe(401)
  })

  it('login con email incorrecto no crea sesion', async () => {
    const res = await login({ email: 'otro@local', password: 'test-pass' })
    expect(res.status).toBe(401)
  })
})
