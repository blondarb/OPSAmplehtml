import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * persistEvaluation.ts is the pure-persistence half of the thoroughness
 * judge pipeline: given a fully-computed evaluation result + provenance +
 * usage, insert one row into historian_evaluations. Mirrors the
 * runFinalDifferential persistence block's Postgres error-code handling
 * (Task 1/2 precedent, see save/route.ts's integrity cross-check and
 * finalDifferential.ts's UPDATE): 42P01 (table not yet migrated) logs once
 * at console.info quiet level, any other DB error logs at console.error —
 * neither ever throws, since this is called from a fire-and-forget
 * pipeline.
 */
const { queryMock, getPoolMock } = vi.hoisted(() => {
  const queryMock = vi.fn(async () => ({ rows: [] }))
  const getPoolMock = vi.fn(async () => ({ query: queryMock }))
  return { queryMock, getPoolMock }
})

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { persistEvaluation } from '@/lib/historian/eval/persistEvaluation'
import { computeCostUsd, MODEL_PRICING } from '@/lib/historian/eval/constants'
import { BEDROCK_MODEL } from '@/lib/bedrock'

function baseInput(overrides: Partial<Parameters<typeof persistEvaluation>[0]> = {}) {
  return {
    sessionId: 'session-123',
    evaluator: 'thoroughness' as const,
    modelId: BEDROCK_MODEL,
    promptVersion: 'thoroughness-v1',
    rubricVersion: 'base-neuro-hpi-v1+stroke-v1',
    inferenceParams: { temperature: 0, max_tokens: 3000 },
    result: { overall: 82, oldcarts: { score: 90, evidence_turns: [1, 2], notes: 'ok' } },
    usage: { inputTokens: 1000, outputTokens: 500 },
    latencyMs: 1234,
    ...overrides,
  }
}

describe('persistEvaluation', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  let infoSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    queryMock.mockReset()
    queryMock.mockResolvedValue({ rows: [] })
    getPoolMock.mockClear()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
    infoSpy.mockRestore()
  })

  it('inserts one row with the provided session/evaluator/model/prompt/rubric fields', async () => {
    await persistEvaluation(baseInput())

    expect(queryMock).toHaveBeenCalledTimes(1)
    const [sql, params] = queryMock.mock.calls[0]
    expect(sql).toMatch(/INSERT INTO historian_evaluations/i)
    expect(params[0]).toBe('session-123')
    expect(params[1]).toBe('thoroughness')
    expect(params[2]).toBe(BEDROCK_MODEL)
    expect(params[3]).toBe('thoroughness-v1')
    expect(params[4]).toBe('base-neuro-hpi-v1+stroke-v1')
  })

  it('pre-stringifies the JSONB inference_params and result params (db-query auto-stringify gotcha does not apply to raw pool.query)', async () => {
    await persistEvaluation(baseInput())
    const [, params] = queryMock.mock.calls[0]
    const inferenceParamsParam = params[5]
    const resultParam = params[6]
    expect(typeof inferenceParamsParam).toBe('string')
    expect(typeof resultParam).toBe('string')
    expect(JSON.parse(inferenceParamsParam)).toEqual({ temperature: 0, max_tokens: 3000 })
    expect(JSON.parse(resultParam)).toMatchObject({ overall: 82 })
  })

  it('computes cost_usd from usage for a known (priced) model', async () => {
    await persistEvaluation(baseInput({ usage: { inputTokens: 1000, outputTokens: 1000 } }))
    const [, params] = queryMock.mock.calls[0]
    const costUsd = params[7]
    // BEDROCK_MODEL pricing: $0.003/1k input + $0.015/1k output (constants.ts MODEL_PRICING)
    expect(costUsd).toBeCloseTo(0.003 + 0.015, 6)
  })

  it('persists a null cost_usd (never throws) for an unrecognized model id', async () => {
    await expect(persistEvaluation(baseInput({ modelId: 'not-a-real-model-id' }))).resolves.toBeUndefined()
    const [, params] = queryMock.mock.calls[0]
    expect(params[7]).toBeNull()
  })

  it('persists latency_ms verbatim', async () => {
    await persistEvaluation(baseInput({ latencyMs: 4321 }))
    const [, params] = queryMock.mock.calls[0]
    expect(params[8]).toBe(4321)
  })

  it('defaults rubric_version to null when omitted', async () => {
    const input = baseInput()
    delete (input as { rubricVersion?: string }).rubricVersion
    await persistEvaluation(input)
    const [, params] = queryMock.mock.calls[0]
    expect(params[4]).toBeNull()
  })

  it('logs a single quiet info line (not error) when historian_evaluations does not exist yet (42P01)', async () => {
    queryMock.mockRejectedValueOnce(
      Object.assign(new Error('relation "historian_evaluations" does not exist'), { code: '42P01' }),
    )

    await expect(persistEvaluation(baseInput())).resolves.toBeUndefined()

    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(infoSpy.mock.calls[0].join(' ')).toMatch(/migration 058 not applied/i)
    const errorText = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(errorText).toBe('')
  })

  it('logs a real (non-42P01) DB error at error level, but still never throws', async () => {
    queryMock.mockRejectedValueOnce(
      Object.assign(new Error('connection terminated unexpectedly'), { code: '57P01' }),
    )

    await expect(persistEvaluation(baseInput())).resolves.toBeUndefined()

    const errorText = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(errorText).toMatch(/failed to persist evaluation/i)
  })

  it('never throws even if getPool() itself rejects', async () => {
    getPoolMock.mockRejectedValueOnce(new Error('pool unavailable'))
    await expect(persistEvaluation(baseInput())).resolves.toBeUndefined()
    const errorText = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(errorText).toMatch(/failed to persist evaluation/i)
  })

  it('never logs patient/transcript text — only counts/ids appear in log lines', async () => {
    const secret = 'SECRET_PATIENT_UTTERANCE_TEXT'
    queryMock.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: '57P01' }))
    await persistEvaluation(
      baseInput({ result: { overall: 50, note: secret } as unknown as Record<string, unknown> }),
    )
    const errorText = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(errorText).not.toContain(secret)
  })
})

