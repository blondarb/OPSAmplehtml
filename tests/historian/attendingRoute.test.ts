import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const originalAny = AbortSignal.any

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/bedrock', () => ({ invokeBedrockJSON: mocks.invoke }))
vi.mock('@/lib/db', () => ({ getNeuroPlansPool: vi.fn().mockResolvedValue({}) }))
vi.mock('@/lib/db-query', () => ({ from: vi.fn(() => { throw new Error('Unexpected persistence') }) }))
vi.mock('@/lib/consult/planEvidence', () => ({ retrievePlanEvidence: vi.fn().mockResolvedValue({ guidelineText: 'Synthetic guideline', citations: [] }) }))
import { POST } from '@/app/api/ai/historian/localizer/route'

const step3 = { followUpQuestions: ['When did this start?'], differential: [], localizationHypothesis: '', contextHint: 'Synthetic hint', confidence: 'medium' }
const turns = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'user' : 'assistant', text: `Synthetic turn ${i}` }))
const attending = { gaps: ['timing', 'medicine', 'family', 'function'].map(topic => ({ topic, question: `Can you tell me about ${topic}?`, why: 'Not yet asked.' })) }
const isAttending = (opts: { system: string }) => opts.system.startsWith('You are the attending neurologist')
const request = (extra = {}) => new NextRequest('http://localhost/api/ai/historian/localizer', {
  method: 'POST', body: JSON.stringify({ sessionId: 'synthetic-session', sessionType: 'new_patient', transcript: turns, ...extra }),
})

beforeEach(() => {
  vi.stubEnv('HISTORIAN_ATTENDING_ENABLED', 'false')
  vi.stubEnv('HISTORIAN_ATTENDING_INTERVAL', '2')
  mocks.invoke.mockReset().mockImplementation(async opts => ({ parsed: isAttending(opts) ? attending
    : opts.system.includes('Generate clinically targeted follow-up questions') ? step3
    : { primarySymptoms: ['synthetic symptom'], redFlags: [], clinicalSummary: 'Synthetic summary' } }))
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); Object.defineProperty(AbortSignal, 'any', { value: originalAny, configurable: true, writable: true }); vi.useRealTimers() })

it('flag off preserves Step 3 and omits attending fields for an old client', async () => {
  const response = await POST(request())
  const body = await response.json()
  expect(response.status).toBe(200)
  expect(body.followUpQuestions).toEqual(step3.followUpQuestions)
  expect(body.push_payload).toEqual({ top_differentials: [], suggested_next_question: step3.followUpQuestions[0], suggested_scale_id: null })
  expect(body).not.toHaveProperty('attending_gaps')
  expect(body).not.toHaveProperty('attending_meta')
  // Step 1 + Step 3a steer + Step 3b detail (PR #215); attending must not add a 4th call.
  expect(mocks.invoke).toHaveBeenCalledTimes(3)
})

it('runs on interval with full transcript and returns at most three sanitized questions', async () => {
  vi.stubEnv('HISTORIAN_ATTENDING_ENABLED', 'true')
  const fullTranscript = [{ role: 'user', text: 'Earlier synthetic answer' }, ...turns]
  const response = await POST(request({ fullTranscript, localizerCycle: 2 }))
  const body = await response.json()
  expect(body.push_payload.attending_gaps).toHaveLength(3)
  expect(body.attending_gaps).toEqual(body.push_payload.attending_gaps)
  expect(body.attending_meta).toMatchObject({ ran: true, dropped_turns: 0 })
  const opts = mocks.invoke.mock.calls.find(([o]) => isAttending(o))![0]
  expect(JSON.parse(opts.messages[0].content).transcriptWindow).toEqual(fullTranscript)
  expect(opts.signal).toBeInstanceOf(AbortSignal)
  expect(opts.model).toBeUndefined() // Same helper default as Step 3.
})

it.each([...[true, 'true', 1, '1'].map(safetyEscalated => ({ safetyEscalated, localizerCycle: 2 })), { localizerCycle: 3 }])('skips when gated: %j', async extra => {
  vi.stubEnv('HISTORIAN_ATTENDING_ENABLED', 'true')
  const body = await (await POST(request(extra))).json()
  expect(body.attending_meta.ran).toBe(false)
  expect(body.push_payload).not.toHaveProperty('attending_gaps')
  // Step 1 + Step 3a steer + Step 3b detail (PR #215); attending must not add a 4th call.
  expect(mocks.invoke).toHaveBeenCalledTimes(3)
})

