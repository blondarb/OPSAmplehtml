import { beforeEach, expect, it, vi } from 'vitest'
import type { HydratedCaseInput } from '@/lib/historian/eval/cli'
const mocks = vi.hoisted(() => ({ final: vi.fn(), independent: vi.fn(), thoroughness: vi.fn(), persist: vi.fn(), query: vi.fn() }))
vi.mock('@/lib/historian/eval/finalDifferential', async (original) => ({
  ...await original<typeof import('@/lib/historian/eval/finalDifferential')>(), generateFinalDifferential: mocks.final,
}))
vi.mock('@/lib/historian/eval/independentDdx', async (original) => ({
  ...await original<typeof import('@/lib/historian/eval/independentDdx')>(), generateIndependentDdx: mocks.independent,
  adjudicateEquivalence: async () => [],
}))
vi.mock('@/lib/historian/eval/thoroughnessJudge', () => ({ generateThoroughnessEvaluationWithUsage: mocks.thoroughness }))
vi.mock('@/lib/historian/eval/persistEvaluation', () => ({ persistEvaluation: mocks.persist }))
vi.mock('@/lib/db', () => ({ getPool: async () => ({ query: mocks.query }) }))
import { runHydratedCase } from '@/lib/historian/eval/cli'
import { withExcludedCount } from '@/lib/historian/eval/independentDdx'
const provenance = { model_id: 'synthetic', prompt_version: 'final-ddx-v3', inference_params: {}, generated_at: '2026-09-06T02:00:00Z' }
const input: HydratedCaseInput = {
  caseId: 'synthetic-session', source: 'session', chiefComplaint: 'headache', syndrome: 'headache',
  narrativeSummary: null, expectedDDx: [],
  structuredOutput: { hpi: 'Synthetic saved history' } as unknown as HydratedCaseInput['structuredOutput'],
  transcript: [{ role: 'user', text: 'Synthetic first response', timestamp: 0, seq: 1 }, { role: 'user', text: 'Synthetic second response', timestamp: 1, seq: 2 }],
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.query.mockResolvedValue({ rows: [] })
  mocks.thoroughness.mockRejectedValue(new Error('Synthetic unavailable judge'))
  mocks.independent.mockResolvedValue({ differential: [], summary: '', provenance, dropped_quotes: 0 })
})
it.each([{ excluded: [] }, { excluded: [{ diagnosis: 'Synthetic excluded', exclusion_reason: 'Patient statement', evidence_quote: 'Synthetic first response' }] }])('persists the same agreement metadata as the live helper and forwards context (%j)', async ({ excluded }) => {
  const final = { differential: [], excluded, summary: '', provenance, dropped_quotes: 0, dropped_exclusions: 0, status: 'ok' }
  mocks.final.mockResolvedValue(final)
  const result = await runHydratedCase(input, { live: true, persist: true })
  expect(mocks.final).toHaveBeenCalledWith(input.transcript, 'headache', { structured_output: input.structuredOutput, syndrome: 'headache' })
  const agreement = mocks.persist.mock.calls.find(([row]) => row.evaluator === 'agreement')?.[0]
  expect(agreement).toBeDefined()
  expect(agreement.result).toEqual(withExcludedCount(result.agreement.result!, final))
  expect(agreement.result.excluded_count).toBe(excluded.length)
})
