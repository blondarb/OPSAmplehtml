import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

const {
  invokeBedrockJSONMock,
  invokeBedrockClinicalToolMock,
  retrievePlanEvidenceMock,
  getNeuroPlansPoolMock,
} = vi.hoisted(() => ({
  invokeBedrockJSONMock: vi.fn(),
  invokeBedrockClinicalToolMock: vi.fn(),
  retrievePlanEvidenceMock: vi.fn(),
  getNeuroPlansPoolMock: vi.fn(async () => ({ query: vi.fn() })),
}))

vi.mock('@/lib/bedrock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bedrock')>()
  return {
    ...actual,
    invokeBedrockJSON: invokeBedrockJSONMock,
    invokeBedrockClinicalTool: invokeBedrockClinicalToolMock,
  }
})
vi.mock('@/lib/db', () => ({ getNeuroPlansPool: getNeuroPlansPoolMock }))
vi.mock('@/lib/consult/planEvidence', () => ({
  retrievePlanEvidence: retrievePlanEvidenceMock,
}))

import {
  generateFinalDifferential,
  TranscriptTooLargeError,
  MAX_TRANSCRIPT_CHARS,
} from '@/lib/historian/eval/finalDifferential'
import { PROMPT_VERSIONS } from '@/lib/historian/eval/constants'
import { BEDROCK_MODEL } from '@/lib/bedrock'

function entry(overrides: Partial<HistorianTranscriptEntry> = {}): HistorianTranscriptEntry {
  return { role: 'assistant', text: 'Hello.', timestamp: 0, seq: 1, ...overrides }
}

const SAMPLE_TRANSCRIPT: HistorianTranscriptEntry[] = [
  entry({ role: 'assistant', text: 'What brings you in today?', timestamp: 0, seq: 1 }),
  entry({ role: 'user', text: 'I have had a throbbing headache for three days.', timestamp: 8, seq: 2 }),
  entry({ role: 'assistant', text: 'Any nausea or visual changes?', timestamp: 20, seq: 3 }),
  entry({ role: 'user', text: 'Some nausea, no vision changes.', timestamp: 28, seq: 4 }),
]

function mockHappyPath(overrides: {
  differential?: unknown[]
  summary?: string
} = {}) {
  invokeBedrockJSONMock.mockResolvedValue({
    parsed: {
      primarySymptoms: ['headache'],
      location: ['bilateral'],
      temporalPattern: ['3 days'],
      severity: [],
      associatedFeatures: ['nausea'],
      redFlags: [],
      clinicalSummary: 'Subacute headache with nausea.',
    },
    raw: '{}',
    stopReason: 'end_turn',
  })
  retrievePlanEvidenceMock.mockResolvedValue({
    guidelineText: '### Migraine Plan\nEvidence-based recommendations:\n- Consider triptan (Level A)',
    citations: ['Migraine Plan'],
  })
  invokeBedrockClinicalToolMock.mockResolvedValue({
    parsed: {
      differential: overrides.differential ?? [
        {
          diagnosis: 'Migraine without aura',
          icd10: 'G43.009',
          likelihood: 'High',
          likelihood_pct: 70,
          rationale: 'Throbbing headache with nausea, no red flags.',
          supporting_quotes: [
            { turn: 1, quote: 'I have had a throbbing headache for three days.' },
          ],
          contradicting_quotes: [],
        },
      ],
      summary: overrides.summary ?? 'Subacute headache most consistent with migraine.',
    },
    raw: '{}',
    stopReason: 'tool_use',
    inputTokens: 500,
    outputTokens: 200,
  })
}

