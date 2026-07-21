import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

// ── Mocks ────────────────────────────────────────────────────────────────
// The DeepSeek-R1 path talks to Bedrock via a raw BedrockRuntimeClient
// (native prompt/choices wire format — NOT the Anthropic messages format
// invokeBedrockJSON assumes; see independentDdx.ts's module doc for why).
// The Haiku adjudicator path goes through the normal @/lib/bedrock tool-use
// helper. persistEvaluation and @/lib/db are mocked for the orchestration
// wrapper tests.

const bedrockRuntime = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: function BedrockRuntimeClient() {
    return { send: bedrockRuntime.send }
  },
  InvokeModelCommand: function InvokeModelCommand(input: unknown) {
    return { input }
  },
}))

const { invokeBedrockClinicalToolMock } = vi.hoisted(() => ({
  invokeBedrockClinicalToolMock: vi.fn(),
}))
vi.mock('@/lib/bedrock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bedrock')>()
  return { ...actual, invokeBedrockClinicalTool: invokeBedrockClinicalToolMock }
})

const { persistEvaluationMock } = vi.hoisted(() => ({ persistEvaluationMock: vi.fn(async () => {}) }))
vi.mock('@/lib/historian/eval/persistEvaluation', () => ({
  persistEvaluation: persistEvaluationMock,
}))

const { poolQueryMock, getPoolMock } = vi.hoisted(() => ({
  poolQueryMock: vi.fn(),
  getPoolMock: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  getPool: getPoolMock,
}))

import {
  generateIndependentDdx,
  adjudicateEquivalence,
  runIndependentDdxAndAgreement,
  HAIKU_MODEL_ID,
  DEEPSEEK_R1_MODEL_ID,
} from '@/lib/historian/eval/independentDdx'
import { TranscriptTooLargeError, MAX_TRANSCRIPT_CHARS } from '@/lib/historian/eval/finalDifferential'
import { PROMPT_VERSIONS } from '@/lib/historian/eval/constants'

function entry(overrides: Partial<HistorianTranscriptEntry> = {}): HistorianTranscriptEntry {
  return { role: 'assistant', text: 'Hello.', timestamp: 0, seq: 1, ...overrides }
}

const SAMPLE_TRANSCRIPT: HistorianTranscriptEntry[] = [
  entry({ role: 'assistant', text: 'What brings you in today?', timestamp: 0, seq: 1 }),
  entry({ role: 'user', text: 'Sudden right-sided weakness this morning.', timestamp: 8, seq: 2 }),
]

function r1Response(text: string, stopReason: 'stop' | 'length' = 'stop') {
  return {
    body: new TextEncoder().encode(JSON.stringify({ choices: [{ text, stop_reason: stopReason }] })),
  }
}

const VALID_DDX_JSON = JSON.stringify({
  differential: [
    {
      diagnosis: 'Acute ischemic stroke',
      icd10: 'I63.9',
      likelihood: 'High',
      likelihood_pct: 80,
      rationale: 'Sudden focal weakness.',
      supporting_quotes: [{ turn: 1, quote: 'Sudden right-sided weakness this morning.' }],
      contradicting_quotes: [],
    },
  ],
  summary: 'Most consistent with acute stroke.',
})

