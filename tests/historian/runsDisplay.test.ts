import { describe, expect, it } from 'vitest'
import { resolveDifferentials, resolveEvaluationStatus } from '@/components/historian/HistorianRunsView'
type Run = Parameters<typeof resolveDifferentials>[0]
const run = (final: unknown) => ({ final_differential: final }) as Run

describe('runs differential lifecycle display', () => {
  it.each(['pending', 'queued'])('shows %s with its timestamp', (status) => {
    expect(resolveEvaluationStatus(run({ status, queued_at: '2026-09-05T20:00:00Z' }))).toBe('Post-interview analysis pending (since 2026-09-05T20:00:00Z)')
    expect(resolveDifferentials(run({ status, queued_at: '2026-09-05T20:00:00Z' }))).toEqual([])
  })
  it('shows a failure class and generation time', () => {
    expect(resolveEvaluationStatus(run({ status: 'error', error_class: 'parse', provenance: { generated_at: '2026-09-05T20:00:00Z' } }))).toBe('Post-interview analysis failed (parse) at 2026-09-05T20:00:00Z')
  })
  it('preserves null and ok display', () => {
    expect(resolveEvaluationStatus(run(null))).toBeNull()
    expect(resolveDifferentials(run(null))).toEqual([])
    const ok = run({ status: 'ok', summary: 'Synthetic summary', differential: [{ diagnosis: 'Synthetic diagnosis', likelihood: 'High' }] })
    expect(resolveEvaluationStatus(ok)).toBeNull()
    expect(resolveDifferentials(ok)[0]).toMatchObject({ source: 'final', summary: 'Synthetic summary', entries: [{ diagnosis: 'Synthetic diagnosis', likelihood: 'high' }] })
  })
  it('preserves Riya’s live localizer exclusions alongside pending analysis', () => {
    const value = { ...run({ status: 'pending', queued_at: 'time' }), localizer_differential: [{ diagnosis: 'Synthetic diagnosis' }], localizer_excluded: [{ diagnosis: 'Excluded synthetic diagnosis', reason: 'Synthetic reason' }] }
    expect(resolveDifferentials(value)[0].excluded).toEqual(value.localizer_excluded)
  })
})
