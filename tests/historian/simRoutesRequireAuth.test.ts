/**
 * Guards the historian simulator's API surface.
 *
 * The middleware exempts everything under /api/ from auth, so each of these
 * routes has to gate itself. That is easy to forget when adding the next one,
 * and the symptom is silent — the route simply answers everybody. So the
 * coverage check below is a directory scan rather than a per-route test: a new
 * file under sim/ that forgets the guard fails CI on the day it is added.
 *
 * The second half asserts the boundary in the other direction. The
 * patient-facing interview routes must NOT get this guard: /patient is a
 * PUBLIC_ROUTE and interviewees have no Cognito session, so adding it there
 * would break a live interview. That is a deliberate asymmetry, and it is
 * exactly the kind of thing a well-meaning follow-up change flattens.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect, vi, beforeEach } from 'vitest'

const SIM_DIR = join(process.cwd(), 'src/app/api/ai/historian/sim')
const HISTORIAN_API_DIR = join(process.cwd(), 'src/app/api/ai/historian')

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...routeFiles(full))
    else if (entry === 'route.ts') out.push(full)
  }
  return out
}

const HANDLER_RE = /^export async function (GET|POST|PUT|PATCH|DELETE)\s*\(/gm

describe('historian simulator routes require authentication', () => {
  const files = routeFiles(SIM_DIR)

  it('finds the simulator routes at all (guards against a silent empty scan)', () => {
    expect(files.length).toBeGreaterThanOrEqual(7)
  })

  it.each(files.map((f) => [f.replace(process.cwd() + '/', ''), f]))(
    '%s imports the guard and calls it in every handler',
    (_label, full) => {
      const src = readFileSync(full, 'utf8')
      expect(src).toContain("from '@/lib/historian/simAuth'")

      const handlers = src.match(HANDLER_RE) ?? []
      expect(handlers.length).toBeGreaterThan(0)
      // One `await requireSimUser()` per exported handler.
      const calls = src.match(/await requireSimUser\(\)/g) ?? []
      expect(calls.length).toBe(handlers.length)
    },
  )
})

describe('patient-facing historian routes stay open by design', () => {
  // /patient is in PUBLIC_ROUTES; these are called by an interviewee with no
  // Cognito session. Gating them on getUser() would break the live interview.
  const PATIENT_FACING = [
    'session/route.ts',
    'session-renew/route.ts',
    'transcript-flush/route.ts',
    'save/route.ts',
    'scales/route.ts',
  ]

  it.each(PATIENT_FACING)('%s does not use the clinician-only sim guard', (rel) => {
    const src = readFileSync(join(HISTORIAN_API_DIR, rel), 'utf8')
    expect(src).not.toContain('requireSimUser')
  })
})

describe('requireSimUser', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('returns a 401 response when there is no user', async () => {
    vi.doMock('@/lib/cognito/server', () => ({ getUser: vi.fn().mockResolvedValue(null) }))
    const { requireSimUser } = await import('@/lib/historian/simAuth')

    const denied = await requireSimUser()
    expect(denied).not.toBeNull()
    expect(denied!.status).toBe(401)
    await expect(denied!.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns null when the caller is authenticated', async () => {
    vi.doMock('@/lib/cognito/server', () => ({
      getUser: vi.fn().mockResolvedValue({ sub: 'abc', email: 'clinician@sevaro.com' }),
    }))
    const { requireSimUser } = await import('@/lib/historian/simAuth')

    await expect(requireSimUser()).resolves.toBeNull()
  })
})
