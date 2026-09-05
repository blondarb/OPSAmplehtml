import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const source = readFileSync('src/app/api/ai/historian/save/route.ts', 'utf8')
describe('historian save queue branch contract', () => {
  it('awaits only the pending marker in queue mode and preserves the inline alternative', () => {
    const start = source.indexOf("if (selectHistorianEvalMode(process.env.HISTORIAN_EVAL_MODE) === 'queue')")
    expect(start).toBeGreaterThan(-1)
    const end = source.indexOf('      } else {\n        const transcriptForEval', start)
    expect(end).toBeGreaterThan(start)
    const queued = source.slice(start, end)
    expect(queued).toContain('await pool.query(')
    expect(queued).toContain("status: 'pending'")
    expect(queued).toContain("source: 'save'")
    expect(queued).toContain("'42703'")
    expect(queued).not.toContain('runFinalDifferential(')
    expect(queued).not.toContain('runThoroughnessJudge(')
    expect(queued).not.toContain('runIndependentDdxAndAgreement(')
    expect(source.slice(end)).toContain('runFinalDifferential(')
    expect(source).toContain("process.env.HISTORIAN_EVAL_AUTORUN !== 'false'")
  })
})