describe('computeCostUsd (review fix, minor c)', () => {
  // Exercises the arithmetic itself, via an injected fake MODEL_PRICING
  // entry, so this test's expected value is independent of whatever the
  // real BEDROCK_MODEL price happens to be (that value is separately
  // covered by "computes cost_usd from usage for a known (priced) model"
  // above, and would need updating if real pricing ever changes — this
  // test wouldn't).
  const FAKE_MODEL_ID = '__test_fake_model_for_cost_math__'

  afterEach(() => {
    delete MODEL_PRICING[FAKE_MODEL_ID]
  })

  it('computes inputTokens/1000*inputPer1k + outputTokens/1000*outputPer1k for a fake pricing entry', () => {
    MODEL_PRICING[FAKE_MODEL_ID] = { inputPer1k: 2, outputPer1k: 10 }
    const cost = computeCostUsd(FAKE_MODEL_ID, { inputTokens: 500, outputTokens: 250 })
    // 500 input tokens @ $2/1k = $1.00; 250 output tokens @ $10/1k = $2.50
    expect(cost).toBeCloseTo(1.0 + 2.5, 6)
  })

  it('treats a missing token count as 0 rather than NaN', () => {
    MODEL_PRICING[FAKE_MODEL_ID] = { inputPer1k: 2, outputPer1k: 10 }
    const cost = computeCostUsd(FAKE_MODEL_ID, { outputTokens: 100 })
    expect(cost).toBeCloseTo(1.0, 6) // 100/1000 * 10
  })

  it('returns null (never throws, never a fabricated number) for a model with no pricing entry', () => {
    expect(computeCostUsd('definitely-not-a-priced-model', { inputTokens: 1000, outputTokens: 1000 })).toBeNull()
  })
})
