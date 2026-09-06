import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'
const mocks = vi.hoisted(() => ({ rubric: vi.fn(), json: vi.fn(), tool: vi.fn(), query: vi.fn() }))
vi.mock('@/lib/historian/eval/rubric', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/historian/eval/rubric')>(), loadRubric: mocks.rubric }))
vi.mock('@/lib/historian/eval/bedrockMeta', () => ({ invokeBedrockJSONWithMeta: mocks.json, invokeBedrockClinicalToolWithMeta: mocks.tool }))
vi.mock('@/lib/db', () => ({ getNeuroPlansPool: vi.fn(), getPool: async () => ({ query: mocks.query }) }))
vi.mock('@/lib/consult/planEvidence', () => ({ retrievePlanEvidence: async () => ({ guidelineText: '' }) }))
import { buildPrecisionContext, computeUnassessed, generateFinalDifferential, runFinalDifferential, sanitizeDifferential, sanitizeExcluded } from '@/lib/historian/eval/finalDifferential'
const transcript: HistorianTranscriptEntry[] = [
  { role: 'user', text: 'Synthetic symptom starts at rest.', timestamp: 0, seq: 1 },
  { role: 'user', text: 'Synthetic symptom lasts minutes.', timestamp: 1, seq: 2 },
]
const candidate = { diagnosis: 'Synthetic candidate', confidence_note: 'x'.repeat(220) }
const excluded = { diagnosis: 'Synthetic alternative', exclusion_reason: 'Turn 0: "starts at rest"', evidence_quote: 'starts at rest' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rubric.mockReturnValue({ criticalQuestions: [
    { id: 'time_course', severity: 'critical', coverage_hints: ['onset'] },
    { id: 'duration', severity: 'critical', coverage_hints: ['minutes'] },
    { id: 'unknown', severity: 'critical' },
    { id: 'minor', severity: 'minor', coverage_hints: ['missing'] },
  ] })
  mocks.json.mockResolvedValue({ result: { primarySymptoms: [], redFlags: [] } })
  mocks.tool.mockResolvedValue({ result: { differential: [candidate], summary: 'Synthetic summary', excluded: [excluded] }, modelId: 'synthetic-model' })
  mocks.query.mockResolvedValue({ rows: [] })
})

