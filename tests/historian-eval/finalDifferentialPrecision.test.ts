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
    { id: 'time_course', question: 'When did the symptoms start?', severity: 'critical', coverage_hints: ['onset'] },
    { id: 'duration', severity: 'critical', coverage_hints: ['minutes'] },
    { id: 'unknown', severity: 'critical' },
    { id: 'minor', severity: 'minor', coverage_hints: ['missing'] },
  ] })
  mocks.json.mockResolvedValue({ result: { primarySymptoms: [], redFlags: [] } })
  mocks.tool.mockResolvedValue({ result: { differential: [candidate], summary: 'Synthetic summary', excluded: [excluded] }, modelId: 'synthetic-model' })
  mocks.query.mockResolvedValue({ rows: [] })
})

describe('final differential v3 precision', () => {
  it('defaults missing arrays, limits ranked items/quotes and caps confidence notes', () => {
    expect(sanitizeExcluded(transcript, undefined)).toEqual({ items: [], droppedQuotes: 0, droppedExclusions: 0, auditFlags: [] })
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
    expect(result.items.every((item) => item.evidence_quote === 'starts at rest')).toBe(true)
    expect(result.droppedExclusions).toBe(5)
    expect(sanitizeExcluded(transcript, [{ ...excluded, diagnosis: 'd'.repeat(220), exclusion_reason: 'r'.repeat(400) }]).items[0]).toMatchObject({ diagnosis: 'd'.repeat(200), exclusion_reason: 'r'.repeat(300) })
  })

  it('computes only unmatched critical hints, before inference, with caller context', async () => {
    const result = await generateFinalDifferential(transcript, 'Synthetic complaint', { syndrome: 'synthetic', structured_output: { hpi: 'Synthetic HPI' } })
    expect(result.unassessed).toEqual(['When did the symptoms start?'])
    expect(mocks.rubric).toHaveBeenCalledWith({ chiefComplaint: 'Synthetic complaint', syndrome: 'synthetic' })
    expect(mocks.rubric.mock.invocationCallOrder[0]).toBeLessThan(mocks.json.mock.invocationCallOrder[0])
    const call = mocks.tool.mock.calls[0][0]
    expect(call.system).toContain('POSITIVE evidence only')
    expect(call.system).toContain('never on missing information')
    expect(call.system).toContain('never put it in excluded')
    expect(call.system).toContain('Never name a diagnosis as confirmed or established')
    expect(call.messages[0].content).toContain('UNASSESSED\n- time course: When did the symptoms start?')
    expect(call.messages[0].content).toContain('"hpi":"Synthetic HPI"')
    expect(call.maxTokens).toBe(6000)
    expect(call.inputSchema.properties.excluded.items.properties.exclusion_reason.maxLength).toBe(300)
    expect(call.inputSchema.properties.excluded.items.properties.evidence_quote.maxLength).toBe(300)
    expect(call.system).toContain('Do not include any management, testing, referral, or treatment recommendation')
    expect(call.inputSchema.properties.excluded.maxItems).toBe(5)
    expect(call.inputSchema.properties.differential.items.properties.confidence_note.maxLength).toBe(200)
    expect(result.provenance.prompt_version).toBe('final-ddx-v3')
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

  it('emits only whole compact fields within the budget, never a prefix of a value', () => {
    const source = { before: 'whole', hpi: 'x'.repeat(7000), nested: { history: 'y'.repeat(6100) }, tail: 'also whole' }
    const context = buildPrecisionContext(source, [])
    const emitted = JSON.parse(context.split('STRUCTURED OUTPUT\n')[1].split('\n')[0])
    expect(emitted).toEqual({ before: source.before, tail: source.tail })
    for (const [key, value] of Object.entries(emitted)) expect(value).toEqual(source[key as keyof typeof source])
    expect(context).toContain('[omitted fields: hpi, nested]')
    expect(context).not.toContain('UNASSESSED')
    expect(buildPrecisionContext(null, [])).toContain('STRUCTURED OUTPUT\n{"value":null}')
  })

  it('rejects Historian quotes, invalid quotes, and uncited reason quotes or turn references', () => {
    const turns = [...transcript, { role: 'assistant' as const, text: 'Have you had any fever or stiff neck?', timestamp: 2, seq: 3 }]
    for (const item of [
      { ...excluded, evidence_quote: turns[2].text },
      { ...excluded, evidence_quote: 'invented' },
      { diagnosis: 'Synthetic', exclusion_reason: 'Turn 0 says symptoms are absent' },
      { diagnosis: 'Synthetic', exclusion_reason: 'Reports "absent"' },
      { diagnosis: 'Synthetic', exclusion_reason: 'structured_output denies fever' },
    ]) {
      expect(sanitizeExcluded(turns, [item])).toMatchObject({ items: [], droppedExclusions: 1 })
    }
  })

  it('removes unassessed labels or hints case-insensitively and demotes matching diagnoses', () => {
    const topics = [{ label: 'fever neck stiffness', question: 'Any fever or neck stiffness?', coverage_hints: ['fever', 'stiff neck'] }]
    const item = { diagnosis: 'Meningitis', exclusion_reason: 'structured_output.review_of_systems: "Denies fever, neck stiffness"' }
    const ranked = sanitizeDifferential(transcript, [{ diagnosis: 'Meningitis' }]).items
    expect(sanitizeExcluded(transcript, [item], topics, ranked)).toMatchObject({ items: [], droppedExclusions: 1 })
    expect(ranked[0].confidence_note).toContain('Any fever or neck stiffness?')
    expect(sanitizeExcluded(transcript, [{ ...excluded, exclusion_reason: 'No FEVER reported' }], topics).items).toEqual([])
    expect(sanitizeExcluded(transcript, [{ ...excluded, exclusion_reason: 'fever neck stiffness absent' }], ['fever neck stiffness']).items).toEqual([])
  })

  it('audits never-asked phrasing without dropping verified denials', () => {
    for (const phrase of ['not asked', 'never asked', 'not assessed', 'not discussed', 'no information', 'unclear whether']) {
      const result = sanitizeExcluded(transcript, [{ ...excluded, exclusion_reason: phrase }])
      expect(result.items).toHaveLength(1)
      expect(result.auditFlags).toEqual([excluded.diagnosis])
    }
    expect(sanitizeExcluded(transcript, [{ ...excluded, exclusion_reason: 'Patient denies symptoms; no symptoms reported' }]).auditFlags).toEqual([])
  })

  it('does not compute gaps or call inference for an abandoned syndrome-matching session', async () => {
    const result = await generateFinalDifferential(transcript.slice(0, 1), 'headache', { syndrome: 'headache' })
    expect(result).toMatchObject({ status: 'insufficient_transcript', unassessed: [], dropped_exclusions: 0 })
    expect(mocks.rubric).not.toHaveBeenCalled()
    expect(mocks.tool).not.toHaveBeenCalled()
  })

  it('persists combined dropped quote count and forwards structured output through the wrapper', async () => {
    mocks.tool.mockResolvedValue({ result: { differential: [{ diagnosis: 'Synthetic', supporting_quotes: [{ turn: 99, quote: 'bad' }] }], excluded: [{ ...excluded, evidence_quote: 'invented' }], summary: '' }, modelId: 'synthetic' })
    const { record } = await runFinalDifferential('synthetic-session', transcript, undefined, { structured_output: { hpi: 'Synthetic saved HPI' } })
    expect(record).toMatchObject({ dropped_quotes: 2, excluded: [], dropped_exclusions: 1 })
    expect(mocks.tool.mock.calls[0][0].messages[0].content).toContain('Synthetic saved HPI')
    expect(JSON.parse(mocks.query.mock.calls[0][1][0])).toEqual(record)
  })
})