describe('generateIndependentDdx', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Deterministic guard ──────────────────────────────────────────────

  it('throws TranscriptTooLargeError and never calls Bedrock for an oversized transcript', async () => {
    const huge: HistorianTranscriptEntry[] = [
      entry({ role: 'user', text: 'x'.repeat(MAX_TRANSCRIPT_CHARS), timestamp: 0, seq: 1 }),
    ]
    await expect(generateIndependentDdx(huge)).rejects.toBeInstanceOf(TranscriptTooLargeError)
    expect(bedrockRuntime.send).not.toHaveBeenCalled()
  })

  // ── Blindness (structural) ────────────────────────────────────────────

  it('has an arity of at most 2 (transcript, chiefComplaint) — no smuggled extra context params', () => {
    expect(generateIndependentDdx.length).toBeLessThanOrEqual(2)
  })

  it('sends only the transcript and chief complaint to the model — no other context leaks into the prompt', async () => {
    bedrockRuntime.send.mockResolvedValueOnce(r1Response(`<think>ok</think>\n${VALID_DDX_JSON}`))
    await generateIndependentDdx(SAMPLE_TRANSCRIPT, 'right-sided weakness')

    const sentInput = bedrockRuntime.send.mock.calls[0][0].input as { body: Uint8Array }
    const bodyText = new TextDecoder().decode(sentInput.body)
    expect(bodyText).toContain('right-sided weakness')
    expect(bodyText).toContain('Sudden right-sided weakness this morning')
    // Native R1 wire format — not the Anthropic messages shape.
    expect(bodyText).toContain('"prompt"')
    expect(bodyText).not.toContain('anthropic_version')
    expect(bodyText).not.toContain('"messages"')
  })

  it('calls DeepSeek-R1 (not Claude) as the model', async () => {
    bedrockRuntime.send.mockResolvedValueOnce(r1Response(VALID_DDX_JSON))
    await generateIndependentDdx(SAMPLE_TRANSCRIPT)
    const call = bedrockRuntime.send.mock.calls[0][0].input as { modelId: string }
    expect(call.modelId).toBe(DEEPSEEK_R1_MODEL_ID)
    expect(DEEPSEEK_R1_MODEL_ID).toBe('us.deepseek.r1-v1:0')
  })

  // ── Happy path / shape ────────────────────────────────────────────────

  it('parses a clean response (no think block) into the expected shape', async () => {
    bedrockRuntime.send.mockResolvedValueOnce(r1Response(VALID_DDX_JSON))
    const result = await generateIndependentDdx(SAMPLE_TRANSCRIPT)

    expect(result.differential).toHaveLength(1)
    expect(result.differential[0]).toMatchObject({ diagnosis: 'Acute ischemic stroke', icd10: 'I63.9' })
    expect(result.summary).toBe('Most consistent with acute stroke.')
    expect(result.retried).toBe(false)
    expect(result.stop_reason).toBe('stop')
    expect(bedrockRuntime.send).toHaveBeenCalledTimes(1)
  })

  it('strips a leading <think>...</think> reasoning block before parsing', async () => {
    bedrockRuntime.send.mockResolvedValueOnce(
      r1Response(`<think>\nLet me reason about this for a while...\n</think>\n\n${VALID_DDX_JSON}`),
    )
    const result = await generateIndependentDdx(SAMPLE_TRANSCRIPT)
    expect(result.differential[0].diagnosis).toBe('Acute ischemic stroke')
  })

  it('strips markdown code fences around the JSON', async () => {
    bedrockRuntime.send.mockResolvedValueOnce(r1Response('```json\n' + VALID_DDX_JSON + '\n```'))
    const result = await generateIndependentDdx(SAMPLE_TRANSCRIPT)
    expect(result.differential[0].diagnosis).toBe('Acute ischemic stroke')
  })

  it('embeds full provenance including the independent-ddx-r1-v1 prompt version', async () => {
    bedrockRuntime.send.mockResolvedValueOnce(r1Response(VALID_DDX_JSON))
    const result = await generateIndependentDdx(SAMPLE_TRANSCRIPT)

    expect(result.provenance.model_id).toBe(DEEPSEEK_R1_MODEL_ID)
    expect(result.provenance.prompt_version).toBe('independent-ddx-r1-v1')
    expect(result.provenance.prompt_version).toBe(PROMPT_VERSIONS['independent-ddx-r1-v1'].id)
    expect(() => new Date(result.provenance.generated_at).toISOString()).not.toThrow()
  })

  it('reuses finalDifferential.ts verbatim-quote sanitization — drops a fabricated quote and counts it', async () => {
    const withFabricatedQuote = JSON.stringify({
      differential: [
        {
          diagnosis: 'Acute ischemic stroke',
          icd10: 'I63.9',
          likelihood: 'High',
          likelihood_pct: 80,
          rationale: 'r',
          supporting_quotes: [{ turn: 1, quote: 'this was never actually said' }],
          contradicting_quotes: [],
        },
      ],
      summary: 's',
    })
    bedrockRuntime.send.mockResolvedValueOnce(r1Response(withFabricatedQuote))
    const result = await generateIndependentDdx(SAMPLE_TRANSCRIPT)

    expect(result.differential[0].supporting_quotes).toEqual([])
    expect(result.dropped_quotes).toBe(1)
  })

  // ── Retry-once-then-fail-closed ────────────────────────────────────────

  it('retries once when the first response is not differential-shaped, and succeeds on the second attempt', async () => {
    bedrockRuntime.send.mockResolvedValueOnce(r1Response('{"not_a_differential": true}'))
    bedrockRuntime.send.mockResolvedValueOnce(r1Response(VALID_DDX_JSON))

    const result = await generateIndependentDdx(SAMPLE_TRANSCRIPT)

    expect(bedrockRuntime.send).toHaveBeenCalledTimes(2)
    expect(result.retried).toBe(true)
    expect(result.differential[0].diagnosis).toBe('Acute ischemic stroke')
  })

  it('retries once when the first call throws (e.g. malformed JSON), and succeeds on the second attempt', async () => {
    bedrockRuntime.send.mockResolvedValueOnce(r1Response('not json at all {{{'))
    bedrockRuntime.send.mockResolvedValueOnce(r1Response(VALID_DDX_JSON))

    const result = await generateIndependentDdx(SAMPLE_TRANSCRIPT)

    expect(bedrockRuntime.send).toHaveBeenCalledTimes(2)
    expect(result.retried).toBe(true)
  })

  it('fails closed (throws) after two shape-invalid attempts, never a third', async () => {
    bedrockRuntime.send.mockResolvedValueOnce(r1Response('{"nope": true}'))
    bedrockRuntime.send.mockResolvedValueOnce(r1Response('{"still_nope": true}'))

    await expect(generateIndependentDdx(SAMPLE_TRANSCRIPT)).rejects.toThrow()
    expect(bedrockRuntime.send).toHaveBeenCalledTimes(2)
  })

  it('fails closed on persistent empty/reasoning-only text', async () => {
    bedrockRuntime.send.mockResolvedValue(r1Response('<think>only reasoning, no answer</think>'))
    await expect(generateIndependentDdx(SAMPLE_TRANSCRIPT)).rejects.toThrow()
    expect(bedrockRuntime.send).toHaveBeenCalledTimes(2)
  })

  // ── Truncation repair ────────────────────────────────────────────────

  it('repairs truncated JSON on a length stop_reason', async () => {
    const truncated = VALID_DDX_JSON.slice(0, VALID_DDX_JSON.length - 20) // cut off mid-object
    bedrockRuntime.send.mockResolvedValueOnce(r1Response(truncated, 'length'))
    const result = await generateIndependentDdx(SAMPLE_TRANSCRIPT)
    // Repair should at minimum recover a valid, if partial, shape.
    expect(result.stop_reason).toBe('length')
    expect(Array.isArray(result.differential)).toBe(true)
  })

  it('retries once, then fails closed, when a truncated response cannot be repaired into a valid shape', async () => {
    bedrockRuntime.send.mockResolvedValue(r1Response('{"differential": [', 'length'))
    await expect(generateIndependentDdx(SAMPLE_TRANSCRIPT)).rejects.toThrow()
    expect(bedrockRuntime.send).toHaveBeenCalledTimes(2)
  })
})

