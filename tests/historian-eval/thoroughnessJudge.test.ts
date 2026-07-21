import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

const { invokeBedrockClinicalToolMock } = vi.hoisted(() => ({
  invokeBedrockClinicalToolMock: vi.fn(),
}))

vi.mock('@/lib/bedrock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bedrock')>()
  return {
    ...actual,
    invokeBedrockClinicalTool: invokeBedrockClinicalToolMock,
  }
})

const { persistEvaluationMock } = vi.hoisted(() => ({ persistEvaluationMock: vi.fn(async () => {}) }))
vi.mock('@/lib/historian/eval/persistEvaluation', () => ({ persistEvaluation: persistEvaluationMock }))

import {
  generateThoroughnessEvaluation,
  runThoroughnessJudge,
} from '@/lib/historian/eval/thoroughnessJudge'
import { TranscriptTooLargeError, MAX_TRANSCRIPT_CHARS } from '@/lib/historian/eval/finalDifferential'
import { PROMPT_VERSIONS } from '@/lib/historian/eval/constants'
import { BEDROCK_MODEL } from '@/lib/bedrock'
import { loadRubric } from '@/lib/historian/eval/rubric'

function entry(overrides: Partial<HistorianTranscriptEntry> = {}): HistorianTranscriptEntry {
  return { role: 'assistant', text: 'Hello.', timestamp: 0, seq: 1, ...overrides }
}

// A clean, real historian opening/closing (so the deterministic phase-marker
// layer reports both present) around a couple of ordinary Q&A turns.
const STROKE_TRANSCRIPT: HistorianTranscriptEntry[] = [
  entry({
    role: 'assistant',
    text: "Hi there, welcome! My name is Henry, and I'll be helping gather some information before your visit with the neurologist today. So, to get us started — what's been going on lately?",
  }),
  entry({ role: 'user', text: 'My left arm suddenly went weak about two hours ago.', seq: 2 }),
  entry({ role: 'assistant', text: 'Are you currently taking any blood thinners like warfarin?', seq: 3 }),
  entry({ role: 'user', text: 'Yes, warfarin for my A-fib.', seq: 4 }),
  entry({
    role: 'assistant',
    text: "Thank you — I've got it all recorded and your neurologist will have the full picture ready before your visit. Take good care of yourself!",
    seq: 5,
  }),
]

function dimensionScore(overrides: Partial<{ score: number; evidence_turns: number[]; notes: string }> = {}) {
  return { score: 70, evidence_turns: [1], notes: 'ok', ...overrides }
}

function mockToolOutput(overrides: Record<string, unknown> = {}) {
  return {
    oldcarts: dimensionScore(),
    red_flags: dimensionScore(),
    pmh_meds_allergies: dimensionScore(),
    fh_sh: dimensionScore(),
    question_quality: dimensionScore(),
    closure: dimensionScore(),
    missed_critical_questions: [],
    diagnosis_leak: { leaked: false, quotes: [] },
    overall: 78,
    confidence: { level: 'Moderate', reason: 'Reasonable coverage for a short transcript.' },
    ...overrides,
  }
}

function mockHappyPath(overrides: Record<string, unknown> = {}) {
  invokeBedrockClinicalToolMock.mockResolvedValue({
    parsed: mockToolOutput(overrides),
    raw: '{}',
    stopReason: 'tool_use',
    inputTokens: 900,
    outputTokens: 300,
  })
}

