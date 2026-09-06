import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), persist: vi.fn() }))
vi.mock('@/lib/bedrock', () => ({ invokeBedrockJSON: mocks.invoke }))
vi.mock('@/lib/db', () => ({ getNeuroPlansPool: vi.fn().mockResolvedValue({}) }))
vi.mock('@/lib/db-query', () => ({ from: vi.fn(() => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'synthetic-consult', localizer_run_count: 0 } }) }) }),
  update: mocks.persist.mockImplementation(() => ({ eq: async () => ({}) })),
})) }))
vi.mock('@/lib/consult/planEvidence', () => ({ retrievePlanEvidence: vi.fn().mockResolvedValue({ guidelineText: 'Synthetic guideline', citations: ['Synthetic source'] }) }))
import { retrievePlanEvidence } from '@/lib/consult/planEvidence'
import { POST } from '@/app/api/ai/historian/localizer/route'

const symptoms = { primarySymptoms: ['Synthetic symptom'], redFlags: [], clinicalSummary: 'Synthetic summary',
  location: [], temporalPattern: [], severity: [], associatedFeatures: [] }
const detailInput = { extractedSymptoms: symptoms, guidelineContext: 'Synthetic guideline',
  chiefComplaint: null, sessionType: 'new_patient' }
const steer = {
  followUpQuestions: ['What makes the synthetic sensation better?'],
  localizationHypothesis: 'Synthetic compact localization',
  differential: [{ diagnosis: 'Synthetic compact candidate', likelihood: 'high' }],
  suggestedScaleId: 'hit6',
}
const detail = {
  followUpQuestions: ['When did the synthetic sensation start?'],
  localizationHypothesis: 'Synthetic detailed localization',
  differential: [{ diagnosis: 'Synthetic detailed candidate', likelihood: 'low', icd10: '', rationale: 'Synthetic support', evidence_against: 'Synthetic uncertainty' }],
  excluded: [{ diagnosis: 'Synthetic excluded candidate', reason: 'Synthetic reported evidence' }],
  contextHint: 'Synthetic context', confidence: 'medium',
  suggested_actions: [{ action: 'Synthetic action', rationale: 'Synthetic rationale', source: 'Synthetic source' }],
}
const request = (overrides: Record<string, unknown> = {}) => new NextRequest('http://localhost/api/ai/historian/localizer', {
  method: 'POST', body: JSON.stringify({ sessionId: 'synthetic-session', sessionType: 'new_patient',
    transcript: [{ role: 'user', text: 'Synthetic history', timestamp: 0 }], ...overrides }),
})
const abortError = () => new DOMException('Synthetic abort', 'AbortError')
const waitFor = <T>(ms: number, value: T) => new Promise<T>(resolve => setTimeout(() => resolve(value), ms))
let info: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('HISTORIAN_ATTENDING_ENABLED', 'false')
  info = vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  mocks.persist.mockClear()
  mocks.invoke.mockReset().mockImplementation(async opts => ({ parsed: opts.maxTokens === 500
    ? symptoms
    : opts.maxTokens === 300 ? steer : detail }))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers() })

function expectedLegacy(processingMs: number) {
  return { differential: detail.differential, excluded: detail.excluded, evidenceSnippets: [],
    followUpQuestions: detail.followUpQuestions, contextHint: detail.contextHint, confidence: detail.confidence,
    localizationHypothesis: detail.localizationHypothesis, kbSources: ['Synthetic source'],
    suggestedActions: detail.suggested_actions, processingMs, partial: false,
    push_payload: { top_differentials: ['Synthetic detailed candidate (medium)'],
      suggested_next_question: detail.followUpQuestions[0], suggested_scale_id: null } }
}

it('retains the 100 ms steer when detail rejects with AbortError', async () => {
  const original = mocks.invoke.getMockImplementation()!
  mocks.invoke.mockImplementation(opts => opts.maxTokens === 300 ? waitFor(100, { parsed: steer })
    : opts.maxTokens === 900 ? waitFor(200, null).then(() => { throw abortError() }) : original(opts))
  const pending = POST(request())
  await vi.advanceTimersByTimeAsync(200)
  const response = await pending
  const body = await response.json()
  expect(response.status).toBe(200)
  expect(body).toMatchObject({ followUpQuestions: steer.followUpQuestions, localizationHypothesis: steer.localizationHypothesis,
    differential: [{ ...steer.differential[0], icd10: '', rationale: '', evidence_against: '' }],
    excluded: [], suggestedActions: [], contextHint: '', confidence: 'low', partial: true,
    degradedReason: 'Differential detail timed out',
    push_payload: { top_differentials: [steer.differential[0].diagnosis], suggested_next_question: steer.followUpQuestions[0], suggested_scale_id: 'hit6' } })
  expect(JSON.parse(mocks.persist.mock.calls[0][0].localizer_differential)).toEqual(body.differential)
  expect(JSON.parse(info.mock.calls[0][0])).toMatchObject({ step3a_ms: 100, step3b_ms: 200, total_ms: 200, aborted: ['step3b'] })
})