describe('adjudicateEquivalence (Haiku)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns [] and never calls Bedrock for an empty pair list', async () => {
    const result = await adjudicateEquivalence([])
    expect(result).toEqual([])
    expect(invokeBedrockClinicalToolMock).not.toHaveBeenCalled()
  })

  it('batches all pairs into exactly one tool call against the verified Haiku model id', async () => {
    invokeBedrockClinicalToolMock.mockResolvedValueOnce({
      parsed: { judgments: [true, false, true] },
      raw: '{}',
      stopReason: 'tool_use',
    })

    const result = await adjudicateEquivalence([
      ['TIA', 'transient ischemic attack'],
      ['migraine', 'tension headache'],
      ['CVA', 'stroke'],
    ])

    expect(invokeBedrockClinicalToolMock).toHaveBeenCalledTimes(1)
    const call = invokeBedrockClinicalToolMock.mock.calls[0][0]
    expect(call.model).toBe(HAIKU_MODEL_ID)
    expect(HAIKU_MODEL_ID).toContain('haiku-4-5')
    expect(result).toEqual([true, false, true])
  })

  it('defensively pads/truncates a malformed judgments array rather than throwing or desyncing', async () => {
    invokeBedrockClinicalToolMock.mockResolvedValueOnce({
      parsed: { judgments: [true] }, // asked about 3 pairs, only got 1 judgment back
      raw: '{}',
      stopReason: 'tool_use',
    })

    const result = await adjudicateEquivalence([
      ['A', 'B'],
      ['C', 'D'],
      ['E', 'F'],
    ])

    expect(result).toEqual([true, false, false])
  })

  it('treats a completely missing judgments field as all-false rather than throwing', async () => {
    invokeBedrockClinicalToolMock.mockResolvedValueOnce({ parsed: {}, raw: '{}', stopReason: 'tool_use' })
    const result = await adjudicateEquivalence([['A', 'B']])
    expect(result).toEqual([false])
  })
})