describe('generateThoroughnessEvaluation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Deterministic guard (reused from finalDifferential.ts) ──────────────

  it('throws TranscriptTooLargeError and calls no Bedrock function when the serialized transcript exceeds the limit', async () => {
    mockHappyPath()
    const hugeTranscript: HistorianTranscriptEntry[] = [
      entry({ role: 'user', text: 'x'.repeat(MAX_TRANSCRIPT_CHARS), seq: 1 }),
    ]
    await expect(generateThoroughnessEvaluation(hugeTranscript)).rejects.toBeInstanceOf(TranscriptTooLargeError)
    expect(invokeBedrockClinicalToolMock).not.toHaveBeenCalled()
  })

  // ── Deterministic layer is always appended, regardless of the LLM ───────

  it('always includes the deterministic layer in the result, even when the LLM reports a clean session', async () => {
    mockHappyPath()
    const result = await generateThoroughnessEvaluation(STROKE_TRANSCRIPT, { chiefComplaint: 'left arm weakness' })
    expect(result.deterministic.phaseMarkers.openingPresent).toBe(true)
    expect(result.deterministic.phaseMarkers.closingPresent).toBe(true)
    expect(result.deterministic.turnCap.exceeded).toBe(false)
  })

  it('deterministic diagnosis-leak findings are appended even when the LLM itself did not flag a leak', async () => {
    mockHappyPath({ diagnosis_leak: { leaked: false, quotes: [] } })
    const transcript: HistorianTranscriptEntry[] = [
      ...STROKE_TRANSCRIPT.slice(0, -1),
      entry({ role: 'assistant', text: 'My diagnosis is a stroke.', seq: 5 }),
    ]
    const result = await generateThoroughnessEvaluation(transcript)
    expect(result.diagnosis_leak.leaked).toBe(true)
    expect(result.diagnosis_leak.quotes.some((q) => q.source === 'deterministic')).toBe(true)
  })

  // ── Rubric inlining / unvetted propagation ───────────────────────────────

  it('propagates unvetted: true (every real rubric file currently has vetted_by: null)', async () => {
    mockHappyPath()
    const result = await generateThoroughnessEvaluation(STROKE_TRANSCRIPT, { chiefComplaint: 'left arm weakness' })
    expect(result.unvetted).toBe(true)
  })

  it('provenance carries model_id, prompt_version, rubric_version, inference_params, generated_at', async () => {
    mockHappyPath()
    const result = await generateThoroughnessEvaluation(STROKE_TRANSCRIPT, { syndrome: 'acute-stroke' })
    const loaded = loadRubric({ syndrome: 'acute-stroke' })
    expect(result.provenance.model_id).toBe(BEDROCK_MODEL)
    expect(result.provenance.prompt_version).toBe('thoroughness-v1')
    expect(result.provenance.prompt_version).toBe(PROMPT_VERSIONS['thoroughness-v1'].id)
    expect(result.provenance.rubric_version).toBe(loaded.rubricVersion)
    expect(() => new Date(result.provenance.generated_at).toISOString()).not.toThrow()
  })

  it('inlines the loaded rubric critical_questions into the Bedrock call payload', async () => {
    mockHappyPath()
    await generateThoroughnessEvaluation(STROKE_TRANSCRIPT, { syndrome: 'acute-stroke' })
    const call = invokeBedrockClinicalToolMock.mock.calls[0][0]
    const userContent = call.messages[0].content as string
    expect(userContent).toContain('onset-time')
    expect(userContent).toContain('anticoagulant-use')
  })

  // ── Dimension score sanitization ─────────────────────────────────────────

  it('clamps an out-of-range dimension score into 0-100', async () => {
    mockHappyPath({ oldcarts: dimensionScore({ score: 500 }) })
    const result = await generateThoroughnessEvaluation(STROKE_TRANSCRIPT)
    expect(result.oldcarts.score).toBe(100)
  })

  it('drops out-of-bounds evidence_turns entries and counts them in dropped_findings', async () => {
    mockHappyPath({ oldcarts: dimensionScore({ evidence_turns: [0, 999, -1, 1.5] }) })
    const result = await generateThoroughnessEvaluation(STROKE_TRANSCRIPT)
    expect(result.oldcarts.evidence_turns).toEqual([0])
    expect(result.dropped_findings).toBeGreaterThan(0)
  })

  // ── missed_critical_questions sanitization + severity ceiling ───────────

  it('drops a missed_critical_questions entry whose rubric_id does not exist in the loaded rubric, and counts it', async () => {
    mockHappyPath({
      missed_critical_questions: [
        { rubric_id: 'totally-invented-id', severity: 'critical', why_it_matters: 'invented' },
      ],
    })
    const result = await generateThoroughnessEvaluation(STROKE_TRANSCRIPT, { syndrome: 'acute-stroke' })
    expect(result.missed_critical_questions).toHaveLength(0)
    expect(result.dropped_findings).toBeGreaterThan(0)
  })

  it('keeps a missed_critical_questions entry with a valid rubric_id and overrides severity from the rubric (not the model)', async () => {
    mockHappyPath({
      missed_critical_questions: [
        { rubric_id: 'onset-time', severity: 'minor', why_it_matters: 'model understated it' },
      ],
      overall: 95,
    })
    const result = await generateThoroughnessEvaluation(STROKE_TRANSCRIPT, { syndrome: 'acute-stroke' })
    expect(result.missed_critical_questions).toHaveLength(1)
    // onset-time is severity:"critical" in the real acute-stroke rubric — the
    // model's own (wrong) "minor" claim must not be trusted verbatim.
    expect(result.missed_critical_questions[0].severity).toBe('critical')
  })

  it('caps overall at 85 when a critical-severity rubric item is missed, even if the model scored higher', async () => {
    mockHappyPath({
      missed_critical_questions: [
        { rubric_id: 'onset-time', severity: 'critical', why_it_matters: 'never asked' },
      ],
      overall: 97,
    })
    const result = await generateThoroughnessEvaluation(STROKE_TRANSCRIPT, { syndrome: 'acute-stroke' })
    expect(result.overall).toBeLessThanOrEqual(85)
  })

  it('does not cap overall when only important/minor items are missed', async () => {
    mockHappyPath({
      missed_critical_questions: [
        { rubric_id: 'vascular-risk-factors', severity: 'critical', why_it_matters: 'model mislabels severity, but real rubric says important' },
      ],
      overall: 95,
    })
    const result = await generateThoroughnessEvaluation(STROKE_TRANSCRIPT, { syndrome: 'acute-stroke' })
    // vascular-risk-factors is severity:"important" in the real rubric, so
    // the sanitizer overrides the model's mislabeled "critical" claim and
    // the 85 cap must NOT apply.
    expect(result.missed_critical_questions[0].severity).toBe('important')
    expect(result.overall).toBe(95)
  })

  // ── diagnosis_leak quote verbatim validation ─────────────────────────────

  it('drops a model-claimed leak quote that is not a verbatim substring of the cited assistant turn', async () => {
    mockHappyPath({
      diagnosis_leak: { leaked: true, quotes: [{ turn: 0, quote: 'this was never actually said' }] },
    })
    const result = await generateThoroughnessEvaluation(STROKE_TRANSCRIPT)
    expect(result.diagnosis_leak.quotes.some((q) => q.source === 'llm')).toBe(false)
    expect(result.dropped_findings).toBeGreaterThan(0)
  })

  it('keeps a model-claimed leak quote that IS a verbatim substring of the cited assistant turn', async () => {
    mockHappyPath({
      diagnosis_leak: { leaked: true, quotes: [{ turn: 0, quote: 'welcome' }] },
    })
    const result = await generateThoroughnessEvaluation(STROKE_TRANSCRIPT)
    expect(result.diagnosis_leak.quotes.some((q) => q.source === 'llm' && q.quote === 'welcome')).toBe(true)
  })

  // ── confidence sanitization ───────────────────────────────────────────────

  it('normalizes an invalid confidence level to Moderate rather than passing it through', async () => {
    mockHappyPath({ confidence: { level: 'Extremely High', reason: 'r' } })
    const result = await generateThoroughnessEvaluation(STROKE_TRANSCRIPT)
    expect(result.confidence.level).toBe('Moderate')
  })

  // ── fidelity: only present when reports are supplied ─────────────────────

  it('omits fidelity from the tool schema AND result when no reports are supplied', async () => {
    mockHappyPath()
    const result = await generateThoroughnessEvaluation(STROKE_TRANSCRIPT)
    expect(result.fidelity).toBeNull()
    const call = invokeBedrockClinicalToolMock.mock.calls[0][0]
    expect(call.inputSchema.required).not.toContain('fidelity')
    expect(call.inputSchema.properties.fidelity).toBeUndefined()
  })

  it('requires fidelity in the tool schema and sanitizes it when reports are supplied', async () => {
    mockHappyPath({
      fidelity: {
        fabricated_claims: [{ report: 'narrative_summary', claim: 'patient has a family history of MS' }],
        material_omissions: [{ transcript_turn: 1, omission: 'anticoagulant use never mentioned in the report' }],
      },
    })
    const result = await generateThoroughnessEvaluation(STROKE_TRANSCRIPT, {
      reports: { narrative_summary: 'Patient with sudden left arm weakness.' },
    })
    const call = invokeBedrockClinicalToolMock.mock.calls[0][0]
    expect(call.inputSchema.required).toContain('fidelity')
    expect(result.fidelity).not.toBeNull()
    expect(result.fidelity!.fabricated_claims).toHaveLength(1)
  })

  it('drops a fabricated_claims entry whose report label does not match a supplied report key', async () => {
    mockHappyPath({
      fidelity: {
        fabricated_claims: [{ report: 'not_a_real_report_key', claim: 'invented' }],
        material_omissions: [],
      },
    })
    const result = await generateThoroughnessEvaluation(STROKE_TRANSCRIPT, {
      reports: { narrative_summary: 'Patient with sudden left arm weakness.' },
    })
    expect(result.fidelity!.fabricated_claims).toHaveLength(0)
    expect(result.dropped_findings).toBeGreaterThan(0)
  })

  // ── No PHI/patient text ever logged to console ────────────────────────────

  it('never logs matched diagnosis-leak or transcript text to the console', async () => {
    const secretQuote = 'SECRET_LEAK_TEXT_NEVER_LOGGED'
    const transcript: HistorianTranscriptEntry[] = [
      ...STROKE_TRANSCRIPT.slice(0, -1),
      entry({ role: 'assistant', text: `My diagnosis is stroke. ${secretQuote}`, seq: 5 }),
    ]
    mockHappyPath()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await generateThoroughnessEvaluation(transcript)

    const allLogs = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
      .join(' ')
    expect(allLogs).not.toContain(secretQuote)
    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })
})