it('Step 4 rejection preserves a 200 Step 3 payload and logs no error text', async () => {
  vi.stubEnv('HISTORIAN_ATTENDING_ENABLED', 'true')
  const original = mocks.invoke.getMockImplementation()!
  mocks.invoke.mockImplementation(opts => isAttending(opts) ? Promise.reject(new Error('Synthetic model output must not log')) : original(opts))
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const response = await POST(request({ localizerCycle: 2 }))
  const body = await response.json()
  expect(response.status).toBe(200)
  expect(body.followUpQuestions).toEqual(step3.followUpQuestions)
  expect(body.push_payload.suggested_next_question).toBe(step3.followUpQuestions[0])
  expect(body.attending_gaps).toEqual([])
  expect(body.attending_meta.reason).toBe('error')
  expect(body.partial).toBe(false)
  expect(warn).toHaveBeenCalledWith('[localizer] Step 4 (attending review) failed', { duration_ms: expect.any(Number) })
})

it('starts Step 4 while Step 3 is pending and isolates its timeout', async () => {
  vi.stubEnv('HISTORIAN_ATTENDING_ENABLED', 'true')
  const budget = new AbortController()
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(budget.signal)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  let finishStep3!: (value: unknown) => void
  let startedStep4!: () => void
  const started = new Promise<void>(resolve => { startedStep4 = resolve })
  const original = mocks.invoke.getMockImplementation()!
  mocks.invoke.mockImplementation(opts => {
    if (isAttending(opts)) {
      startedStep4()
      return new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(opts.signal.reason), { once: true }))
    }
    if (opts.system.includes('Generate clinically targeted follow-up questions')) return new Promise(resolve => { finishStep3 = resolve })
    return original(opts)
  })
  const pending = POST(request({ localizerCycle: 2 }))
  await started
  expect(finishStep3).toBeTypeOf('function')
  expect(AbortSignal.timeout).toHaveBeenCalledWith(8000)
  budget.abort(new DOMException('Timeout', 'TimeoutError'))
  finishStep3({ parsed: step3 })
  const response = await pending
  const body = await response.json()
  expect(response.status).toBe(200)
  expect(body.followUpQuestions).toEqual(step3.followUpQuestions)
  expect(body.attending_meta.reason).toBe('timeout')
  expect(body.partial).toBe(false)
})

it('skips enabled review for old clients with a fixed eight-turn window', async () => {
  vi.stubEnv('HISTORIAN_ATTENDING_ENABLED', 'true')
  const body = await (await POST(request())).json()
  expect(body.attending_meta).toEqual({ ran: false, reason: 'no_cycle' })
  // Step 1 + Step 3a steer + Step 3b detail (PR #215); attending must not add a 4th call.
  expect(mocks.invoke).toHaveBeenCalledTimes(3)
})

it('isolates a signal-composition setup throw before Bedrock', async () => {
  vi.stubEnv('HISTORIAN_ATTENDING_ENABLED', 'true')
  vi.spyOn(AbortSignal, 'any').mockImplementation(() => { throw new Error('Synthetic setup failure') })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const response = await POST(request({ localizerCycle: 2 }))
  const body = await response.json()
  expect(response.status).toBe(200)
  expect(body).toMatchObject({ ...step3, partial: false, attending_gaps: [], attending_meta: { reason: 'error' } })
  expect(body.push_payload.suggested_next_question).toBe(step3.followUpQuestions[0])
  // Step 1 + Step 3a steer + Step 3b detail (PR #215); attending must not add a 4th call.
  expect(mocks.invoke).toHaveBeenCalledTimes(3)
})

it.each(['success', 'timeout', 'route_abort'] as const)('uses and cleans up the manual signal fallback: %s', async outcome => {
  vi.stubEnv('HISTORIAN_ATTENDING_ENABLED', 'true')
  Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true, writable: true })
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const original = mocks.invoke.getMockImplementation()!
  let startedStep4!: () => void
  const started = new Promise<void>(resolve => { startedStep4 = resolve })
  let routeSignal!: AbortSignal
  let removeListener!: ReturnType<typeof vi.spyOn>
  mocks.invoke.mockImplementation(opts => {
    if (!isAttending(opts)) {
      routeSignal = opts.signal
      return original(opts)
    }
    removeListener = vi.spyOn(routeSignal, 'removeEventListener')
    startedStep4()
    if (outcome === 'success') return original(opts)
    return new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(new Error('Synthetic abort')), { once: true }))
  })
  const pending = POST(request({ localizerCycle: 2 }))
  await started
  if (outcome === 'timeout') await vi.advanceTimersByTimeAsync(8000)
  if (outcome === 'route_abort') routeSignal.dispatchEvent(new Event('abort'))
  const response = await pending
  const body = await response.json()
  expect(response.status).toBe(200)
  expect(body.followUpQuestions).toEqual(step3.followUpQuestions)
  if (outcome === 'success') expect(body.attending_gaps).toHaveLength(3)
  else expect(body.attending_meta.reason).toBe('timeout')
  expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
  expect(vi.getTimerCount()).toBe(0)
})
