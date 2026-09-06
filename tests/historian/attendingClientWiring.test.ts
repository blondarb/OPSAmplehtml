import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { shouldPushLocalizer } from '@/lib/historian/precloseGate'

const hook = readFileSync('src/hooks/useRealtimeSession.ts', 'utf8')
const pushSource = hook.slice(hook.indexOf('  const pushLocalizerContext ='), hook.indexOf('  // ── Localizer: fire async'))
const runSource = hook.slice(hook.indexOf('  const runLocalizer ='), hook.indexOf('  // ── Durable transcript flush (Task 1)'))
const boundSource = hook.slice(hook.indexOf('function boundLocalizerTranscript'), hook.indexOf('type SessionStatus'))

// Execute the actual hook callbacks with ref/provider doubles, without a live
// microphone, React renderer, server, or paid model call.
function harness(openai = false, options: { localizerDetail?: boolean; onLocalizerUpdate?: ReturnType<typeof vi.fn> } = {}) {
  const provider = openai ? { updateInstructions: vi.fn(), injectSystemText: vi.fn() } : { injectSystemText: vi.fn() }
  const refs = {
    providerRef: { current: provider }, baseInstructionsRef: { current: 'BASE' },
    isAiSpeakingRef: { current: false }, safetyEscalatedRef: { current: false },
    localizerPushCountRef: { current: 0 }, localizerCycleRef: { current: 0 },
    localizerInFlightRef: { current: false }, localizerResultCycleRef: { current: 0 },
    localizerAbortRef: { current: null }, detailInFlightRef: { current: null },
    localizerDataRef: { current: null }, finalizingRef: { current: false }, sessionGenRef: { current: 1 },
    transcriptRef: { current: [{ role: 'user', text: 'old'.repeat(30000) }, { role: 'assistant', text: 'newest' }] },
  }
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ push_payload: { attending_gaps: ['First?', 'Second?'] } }) })
  const env = { ...refs, fetch, options, shouldPushLocalizer, setLocalizerLoading: vi.fn(), setLocalizerData: vi.fn(), useCallback: (fn: unknown) => fn }
  const source = `const MAX_LOCALIZER_INJECTIONS = 12;\n${boundSource}\n${pushSource}\n${runSource}\nreturn { pushLocalizerContext, runLocalizer, boundLocalizerTranscript }`
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  const callbacks = new Function(...Object.keys(env), js)(...Object.values(env))
  return { ...callbacks, ...env, provider }
}

describe('attending client hook wiring', () => {
  it('sends the cycle, authoritative safety ref, bounded full history and unchanged last eight turns', async () => {
    const h = harness()
    h.safetyEscalatedRef.current = true
    await h.runLocalizer()
    const body = JSON.parse(h.fetch.mock.calls[0][1].body)
    expect(body.localizerCycle).toBe(1)
    expect(body.safetyEscalated).toBe(true)
    expect(body.fullTranscript.reduce((n: number, t: { text: string }) => n + t.text.length, 0)).toBe(60000)
    expect(body.fullTranscript.at(-1)).toEqual({ role: 'assistant', text: 'newest' })
    expect(body.fullTranscript[0].text).toBe(h.transcriptRef.current[0].text.slice(-59994))
    expect(body.transcript.map(({ role, text }: { role: string; text: string }) => ({ role, text }))).toEqual(h.transcriptRef.current.slice(-8))
    expect(h.provider.injectSystemText).not.toHaveBeenCalled()
    expect(h.boundLocalizerTranscript([{ role: 'user', text: 'small' }])).toEqual([{ role: 'user', text: 'small' }])
  })

  it('pushes once per cycle, caps Nova at 12, and leaves OpenAI updates uncapped', async () => {
    for (const openai of [false, true]) {
      const h = harness(openai)
      for (let i = 0; i < 15; i++) await h.runLocalizer()
      expect(h.fetch).toHaveBeenCalledTimes(15)
      expect(h.localizerCycleRef.current).toBe(15)
      if ('updateInstructions' in h.provider) {
        expect(h.provider.updateInstructions).toHaveBeenCalledTimes(15)
        expect(h.provider.injectSystemText).not.toHaveBeenCalled()
      } else expect(h.provider.injectSystemText).toHaveBeenCalledTimes(12)
    }
    expect(runSource.match(/pushLocalizerContext\(pushPayload\)/g)).toHaveLength(1)
  })

  it('keeps the speaking guard and resets counters beside the preclose reset', async () => {
    const h = harness()
    h.isAiSpeakingRef.current = true
    await h.runLocalizer()
    expect(h.provider.injectSystemText).not.toHaveBeenCalled()
    const start = hook.slice(hook.indexOf('const startSession ='))
    expect(start).toContain('precloseRejectedRef.current = false\n    localizerPushCountRef.current = 0\n    localizerCycleRef.current = 0')
    expect(readFileSync('src/components/consult/EmbeddedHistorian.tsx', 'utf8')).not.toMatch(/pushLocalizerContext(?:Ref)?/)
  })

  it('adds exactly the first gap line in both deltas and preserves legacy bytes when absent or empty', () => {
    for (const openai of [false, true]) {
      const h = harness(openai)
      const output = () => 'updateInstructions' in h.provider
        ? h.provider.updateInstructions.mock.calls.at(-1)![0]
        : h.provider.injectSystemText.mock.calls.at(-1)![0]
      h.pushLocalizerContext({})
      const legacy = openai
        ? 'BASE\n\n[LATEST LOCALIZER PUSH]\n- Top differentials: (none yet)\n- Suggested next question: (none)\n- Suggested scale to consider: (none)'
        : '[INTERNAL SYSTEM NOTE — do NOT speak any part of this aloud. Do NOT say "I should ask" or narrate your reasoning. Do NOT name any diagnosis or condition to the patient. Use ONLY to silently guide which symptom to ask about next.]\n[Localizer update]\n- Differentials (private): (none yet)\n- Suggested angle for next question (silent): (none)\n- Scale to consider (do not name to patient): (none)'
      expect(output()).toBe(legacy)
      h.pushLocalizerContext({ attending_gaps: [] })
      expect(output()).toBe(legacy)
      h.pushLocalizerContext({ attending_gaps: ['First?', 'Second?', 'Third?'] })
      const line = '- Attending review — the single most important unasked question is: "First?". Ask it in your own words as your next question unless the patient just raised something urgent.'
      expect(output().split('\n').filter((s: string) => s === line)).toHaveLength(1)
      expect(output().replace(`${line}\n`, '')).toBe(legacy)
      expect(output()).not.toContain('Second?')
      expect(output().indexOf(line)).toBeGreaterThan(output().indexOf('- Suggested'))
    }
  })
})