describe('runIndependentDdxAndAgreement (save-route fire-and-forget wrapper)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ query: poolQueryMock })
  })

  it('persists independent_ddx, then fetches final_differential and persists agreement when both exist', async () => {
    bedrockRuntime.send.mockResolvedValueOnce(r1Response(VALID_DDX_JSON))
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        {
          final_differential: {
            differential: [{ diagnosis: 'Acute ischemic stroke', icd10: 'I63.9', likelihood: 'High', likelihood_pct: 85, rationale: 'r', supporting_quotes: [], contradicting_quotes: [] }],
            summary: 's',
            provenance: { model_id: 'x', prompt_version: 'final-ddx-v1', inference_params: {}, generated_at: new Date().toISOString() },
            dropped_quotes: 0,
          },
        },
      ],
    })
    invokeBedrockClinicalToolMock.mockResolvedValueOnce({
      parsed: { judgments: [] },
      raw: '{}',
      stopReason: 'tool_use',
    })

    await runIndependentDdxAndAgreement('session-1', SAMPLE_TRANSCRIPT, 'weakness')

    const evaluatorNames = persistEvaluationMock.mock.calls.map((c) => c[0].evaluator)
    expect(evaluatorNames).toContain('independent_ddx')
    expect(evaluatorNames).toContain('agreement')
  })

  it('persists independent_ddx but skips agreement quietly when final_differential is not yet present', async () => {
    bedrockRuntime.send.mockResolvedValueOnce(r1Response(VALID_DDX_JSON))
    poolQueryMock.mockResolvedValueOnce({ rows: [{ final_differential: null }] })

    await runIndependentDdxAndAgreement('session-2', SAMPLE_TRANSCRIPT)

    const evaluatorNames = persistEvaluationMock.mock.calls.map((c) => c[0].evaluator)
    expect(evaluatorNames).toEqual(['independent_ddx'])
  })

  it('never throws and persists nothing when R1 generation fails after its retry', async () => {
    bedrockRuntime.send.mockResolvedValue(r1Response('{"nope": true}'))

    await expect(runIndependentDdxAndAgreement('session-3', SAMPLE_TRANSCRIPT)).resolves.toBeUndefined()
    expect(persistEvaluationMock).not.toHaveBeenCalled()
  })

  it('never throws when the final_differential lookup query errors', async () => {
    bedrockRuntime.send.mockResolvedValueOnce(r1Response(VALID_DDX_JSON))
    poolQueryMock.mockRejectedValueOnce(Object.assign(new Error('relation does not exist'), { code: '42P01' }))

    await expect(runIndependentDdxAndAgreement('session-4', SAMPLE_TRANSCRIPT)).resolves.toBeUndefined()
    const evaluatorNames = persistEvaluationMock.mock.calls.map((c) => c[0].evaluator)
    expect(evaluatorNames).toEqual(['independent_ddx'])
  })

  it('never logs patient transcript text to the console', async () => {
    const secret = 'SENTINEL_TRANSCRIPT_TEXT_NEVER_LOGGED'
    bedrockRuntime.send.mockResolvedValue(r1Response('{"nope": true}'))
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await runIndependentDdxAndAgreement('session-5', [
      entry({ role: 'user', text: secret, timestamp: 0, seq: 1 }),
    ])

    const allLogs = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
      .join(' ')
    expect(allLogs).not.toContain(secret)

    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
