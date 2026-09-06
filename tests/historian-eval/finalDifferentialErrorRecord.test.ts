import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'
const mocks = vi.hoisted(() => ({ json: vi.fn(), tool: vi.fn(), query: vi.fn(), evidence: vi.fn() }))
vi.mock('@/lib/bedrock', () => ({ BEDROCK_MODEL: 'us.anthropic.claude-sonnet-4-6', invokeBedrockJSON: mocks.json, invokeBedrockClinicalTool: mocks.tool, copyBedrockTokenUsage: () => ({}) }))
vi.mock('@/lib/db', () => ({ getPool: async () => ({ query: mocks.query }), getNeuroPlansPool: async () => ({ query: mocks.query }) }))
vi.mock('@/lib/consult/planEvidence', () => ({ retrievePlanEvidence: mocks.evidence }))
import { runFinalDifferential, generateFinalDifferential, classifyFinalDifferentialError, persistFinalDifferentialRecord, createFinalDifferentialError } from '@/lib/historian/eval/finalDifferential'

const transcript: HistorianTranscriptEntry[] = [
  { role: 'user', text: 'Synthetic response one.', timestamp: 0 },
  { role: 'user', text: 'Synthetic response two.', timestamp: 1 },
]
beforeEach(() => {
  vi.clearAllMocks()
  mocks.query.mockResolvedValue({ rows: [] })
  mocks.json.mockResolvedValue({ parsed: { primarySymptoms: [], redFlags: [] } })
  mocks.tool.mockResolvedValue({ parsed: { differential: [], summary: 'Synthetic summary' } })
  mocks.evidence.mockResolvedValue({ guidelineText: '' })
})
const stored = () => JSON.parse(mocks.query.mock.calls.at(-1)![1][0])

describe('final differential failure records', () => {
  it('persists an aborted signal as timeout without calling Bedrock', async () => {
    await runFinalDifferential('opaque', transcript, undefined, { signal: AbortSignal.abort(), persistErrorRecord: true })
    expect(stored()).toMatchObject({ status: 'error', error_class: 'timeout', provenance: { model_id: 'us.anthropic.claude-sonnet-4-6', prompt_version: expect.any(String), generated_at: expect.any(String) } })
    expect(mocks.json).not.toHaveBeenCalled()
    expect(mocks.query).toHaveBeenCalledTimes(1)
  })
  it('persists malformed JSON as parse without copying model text', async () => {
    mocks.json.mockRejectedValue(new SyntaxError('sensitive model response'))
    await runFinalDifferential('opaque', transcript, undefined, { persistErrorRecord: true })
    expect(stored()).toMatchObject({ status: 'error', error_class: 'parse' })
    expect(JSON.stringify(stored())).not.toContain('sensitive')
  })
  it('threads the same signal into both actual Bedrock helper boundaries', async () => {
    const signal = new AbortController().signal
    await generateFinalDifferential(transcript, undefined, { signal })
    expect(mocks.json.mock.calls[0][0].signal).toBe(signal)
    expect(mocks.tool.mock.calls[0][0].signal).toBe(signal)
  })
  it('rejects malformed final tool shape as parse', async () => {
    mocks.tool.mockResolvedValue({ parsed: { summary: 'bad shape' } })
    await runFinalDifferential('opaque', transcript, undefined, { persistErrorRecord: true })
    expect(stored().error_class).toBe('parse')
  })
  it('persists oversized and preserves the existing insufficient stub', async () => {
    await runFinalDifferential('opaque', [{ ...transcript[0], text: 'x'.repeat(60_001) }], undefined, { persistErrorRecord: true })
    expect(stored().error_class).toBe('oversized')
    await runFinalDifferential('opaque', [])
    expect(stored()).toMatchObject({ status: 'insufficient_transcript', differential: [], dropped_quotes: 0 })
  })
  it('tolerates 42703 and returns other persistence failures for worker classification', async () => {
    mocks.query.mockRejectedValueOnce({ code: '42703' })
    await expect(runFinalDifferential('opaque', transcript, undefined, { persistErrorRecord: true })).resolves.toMatchObject({ record: { status: 'ok' } })
    mocks.query.mockRejectedValueOnce({ code: 'ECONNRESET' })
    const outcome = await runFinalDifferential('opaque', transcript, undefined, { persistErrorRecord: true })
    expect(classifyFinalDifferentialError(outcome.error)).toEqual({ errorClass: 'db', transient: true })
    expect(stored().error_class).toBe('db')
  })
})

it('inline call leaves final_differential untouched on generation failure', async () => {
  mocks.json.mockRejectedValue(new SyntaxError('private model text'))
  await runFinalDifferential('opaque', transcript)
  expect(mocks.query).not.toHaveBeenCalled()
})
it('inline persistence failure does not attempt an error UPDATE', async () => {
  mocks.query.mockRejectedValueOnce({ code: 'ECONNRESET' })
  await runFinalDifferential('opaque', transcript)
  expect(mocks.query).toHaveBeenCalledTimes(1)
  expect(stored().status).toBe('ok')
})
it('guards only error writes against replacing an ok result', async () => {
  await persistFinalDifferentialRecord('opaque', createFinalDifferentialError(new SyntaxError()))
  expect(mocks.query.mock.calls[0][0]).toBe("UPDATE historian_sessions SET final_differential = $1 WHERE id = $2 AND (final_differential->>'status' IS DISTINCT FROM 'ok')")
  const ok = await generateFinalDifferential(transcript)
  await persistFinalDifferentialRecord('opaque', ok)
  expect(mocks.query.mock.calls[1][0]).toBe('UPDATE historian_sessions SET final_differential = $1 WHERE id = $2')
})