it('pins off-cycle opt-in, transport-only inputs, and lifecycle cancellation', () => {
  expect(runSource).toContain("mode: 'steer'")
  expect(runSource).toContain('if (options.localizerDetail && detail_input)')
  expect(runSource).toContain('void (async () =>')
  expect(runSource).toContain('const { detail_input, ...steerData } = data')
  expect(runSource).toContain('setLocalizerData(steerData)')
  expect(runSource).not.toMatch(/setLocalizerData\((?:data|detail|detail_input)\)/)
  expect(runSource).toContain('localizerCycle !== localizerResultCycleRef.current')
  expect(hook.slice(hook.indexOf('  const cleanup ='), hook.indexOf('  const cleanup =') + 200)).toContain('detailInFlightRef.current?.abort()')
  expect(hook.slice(hook.indexOf('  const endSession ='), hook.indexOf('  const endSession =') + 300)).toContain('detailInFlightRef.current?.abort()')
  expect(readFileSync('src/components/NeurologicHistorian.tsx', 'utf8')).toContain('localizerDetail: clinicianMirror')
  expect(readFileSync('src/components/consult/EmbeddedHistorian.tsx', 'utf8')).toContain('localizerDetail: true')
})

const steerResponse = { differential: [{ diagnosis: 'Synthetic steer' }], detail_input: { guidelineContext: 'Synthetic context' },
  push_payload: { attending_gaps: ['First?'] }, kbSources: ['Synthetic source'] }
const detailResponse = { differential: [{ diagnosis: 'Synthetic detail', rationale: 'Synthetic rationale' }],
  excluded: [], followUpQuestions: ['Synthetic detail question?'], partial: false,
  push_payload: { attending_gaps: ['MUST NEVER INJECT'] }, detail_input: { guidelineContext: 'MUST NEVER STORE' } }
const response = (data: unknown) => ({ ok: true, json: async () => data })
const flushDetail = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

it('pushes before unresolved detail, then merges only clinician fields with a second callback', async () => {
  const onLocalizerUpdate = vi.fn()
  const h = harness(false, { localizerDetail: true, onLocalizerUpdate })
  let resolveDetail!: (value: unknown) => void
  h.fetch.mockResolvedValueOnce(response(steerResponse)).mockImplementationOnce(() => new Promise(resolve => { resolveDetail = resolve }))
  await h.runLocalizer()
  expect(h.provider.injectSystemText).toHaveBeenCalledTimes(1)
  expect(h.setLocalizerData).toHaveBeenCalledTimes(1)
  expect(JSON.parse(h.fetch.mock.calls[1][1].body)).toMatchObject({ mode: 'detail', detail_input: steerResponse.detail_input })
  resolveDetail(response(detailResponse))
  await flushDetail()
  expect(h.setLocalizerData).toHaveBeenCalledTimes(2)
  expect(onLocalizerUpdate).toHaveBeenCalledTimes(2)
  expect(h.localizerDataRef.current).toMatchObject({ differential: detailResponse.differential,
    push_payload: steerResponse.push_payload, kbSources: steerResponse.kbSources })
  expect(h.localizerDataRef.current).not.toHaveProperty('detail_input')
  expect(h.provider.injectSystemText).toHaveBeenCalledTimes(1)
  expect(h.detailInFlightRef.current).toBeNull()
})

it('defaults to steer only even when transport inputs are returned', async () => {
  const h = harness()
  h.fetch.mockResolvedValue(response(steerResponse))
  await h.runLocalizer()
  expect(h.fetch).toHaveBeenCalledTimes(1)
  expect(h.localizerDataRef.current).not.toHaveProperty('detail_input')
})

it.each(['newer cycle', 'ended', 'new session', 'aborted', 'failed detail'])('drops late detail after %s', async reason => {
  const h = harness(false, { localizerDetail: true })
  let resolveDetail!: (value: unknown) => void
  h.fetch.mockResolvedValueOnce(response(steerResponse)).mockImplementationOnce(() => new Promise(resolve => { resolveDetail = resolve }))
  await h.runLocalizer()
  if (reason === 'newer cycle') h.localizerResultCycleRef.current++
  if (reason === 'ended') h.finalizingRef.current = true
  if (reason === 'new session') h.sessionGenRef.current++
  if (reason === 'aborted') (h.detailInFlightRef.current as AbortController | null)?.abort()
  resolveDetail(response({ ...detailResponse, partial: reason === 'failed detail' }))
  await flushDetail()
  expect(h.setLocalizerData).toHaveBeenCalledTimes(1)
  expect(h.provider.injectSystemText).toHaveBeenCalledTimes(1)
})