describe('runThoroughnessJudge (fire-and-forget wrapper)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    persistEvaluationMock.mockResolvedValue(undefined)
  })

  it('generates and persists, passing provenance/result/usage/latency through to persistEvaluation', async () => {
    mockHappyPath()
    await runThoroughnessJudge('session-1', STROKE_TRANSCRIPT, { syndrome: 'acute-stroke' })

    expect(persistEvaluationMock).toHaveBeenCalledTimes(1)
    const call = persistEvaluationMock.mock.calls[0][0]
    expect(call.sessionId).toBe('session-1')
    expect(call.evaluator).toBe('thoroughness')
    expect(call.modelId).toBe(BEDROCK_MODEL)
    expect(call.promptVersion).toBe('thoroughness-v1')
    expect(typeof call.rubricVersion).toBe('string')
    expect(call.result).toBeTruthy()
    expect(typeof call.latencyMs).toBe('number')
  })

  it('never throws when the Bedrock call rejects — logs and returns', async () => {
    invokeBedrockClinicalToolMock.mockRejectedValue(new Error('bedrock boom'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(runThoroughnessJudge('session-2', STROKE_TRANSCRIPT)).resolves.toBeUndefined()
    expect(persistEvaluationMock).not.toHaveBeenCalled()
    const errorText = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(errorText).toMatch(/thoroughness (judge|eval)/i)
    errorSpy.mockRestore()
  })

  it('never throws when the transcript is too large — logs a warning and returns without calling Bedrock', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const hugeTranscript: HistorianTranscriptEntry[] = [
      entry({ role: 'user', text: 'x'.repeat(MAX_TRANSCRIPT_CHARS), seq: 1 }),
    ]
    await expect(runThoroughnessJudge('session-3', hugeTranscript)).resolves.toBeUndefined()
    expect(invokeBedrockClinicalToolMock).not.toHaveBeenCalled()
    expect(persistEvaluationMock).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