describe('generateFinalDifferential', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getNeuroPlansPoolMock.mockResolvedValue({ query: vi.fn() })
  })

  // ── Deterministic guard ──────────────────────────────────────────────

  it('throws TranscriptTooLargeError and calls no Bedrock function when the serialized transcript exceeds the limit', async () => {
    mockHappyPath()
    const hugeText = 'x'.repeat(MAX_TRANSCRIPT_CHARS)
    const hugeTranscript: HistorianTranscriptEntry[] = [
      entry({ role: 'user', text: hugeText, timestamp: 0, seq: 1 }),
    ]

    await expect(generateFinalDifferential(hugeTranscript)).rejects.toBeInstanceOf(
      TranscriptTooLargeError,
    )
    expect(invokeBedrockJSONMock).not.toHaveBeenCalled()
    expect(invokeBedrockClinicalToolMock).not.toHaveBeenCalled()
  })

  it('does not throw for a transcript comfortably under the limit', async () => {
    mockHappyPath()
    await expect(generateFinalDifferential(SAMPLE_TRANSCRIPT)).resolves.toBeTruthy()
  })

  // ── Happy path shape ─────────────────────────────────────────────────

  it('returns a FinalDifferential with the expected shape', async () => {
    mockHappyPath()
    const result = await generateFinalDifferential(SAMPLE_TRANSCRIPT, 'headache')

    expect(result.differential).toHaveLength(1)
    expect(result.differential[0]).toMatchObject({
      diagnosis: 'Migraine without aura',
      icd10: 'G43.009',
      likelihood: 'High',
      likelihood_pct: 70,
    })
    expect(result.summary).toBe('Subacute headache most consistent with migraine.')
    expect(result.dropped_quotes).toBe(0)
  })

  it('embeds full provenance on every result', async () => {
    mockHappyPath()
    const result = await generateFinalDifferential(SAMPLE_TRANSCRIPT)

    expect(result.provenance.model_id).toBe(BEDROCK_MODEL)
    expect(result.provenance.prompt_version).toBe('final-ddx-v1')
    expect(result.provenance.prompt_version).toBe(PROMPT_VERSIONS['final-ddx-v1'].id)
    expect(typeof result.provenance.inference_params).toBe('object')
    expect(() => new Date(result.provenance.generated_at).toISOString()).not.toThrow()
    expect(new Date(result.provenance.generated_at).toString()).not.toBe('Invalid Date')
  })

  it('reports the actual invoked model id when a call-site override is used', async () => {
    invokeBedrockJSONMock.mockResolvedValue({
      parsed: {
        primarySymptoms: [], location: [], temporalPattern: [], severity: [],
        associatedFeatures: [], redFlags: [], clinicalSummary: '',
      },
      raw: '{}', stopReason: 'end_turn',
    })
    retrievePlanEvidenceMock.mockResolvedValue({ guidelineText: '', citations: [] })
    invokeBedrockClinicalToolMock.mockResolvedValue({
      parsed: { differential: [], summary: '' },
      raw: '{}', stopReason: 'tool_use',
    })
    const result = await generateFinalDifferential(SAMPLE_TRANSCRIPT)
    // Default path (no override) still reports the shared constant.
    expect(result.provenance.model_id).toBe(BEDROCK_MODEL)
  })

  // ── Quote verbatim validation ────────────────────────────────────────

  it('keeps a quote that is a verbatim substring of its cited turn', async () => {
    mockHappyPath()
    const result = await generateFinalDifferential(SAMPLE_TRANSCRIPT)
    expect(result.differential[0].supporting_quotes).toEqual([
      { turn: 1, quote: 'I have had a throbbing headache for three days.' },
    ])
    expect(result.dropped_quotes).toBe(0)
  })

  it('drops a quote that is not a verbatim substring of its cited turn, and counts it', async () => {
    mockHappyPath({
      differential: [
        {
          diagnosis: 'Migraine without aura',
          icd10: 'G43.009',
          likelihood: 'High',
          likelihood_pct: 70,
          rationale: 'r',
          supporting_quotes: [
            { turn: 1, quote: 'this text was never actually said by the patient' },
          ],
          contradicting_quotes: [],
        },
      ],
    })
    const result = await generateFinalDifferential(SAMPLE_TRANSCRIPT)
    expect(result.differential[0].supporting_quotes).toEqual([])
    expect(result.dropped_quotes).toBe(1)
  })

  it('drops a quote citing an out-of-range turn index', async () => {
    mockHappyPath({
      differential: [
        {
          diagnosis: 'Migraine without aura', icd10: null, likelihood: 'High',
          likelihood_pct: 70, rationale: 'r',
          supporting_quotes: [{ turn: 99, quote: 'I have had a throbbing headache for three days.' }],
          contradicting_quotes: [],
        },
      ],
    })
    const result = await generateFinalDifferential(SAMPLE_TRANSCRIPT)
    expect(result.differential[0].supporting_quotes).toEqual([])
    expect(result.dropped_quotes).toBe(1)
  })

  it('drops a quote with a non-integer turn', async () => {
    mockHappyPath({
      differential: [
        {
          diagnosis: 'Migraine without aura', icd10: null, likelihood: 'High',
          likelihood_pct: 70, rationale: 'r',
          supporting_quotes: [{ turn: 1.5, quote: 'I have had a throbbing headache for three days.' }],
          contradicting_quotes: [],
        },
      ],
    })
    const result = await generateFinalDifferential(SAMPLE_TRANSCRIPT)
    expect(result.differential[0].supporting_quotes).toEqual([])
    expect(result.dropped_quotes).toBe(1)
  })

  it('aggregates dropped_quotes across supporting AND contradicting quotes, across multiple items', async () => {
    mockHappyPath({
      differential: [
        {
          diagnosis: 'Migraine without aura', icd10: null, likelihood: 'High',
          likelihood_pct: 70, rationale: 'r',
          supporting_quotes: [
            { turn: 1, quote: 'I have had a throbbing headache for three days.' }, // kept
            { turn: 1, quote: 'fabricated quote one' }, // dropped
          ],
          contradicting_quotes: [{ turn: 3, quote: 'fabricated quote two' }], // dropped
        },
        {
          diagnosis: 'Tension headache', icd10: null, likelihood: 'Moderate',
          likelihood_pct: 30, rationale: 'r2',
          supporting_quotes: [{ turn: 99, quote: 'fabricated quote three' }], // dropped (out of range)
          contradicting_quotes: [],
        },
      ],
    })
    const result = await generateFinalDifferential(SAMPLE_TRANSCRIPT)
    expect(result.dropped_quotes).toBe(3)
    expect(result.differential[0].supporting_quotes).toHaveLength(1)
  })

  it('never logs the dropped quote text to the console', async () => {
    const secretQuote = 'FABRICATED_SENTINEL_QUOTE_TEXT_NEVER_LOGGED'
    mockHappyPath({
      differential: [
        {
          diagnosis: 'Migraine without aura', icd10: null, likelihood: 'High',
          likelihood_pct: 70, rationale: 'r',
          supporting_quotes: [{ turn: 1, quote: secretQuote }],
          contradicting_quotes: [],
        },
      ],
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await generateFinalDifferential(SAMPLE_TRANSCRIPT)

    const allLogs = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
      .join(' ')
    expect(allLogs).not.toContain(secretQuote)

    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  // ── Differential item shape / bounds ─────────────────────────────────

  it('caps the differential at 6 items even if the model returns more', async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      diagnosis: `Diagnosis ${i}`,
      icd10: null,
      likelihood: 'Low',
      likelihood_pct: 10,
      rationale: 'r',
      supporting_quotes: [],
      contradicting_quotes: [],
    }))
    mockHappyPath({ differential: many })
    const result = await generateFinalDifferential(SAMPLE_TRANSCRIPT)
    expect(result.differential.length).toBeLessThanOrEqual(6)
  })

  it('drops a differential entry with a missing/blank diagnosis rather than crashing', async () => {
    mockHappyPath({
      differential: [
        { diagnosis: '', icd10: null, likelihood: 'High', likelihood_pct: 50, rationale: 'r', supporting_quotes: [], contradicting_quotes: [] },
        { diagnosis: 'Real diagnosis', icd10: null, likelihood: 'High', likelihood_pct: 50, rationale: 'r', supporting_quotes: [], contradicting_quotes: [] },
      ],
    })
    const result = await generateFinalDifferential(SAMPLE_TRANSCRIPT)
    expect(result.differential).toHaveLength(1)
    expect(result.differential[0].diagnosis).toBe('Real diagnosis')
  })

  it('normalizes an unrecognized likelihood value to Moderate rather than passing it through', async () => {
    mockHappyPath({
      differential: [
        { diagnosis: 'X', icd10: null, likelihood: 'super-duper-high', likelihood_pct: 50, rationale: 'r', supporting_quotes: [], contradicting_quotes: [] },
      ],
    })
    const result = await generateFinalDifferential(SAMPLE_TRANSCRIPT)
    expect(result.differential[0].likelihood).toBe('Moderate')
  })

  it('treats a blank icd10 string as null', async () => {
    mockHappyPath({
      differential: [
        { diagnosis: 'X', icd10: '   ', likelihood: 'Low', likelihood_pct: 10, rationale: 'r', supporting_quotes: [], contradicting_quotes: [] },
      ],
    })
    const result = await generateFinalDifferential(SAMPLE_TRANSCRIPT)
    expect(result.differential[0].icd10).toBeNull()
  })

  // ── Grounding / degradation ──────────────────────────────────────────

  it('still produces a differential when plan evidence retrieval fails (non-fatal)', async () => {
    invokeBedrockJSONMock.mockResolvedValue({
      parsed: {
        primarySymptoms: ['headache'], location: [], temporalPattern: [], severity: [],
        associatedFeatures: [], redFlags: [], clinicalSummary: 'headache',
      },
      raw: '{}', stopReason: 'end_turn',
    })
    retrievePlanEvidenceMock.mockRejectedValue(new Error('DB unreachable'))
    invokeBedrockClinicalToolMock.mockResolvedValue({
      parsed: { differential: [], summary: 'no data' },
      raw: '{}', stopReason: 'tool_use',
    })

    await expect(generateFinalDifferential(SAMPLE_TRANSCRIPT)).resolves.toMatchObject({
      summary: 'no data',
    })
  })

  it('passes turn-numbered transcript text through to the symptom extractor call', async () => {
    mockHappyPath()
    await generateFinalDifferential(SAMPLE_TRANSCRIPT)

    const call = invokeBedrockJSONMock.mock.calls[0][0]
    const userContent = call.messages[0].content as string
    expect(userContent).toContain('Turn 0')
    expect(userContent).toContain('Turn 1')
    expect(userContent).toContain('I have had a throbbing headache for three days.')
  })
})