it('uses the byte-compatible legacy shape and persists detail when both resolve', async () => {
  const body = await (await POST(request())).json()
  expect(body).toEqual(expectedLegacy(0))
  expect(JSON.parse(mocks.persist.mock.calls[0][0].localizer_differential)).toEqual(detail.differential)
  const calls = mocks.invoke.mock.calls.map(([opts]) => opts)
  expect(calls.map(opts => opts.maxTokens)).toEqual([500, 300, 900])
  expect(calls[1].messages).toEqual(calls[2].messages)
  expect(calls[1].signal).toBe(calls[2].signal)
  expect(calls[1].temperature).toBe(0.3)
  expect(calls[2].temperature).toBe(0.3)
})

it('preserves the legacy response when steer rejects and detail resolves', async () => {
  const original = mocks.invoke.getMockImplementation()!
  mocks.invoke.mockImplementation(opts => opts.maxTokens === 300 ? Promise.reject(abortError()) : original(opts))
  expect(await (await POST(request())).json()).toEqual(expectedLegacy(0))
})

it('emits exactly one content-free JSON timing line with the complete key set', async () => {
  await POST(request())
  expect(info).toHaveBeenCalledTimes(1)
  const line = info.mock.calls[0][0]
  expect(JSON.parse(line)).toEqual({ event: 'localizer_timing', mode: 'full', sessionId: 'synthetic-session',
    step1_ms: 0, step2_ms: 0, step3a_ms: 0, step3b_ms: 0, attending_ms: null, total_ms: 0, partial: false, aborted: [] })
  for (const value of [...steer.followUpQuestions, ...detail.followUpQuestions,
    steer.differential[0].diagnosis, detail.differential[0].diagnosis, detail.excluded[0].diagnosis]) expect(line).not.toContain(value)
})

it.each([true, false])('preserves outer timeout semantics with completed steer = %s', async completedSteer => {
  const original = mocks.invoke.getMockImplementation()!
  mocks.invoke.mockImplementation(opts => opts.maxTokens === 900 || (!completedSteer && opts.maxTokens === 300)
    ? new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(abortError()), { once: true }))
    : opts.maxTokens === 300 ? waitFor(100, { parsed: steer }) : original(opts))
  const pending = POST(request())
  await vi.advanceTimersByTimeAsync(15000)
  const response = await pending
  const body = await response.json()
  expect(response.status).toBe(200)
  expect(body.partial).toBe(true)
  expect(body.degradedReason).toBe(completedSteer ? 'Differential detail timed out' : 'Timeout after 15000ms')
  expect(body.push_payload.suggested_next_question).toBe(completedSteer ? steer.followUpQuestions[0] : null)
  expect(JSON.parse(info.mock.calls[0][0])).toMatchObject({ total_ms: 15000, partial: true,
    aborted: completedSteer ? ['step3b'] : ['step3a', 'step3b'] })
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['not-a-scale', 'toString', 'nihss', 'moca', 'mini_cog'])('rejects an unregistered or non-voice-administrable scale id: %s', async suggestedScaleId => {
  const original = mocks.invoke.getMockImplementation()!
  mocks.invoke.mockImplementation(opts => opts.maxTokens === 300 ? Promise.resolve({ parsed: { ...steer, suggestedScaleId } })
    : opts.maxTokens === 900 ? Promise.reject(new Error('Synthetic failure')) : original(opts))
  const body = await (await POST(request())).json()
  expect(body.push_payload.suggested_scale_id).toBeNull()
  expect(body.degradedReason).toBe('Question generation failed')
})

it('drops a steer question that names a diagnosis before it can reach Henry', async () => {
  const original = mocks.invoke.getMockImplementation()!
  mocks.invoke.mockImplementation(opts => opts.maxTokens === 300
    ? Promise.resolve({ parsed: { ...steer, followUpQuestions: ['Have you had a stroke before?', 'Any history of MS?', steer.followUpQuestions[0]] } })
    : opts.maxTokens === 900 ? Promise.reject(abortError()) : original(opts))
  const body = await (await POST(request())).json()
  expect(body.push_payload.suggested_next_question).toBe(steer.followUpQuestions[0])
  expect(body.followUpQuestions).toEqual([steer.followUpQuestions[0]])
})


it.each([false, true])('steer skips detail and returns transport inputs, attending gated = %s', async attending => {
  vi.stubEnv('HISTORIAN_ATTENDING_ENABLED', String(attending))
  vi.stubEnv('HISTORIAN_ATTENDING_INTERVAL', '1')
  const response = await POST(request({ mode: 'steer', localizerCycle: 1,
    fullTranscript: Array.from({ length: 6 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: 'Synthetic turn' })) }))
  const body = await response.json()
  expect(body).toMatchObject({ partial: false, detail_input: detailInput, excluded: [],
    push_payload: { top_differentials: [steer.differential[0].diagnosis] } })
  expect(body.degradedReason).toBeUndefined()
  expect(mocks.invoke.mock.calls.map(([opts]) => opts.maxTokens)).toEqual(attending ? [500, 300, 900] : [500, 300])
  expect(mocks.invoke.mock.calls.some(([opts]) => opts.system.includes('Rules for differential:'))).toBe(false)
  if (attending) expect(body.attending_meta.ran).toBe(true)
})