describe('final differential v2 precision', () => {
  it('defaults missing arrays, limits ranked items/quotes and caps confidence notes', () => {
    expect(sanitizeExcluded(transcript, undefined)).toEqual({ items: [], droppedQuotes: 0 })
    expect(sanitizeDifferential(transcript, null)).toEqual({ items: [], droppedQuotes: 0 })
    const result = sanitizeDifferential(transcript, Array(9).fill({ ...candidate, supporting_quotes: Array(9).fill({ turn: 0, quote: 'starts at rest' }) }))
    expect(result.items).toHaveLength(6)
    expect(result.items[0].confidence_note).toHaveLength(200)
    expect(result.items[0].supporting_quotes).toHaveLength(6)
    expect(result.items[0].contradicting_quotes).toEqual([])
    expect(sanitizeDifferential(transcript, [{ diagnosis: 'Synthetic' }]).items[0].confidence_note).toBeUndefined()
  })

  it('drops exclusions without reasons, caps fields/count, and verifies single-turn quotes', () => {
    const result = sanitizeExcluded(transcript, [
      { diagnosis: 'No reason' }, { diagnosis: 'Blank', exclusion_reason: '  ' },
      excluded,
      { ...excluded, evidence_quote: 'invented' },
      { ...excluded, evidence_quote: 'rest. Synthetic symptom' },
      { ...excluded, diagnosis: 'd'.repeat(220), exclusion_reason: 'r'.repeat(1100), evidence_quote: 'q'.repeat(1001) },
      ...Array(8).fill(excluded),
    ])
    expect(result.items).toHaveLength(5)
    expect(result.droppedQuotes).toBe(3)
    expect(result.items[0].evidence_quote).toBe('starts at rest')
    expect(result.items[1].evidence_quote).toBeUndefined()
    expect(result.items[3].diagnosis).toHaveLength(200)
    expect(result.items[3].exclusion_reason).toHaveLength(1000)
  })

  it('computes only unmatched critical hints, before inference, with caller context', async () => {
    const result = await generateFinalDifferential(transcript, 'Synthetic complaint', { syndrome: 'synthetic', structured_output: { hpi: 'Synthetic HPI' } })
    expect(result.unassessed).toEqual(['time course'])
    expect(mocks.rubric).toHaveBeenCalledWith({ chiefComplaint: 'Synthetic complaint', syndrome: 'synthetic' })
    expect(mocks.rubric.mock.invocationCallOrder[0]).toBeLessThan(mocks.json.mock.invocationCallOrder[0])
    const call = mocks.tool.mock.calls[0][0]
    expect(call.system).toContain('POSITIVE evidence only')
    expect(call.system).toContain('never on missing information')
    expect(call.system).toContain('never put it in excluded')
    expect(call.system).toContain('Never name a diagnosis as confirmed or established')
    expect(call.messages[0].content).toContain('UNASSESSED\n- time course')
    expect(call.messages[0].content).toContain('"hpi": "Synthetic HPI"')
    expect(call.inputSchema.properties.excluded.maxItems).toBe(5)
    expect(call.inputSchema.properties.differential.items.properties.confidence_note.maxLength).toBe(200)
    expect(result.provenance.prompt_version).toBe('final-ddx-v2')
  })

  it('caps deterministic labels/count and never accepts model-proposed gaps', async () => {
    mocks.rubric.mockReturnValue({ criticalQuestions: Array.from({ length: 12 }, (_, i) => ({ id: `topic_${i}_${'x'.repeat(90)}`, severity: 'critical', coverage_hints: ['missing'] })) })
    expect(computeUnassessed(transcript, {})).toHaveLength(8)
    expect(computeUnassessed(transcript, {})[0]).toHaveLength(80)
    mocks.rubric.mockReturnValue({ criticalQuestions: [] })
    mocks.tool.mockResolvedValue({ result: { differential: [], summary: '', unassessed: ['Invented gap'] }, modelId: 'synthetic' })
    expect((await generateFinalDifferential(transcript)).unassessed).toEqual([])
    expect(mocks.tool.mock.calls[0][0].messages[0].content).not.toContain('UNASSESSED')
  })

  it('logs only a fixed event if rubric loading fails', () => {
    mocks.rubric.mockImplementation(() => { throw new Error('Do not log source text') })
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    expect(computeUnassessed(transcript, {})).toEqual([])
    expect(log).toHaveBeenCalledExactlyOnceWith('historian_final_ddx_rubric_unavailable')
    log.mockRestore()
  })

  it('pretty-prints and truncates structured output to 6000 characters', () => {
    const source = { hpi: 'x'.repeat(7000), tail: 'not included' }
    const context = buildPrecisionContext(source, [])
    expect(context).toBe('\n\nSTRUCTURED OUTPUT\n' + JSON.stringify(source, null, 2).slice(0, 6000) + '\n[Structured output truncated at 6000 characters]')
    expect(context).not.toContain('UNASSESSED')
    expect(buildPrecisionContext(null, [])).toContain('STRUCTURED OUTPUT\nnull')
  })

  it('persists combined dropped quote count and forwards structured output through the wrapper', async () => {
    mocks.tool.mockResolvedValue({ result: { differential: [{ diagnosis: 'Synthetic', supporting_quotes: [{ turn: 99, quote: 'bad' }] }], excluded: [{ ...excluded, evidence_quote: 'invented' }], summary: '' }, modelId: 'synthetic' })
    const { record } = await runFinalDifferential('synthetic-session', transcript, undefined, { structured_output: { hpi: 'Synthetic saved HPI' } })
    expect(record).toMatchObject({ dropped_quotes: 2, excluded: [{ diagnosis: excluded.diagnosis, exclusion_reason: excluded.exclusion_reason }] })
    expect(mocks.tool.mock.calls[0][0].messages[0].content).toContain('Synthetic saved HPI')
    expect(JSON.parse(mocks.query.mock.calls[0][1][0])).toEqual(record)
  })
})
