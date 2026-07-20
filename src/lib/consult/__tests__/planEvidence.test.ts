import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Pool } from 'pg'
import { retrievePlanEvidence } from '@/lib/consult/planEvidence'

// ── Test helpers ────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

/**
 * Builds a fake pg Pool whose `query` routes to canned rows based on a
 * distinguishing substring in the SQL text — retrievePlanEvidence issues up
 * to three distinct statements (rank plans, pull differential rows, pull
 * evidence rows) and this lets each test supply independent fixtures for
 * each without depending on call order.
 */
function makePool(fixtures: { ranking?: Row[]; differential?: Row[]; evidence?: Row[] }) {
  const queryMock = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('FROM hits h')) {
      return { rows: fixtures.ranking ?? [], rowCount: fixtures.ranking?.length ?? 0 }
    }
    if (sql.includes('SELECT plan_id, diagnosis, features')) {
      return { rows: fixtures.differential ?? [], rowCount: fixtures.differential?.length ?? 0 }
    }
    if (sql.includes('SELECT plan_id, recommendation, evidence_level')) {
      return { rows: fixtures.evidence ?? [], rowCount: fixtures.evidence?.length ?? 0 }
    }
    throw new Error(`planEvidence.test: unrecognized query: ${sql}`)
  })
  return { pool: { query: queryMock } as unknown as Pool, queryMock }
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('retrievePlanEvidence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ranks matched plans, preserves DB rank order, and caps rows pulled per plan', async () => {
    const { pool, queryMock } = makePool({
      ranking: [
        { plan_id: 'thunderclap-headache-evaluation', title: 'Thunderclap Headache Evaluation', term_hits: 3 },
        { plan_id: 'migraine-with-aura', title: 'Migraine with Aura', term_hits: 1 },
      ],
      differential: [
        // 5 rows for the first plan — only top 4 (by display_order, already sorted) should appear
        { plan_id: 'thunderclap-headache-evaluation', diagnosis: 'Subarachnoid hemorrhage', features: 'Worst headache of life' },
        { plan_id: 'thunderclap-headache-evaluation', diagnosis: 'RCVS', features: 'Recurrent thunderclap headaches' },
        { plan_id: 'thunderclap-headache-evaluation', diagnosis: 'Cervical artery dissection', features: 'Neck pain, Horner syndrome' },
        { plan_id: 'thunderclap-headache-evaluation', diagnosis: 'PRES', features: 'Seizure, visual disturbance' },
        { plan_id: 'thunderclap-headache-evaluation', diagnosis: 'Pituitary apoplexy', features: 'Visual field defect' },
        { plan_id: 'migraine-with-aura', diagnosis: 'Migraine with aura', features: 'Visual aura preceding headache' },
      ],
      evidence: [
        // 6 rows for the first plan — only top 5 (by display_order) should appear
        { plan_id: 'thunderclap-headache-evaluation', recommendation: 'Non-contrast CT head', evidence_level: 'Class I' },
        { plan_id: 'thunderclap-headache-evaluation', recommendation: 'LP if CT negative', evidence_level: 'Class I' },
        { plan_id: 'thunderclap-headache-evaluation', recommendation: 'CTA head/neck', evidence_level: 'Class IIa' },
        { plan_id: 'thunderclap-headache-evaluation', recommendation: 'MRI/MRA brain', evidence_level: 'Class IIa' },
        { plan_id: 'thunderclap-headache-evaluation', recommendation: 'Neurosurgery consult if SAH confirmed', evidence_level: 'Class I' },
        { plan_id: 'thunderclap-headache-evaluation', recommendation: 'Repeat imaging at 24h if initial negative', evidence_level: 'Class IIb' },
      ],
    })

    const result = await retrievePlanEvidence(pool, {
      symptomTerms: ['thunderclap headache', 'photophobia'],
      chiefComplaint: 'sudden severe headache',
      maxPlans: 3,
    })

    // Citations preserve DB rank order
    expect(result.citations).toEqual(['Thunderclap Headache Evaluation', 'Migraine with Aura'])

    // guidelineText orders the higher-ranked plan's block first
    const idxThunderclap = result.guidelineText.indexOf('Thunderclap Headache Evaluation')
    const idxMigraine = result.guidelineText.indexOf('Migraine with Aura')
    expect(idxThunderclap).toBeGreaterThanOrEqual(0)
    expect(idxMigraine).toBeGreaterThan(idxThunderclap)

    // Content pulled through
    expect(result.guidelineText).toContain('Subarachnoid hemorrhage')
    expect(result.guidelineText).toContain('Non-contrast CT head (Class I)')

    // Per-plan row caps respected: 5th differential + 6th evidence row dropped
    expect(result.guidelineText).not.toContain('Pituitary apoplexy')
    expect(result.guidelineText).not.toContain('Repeat imaging at 24h if initial negative')

    expect(queryMock).toHaveBeenCalledTimes(3)
  })

  it('returns an empty result and skips follow-up queries when zero plans match', async () => {
    const { pool, queryMock } = makePool({ ranking: [] })

    const result = await retrievePlanEvidence(pool, {
      symptomTerms: ['exceedingly rare presentation'],
      chiefComplaint: 'zebra diagnosis',
    })

    expect(result).toEqual({ guidelineText: '', citations: [] })
    // Only the ranking query should have fired — no point pulling evidence/differential for zero plans
    expect(queryMock).toHaveBeenCalledTimes(1)
  })

  it('returns an empty result without touching the DB when no search terms survive filtering', async () => {
    const { pool, queryMock } = makePool({})

    const result = await retrievePlanEvidence(pool, {
      symptomTerms: ['MS', 'a', ''],
      chiefComplaint: undefined,
    })

    expect(result).toEqual({ guidelineText: '', citations: [] })
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('passes search terms as bound parameters — lowercased, deduped, short terms dropped — never concatenated into SQL text', async () => {
    const { pool, queryMock } = makePool({ ranking: [] })
    const injectionAttempt = "photophobia'; DROP TABLE plans; --"

    await retrievePlanEvidence(pool, {
      symptomTerms: ['Headache', 'headache', injectionAttempt, 'MS', 'thunderclap onset'],
      chiefComplaint: 'Severe Head Pain',
    })

    expect(queryMock).toHaveBeenCalledTimes(1)
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]]

    // Term-building: lowercased, 'Headache'/'headache' deduped to one, 'MS' (<3 chars) dropped,
    // chiefComplaint folded in after symptomTerms.
    expect(params[0]).toEqual(['headache', injectionAttempt.toLowerCase(), 'thunderclap onset', 'severe head pain'])

    // Parameterized, not string-concatenated: the raw injection payload must never appear in the SQL text itself.
    expect(sql).not.toContain('DROP TABLE')
    expect(sql).not.toContain(injectionAttempt)
    expect(sql).toMatch(/\$1/)
    expect(sql).toMatch(/\$2/)
    expect(sql).toMatch(/\$3/)
  })

  it('caps search terms at 12', async () => {
    const { pool, queryMock } = makePool({ ranking: [] })
    const manyTerms = Array.from({ length: 15 }, (_, i) => `symptomterm${i}`)

    await retrievePlanEvidence(pool, { symptomTerms: manyTerms })

    const [, params] = queryMock.mock.calls[0] as [string, unknown[]]
    expect((params[0] as string[]).length).toBe(12)
    expect(params[0]).toEqual(manyTerms.slice(0, 12).map((t) => t.toLowerCase()))
  })

  it('caps the concatenated guidelineText at 4000 characters', async () => {
    const longRecommendation = 'x'.repeat(900)
    const { pool } = makePool({
      ranking: [
        { plan_id: 'plan-a', title: 'Plan A', term_hits: 2 },
        { plan_id: 'plan-b', title: 'Plan B', term_hits: 1 },
        { plan_id: 'plan-c', title: 'Plan C', term_hits: 1 },
      ],
      evidence: ['plan-a', 'plan-b', 'plan-c'].flatMap((plan_id) =>
        Array.from({ length: 5 }, () => ({
          plan_id,
          recommendation: longRecommendation,
          evidence_level: 'Class I',
        }))
      ),
    })

    const result = await retrievePlanEvidence(pool, {
      symptomTerms: ['headache'],
      maxPlans: 3,
    })

    expect(result.guidelineText.length).toBe(4000)
  })

  it('defaults maxPlans to 3 and reflects it in the ranking query LIMIT param', async () => {
    const { pool, queryMock } = makePool({ ranking: [] })

    await retrievePlanEvidence(pool, { symptomTerms: ['headache'] })

    const [, params] = queryMock.mock.calls[0] as [string, unknown[]]
    expect(params[2]).toBe(3)
  })
})