it('detail alone succeeds after 16 seconds with a distinct 25-second signal and no live payload', async () => {
  await POST(request({ mode: 'steer' }))
  const steerSignal = mocks.invoke.mock.calls[0][0].signal
  mocks.invoke.mockClear()
  vi.mocked(retrievePlanEvidence).mockClear()
  mocks.persist.mockClear()
  info.mockClear()
  mocks.invoke.mockImplementation(opts => waitFor(16000, { parsed: detail }).then(value => {
    opts.signal.throwIfAborted()
    return value
  }))
  const pending = POST(request({ mode: 'detail', transcript: undefined, detail_input: detailInput }))
  await vi.advanceTimersByTimeAsync(16000)
  const body = await (await pending).json()
  expect(body).toMatchObject({ differential: detail.differential, partial: false, processingMs: 16000 })
  expect(mocks.invoke).toHaveBeenCalledTimes(1)
  const opts = mocks.invoke.mock.calls[0][0]
  expect(opts).toMatchObject({ maxTokens: 900, temperature: 0.3 })
  expect(opts.signal).not.toBe(steerSignal)
  expect(opts.signal.aborted).toBe(false)
  expect(vi.mocked(retrievePlanEvidence)).not.toHaveBeenCalled()
  expect(mocks.persist.mock.calls[0][0]).not.toHaveProperty('localizer_kb_sources')
  expect(JSON.parse(opts.messages[0].content)).toEqual({ ...detailInput, transcriptSummary: symptoms.clinicalSummary })
  expect(Object.keys(body).some(key => key === 'push_payload' || key.startsWith('attending_'))).toBe(false)
  expect(JSON.parse(mocks.persist.mock.calls[0][0].localizer_differential)).toEqual(detail.differential)
  expect(JSON.parse(info.mock.calls[0][0])).toEqual({ event: 'localizer_timing', mode: 'detail', sessionId: 'synthetic-session',
    step3b_ms: 16000, total_ms: 16000, partial: false, aborted: false })
  for (const value of [symptoms.clinicalSummary, ...symptoms.primarySymptoms, detailInput.guidelineContext,
    ...detail.followUpQuestions, detail.differential[0].diagnosis]) expect(info.mock.calls[0][0]).not.toContain(value)
  expect(vi.getTimerCount()).toBe(0)
})

it('detail aborts at 25 seconds and does not persist failed detail', async () => {
  mocks.invoke.mockImplementation(opts => new Promise((_, reject) =>
    opts.signal.addEventListener('abort', () => reject(abortError()), { once: true })))
  const pending = POST(request({ mode: 'detail', detail_input: detailInput }))
  await vi.advanceTimersByTimeAsync(24999)
  expect(mocks.invoke.mock.calls[0][0].signal.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(await (await pending).json()).toMatchObject({ partial: true, degradedReason: 'Differential detail timed out', processingMs: 25000 })
  expect(mocks.persist).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['full', 'detail'])('%s caps counts without shortening clinical wording', async mode => {
  const longText = 'Synthetic clinical reasoning. '.repeat(6).trim()
  const oversized = { ...detail,
    differential: Array.from({ length: 5 }, () => ({ ...detail.differential[0], rationale: longText, evidence_against: longText })),
    excluded: Array.from({ length: 4 }, () => ({ ...detail.excluded[0], reason: longText })),
    followUpQuestions: Array.from({ length: 5 }, () => detail.followUpQuestions[0]),
  }
  const original = mocks.invoke.getMockImplementation()!
  mocks.invoke.mockImplementation(opts => opts.maxTokens === 900 ? Promise.resolve({ parsed: oversized }) : original(opts))
  const body = await (await POST(request({ mode, detail_input: detailInput }))).json()
  expect(body.differential).toEqual(oversized.differential.slice(0, 3))
  expect(body.excluded).toEqual(oversized.excluded.slice(0, 2))
  expect(body.followUpQuestions).toEqual(oversized.followUpQuestions.slice(0, 3))
  expect(JSON.parse(mocks.persist.mock.calls[0][0].localizer_differential)).toHaveLength(3)
})

it.each([undefined, null, {}, { ...detailInput, extractedSymptoms: {} },
  { ...detailInput, sessionType: 'bad' }, { ...detailInput, guidelineContext: 3 },
  { ...detailInput, extractedSymptoms: { ...symptoms, redFlags: [123] } },
])('rejects missing or invalid detail inputs without model work: %j', async detail_input => {
  expect((await POST(request({ mode: 'detail', detail_input }))).status).toBe(400)
  expect(mocks.invoke).not.toHaveBeenCalled()
})
