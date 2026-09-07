import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Covers the session-keyed Localizer persistence fix: standalone
 * /patient/historian sessions have no neurology_consults row at
 * localizer-run time, so the pre-existing persistLocalizerResults()
 * (src/app/api/ai/historian/localizer/route.ts) returned early and never
 * stored anything for them — /rnd/historian's runs route (which reads
 * localizer_* off neurology_consults) never saw live-localizer signal for
 * those sessions.
 *
 * persistLocalizerResults now ALWAYS upserts into
 * historian_localizer_results (migration 064), keyed by session id, then
 * runs the pre-existing consult-linked update unchanged when a consult is
 * linked. The session upsert must be non-fatal (the caller fire-and-forgets
 * it) and must fail open — swallowed and logged once per process — when the
 * table doesn't exist yet (Postgres 42P01, expected until migration 064 is
 * applied with psql).
 */
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  query: vi.fn(),
  consultUpdate: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('@/lib/bedrock', () => ({ invokeBedrockJSON: mocks.invoke }))
vi.mock('@/lib/db', () => ({
  getNeuroPlansPool: vi.fn().mockResolvedValue({}),
  getPool: vi.fn().mockResolvedValue({ query: mocks.query }),
}))
vi.mock('@/lib/db-query', () => ({
  from: vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
    update: mocks.consultUpdate.mockImplementation(() => ({ eq: async () => ({}) })),
  })),
}))
vi.mock('@/lib/consult/planEvidence', () => ({
  retrievePlanEvidence: vi.fn().mockResolvedValue({ guidelineText: 'Synthetic guideline', citations: [] }),
}))

import { POST } from '@/app/api/ai/historian/localizer/route'

const symptoms = {
  primarySymptoms: ['Synthetic symptom'], redFlags: [], clinicalSummary: 'Synthetic summary',
  location: [], temporalPattern: [], severity: [], associatedFeatures: [],
}
const steer = {
  followUpQuestions: ['Synthetic steer question'], localizationHypothesis: 'Synthetic steer localization',
  differential: [{ diagnosis: 'Synthetic steer candidate', likelihood: 'high' }], suggestedScaleId: null,
}
const detail = {
  followUpQuestions: ['Synthetic detail question'], localizationHypothesis: 'Synthetic detail localization',
  differential: [{ diagnosis: 'Synthetic detail candidate', likelihood: 'low', icd10: '', rationale: '', evidence_against: '' }],
  excluded: [], contextHint: '', confidence: 'medium', suggested_actions: [],
}

function request(sessionId: string) {
  return new NextRequest('http://localhost/api/ai/historian/localizer', {
    method: 'POST',
    body: JSON.stringify({
      sessionId, sessionType: 'new_patient',
      transcript: [{ role: 'user', text: 'Synthetic history', timestamp: 0 }],
    }),
  })
}

beforeEach(() => {
  vi.stubEnv('HISTORIAN_ATTENDING_ENABLED', 'false')
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.query.mockReset().mockResolvedValue({ rows: [] })
  mocks.consultUpdate.mockClear()
  mocks.maybeSingle.mockReset().mockResolvedValue({ data: null })
  mocks.invoke.mockReset().mockImplementation(async (opts) => ({
    parsed: opts.maxTokens === 500 ? symptoms : opts.maxTokens === 300 ? steer : detail,
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('session-keyed localizer persistence (historian_localizer_results)', () => {
  it('upserts by session id for a standalone session with no linked consult', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null })
    const res = await POST(request('standalone-session'))
    expect(res.status).toBe(200)
    // Persistence is fire-and-forget (the route never awaits it) — awaiting
    // the body gives its microtasks a chance to settle before asserting.
    await res.json()

    expect(mocks.query).toHaveBeenCalledTimes(1)
    const [sql, values] = mocks.query.mock.calls[0]
    expect(sql).toContain('INSERT INTO historian_localizer_results')
    expect(sql).toContain('ON CONFLICT (session_id) DO UPDATE')
    expect(sql).toContain('run_count = historian_localizer_results.run_count + 1')
    expect(values[0]).toBe('standalone-session')

    // No consult linked — the pre-existing neurology_consults update must
    // not fire (this is the exact case the fix targets: previously
    // persistLocalizerResults returned early here and wrote nothing at all).
    expect(mocks.consultUpdate).not.toHaveBeenCalled()
  })

  it('still issues the neurology_consults update when a consult is linked, in addition to the session upsert', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: 'consult-1', localizer_run_count: 2 } })
    const res = await POST(request('linked-session'))
    expect(res.status).toBe(200)
    await res.json()

    // Session-keyed upsert always fires...
    expect(mocks.query).toHaveBeenCalledTimes(1)
    expect(mocks.query.mock.calls[0][1][0]).toBe('linked-session')

    // ...and the existing consult-linked behavior is unchanged.
    expect(mocks.consultUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.consultUpdate.mock.calls[0][0]).toMatchObject({ localizer_run_count: 3 })
  })

  it('swallows a 42P01 (undefined_table) on the session upsert and logs one quiet info line, not an error', async () => {
    mocks.query.mockRejectedValue(
      Object.assign(new Error('relation "historian_localizer_results" does not exist'), { code: '42P01' }),
    )
    const infoSpy = vi.spyOn(console, 'info')
    const errorSpy = vi.spyOn(console, 'error')

    const res1 = await POST(request('session-a'))
    expect(res1.status).toBe(200)
    const res2 = await POST(request('session-b'))
    expect(res2.status).toBe(200)

    // Logged once per process (module-level flag), not once per failed run.
    const infoText = infoSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect((infoText.match(/historian_localizer_results not available yet/g) || []).length).toBe(1)

    // Must never surface as an error-level log — it is expected/benign
    // until migration 064 is applied.
    const errorText = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(errorText).not.toMatch(/session-keyed persist failed/)

    // The route response itself is unaffected — non-fatal, no delay/fail.
    const body2 = await res2.json()
    expect(body2.differential.length).toBeGreaterThan(0)
  })

  it('logs a real (non-42P01) session-upsert error at error level, still non-fatal to the response', async () => {
    mocks.query.mockRejectedValue(Object.assign(new Error('connection terminated unexpectedly'), { code: '57P01' }))
    const errorSpy = vi.spyOn(console, 'error')

    const res = await POST(request('session-c'))
    expect(res.status).toBe(200)
    await res.json()

    const errorText = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(errorText).toMatch(/session-keyed persist failed \(non-fatal\)/)
  })
})
