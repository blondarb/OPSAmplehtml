import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  SENTINEL_SYNDROMES,
  parseSentinelCatalog,
  parseSentinelReleaseGates,
} from '@/lib/triage/sentinel/catalog'

const catalogPath = resolve(process.cwd(), 'qa/triage-sentinel/cases.json')
const clinicalPolicyCatalogPath = resolve(
  process.cwd(),
  'qa/triage-sentinel/clinical-policy-cases.json',
)
const clinicalPolicyCoveragePath = resolve(
  process.cwd(),
  'qa/triage-sentinel/clinical-policy-coverage.json',
)

function loadRawCatalog(): unknown {
  return JSON.parse(readFileSync(catalogPath, 'utf8'))
}

describe('parseSentinelCatalog', () => {
  it('accepts the checked-in explicitly synthetic catalog with unique case ids', () => {
    const catalog = parseSentinelCatalog(loadRawCatalog())

    expect(catalog.synthetic).toBe(true)
    expect(catalog.schemaVersion).toBe('1.0')
    expect(new Set(catalog.cases.map((item) => item.id)).size).toBe(
      catalog.cases.length,
    )
  })

  it('rejects a catalog that is not explicitly synthetic', () => {
    const raw = loadRawCatalog() as Record<string, unknown>

    expect(() =>
      parseSentinelCatalog({ ...raw, synthetic: false }),
    ).toThrow(/synthetic/i)
  })

  it('rejects duplicate case ids', () => {
    const raw = loadRawCatalog() as {
      cases: unknown[]
      [key: string]: unknown
    }

    expect(() =>
      parseSentinelCatalog({
        ...raw,
        cases: [raw.cases[0], raw.cases[0]],
      }),
    ).toThrow(/duplicate/i)
  })

  it('contains a time-critical positive and hard negative for every syndrome family', () => {
    const catalog = parseSentinelCatalog(loadRawCatalog())

    for (const syndrome of SENTINEL_SYNDROMES) {
      expect(
        catalog.cases.some(
          (item) =>
            item.syndrome === syndrome &&
            item.expected.clinicalClass === 'time_critical',
        ),
        `missing time-critical positive for ${syndrome}`,
      ).toBe(true)
      expect(
        catalog.cases.some(
          (item) => item.syndrome === syndrome && item.hardNegative,
        ),
        `missing hard negative for ${syndrome}`,
      ).toBe(true)
    }
  })

  it('covers required adversarial contexts and packet placements', () => {
    const catalog = parseSentinelCatalog(loadRawCatalog())
    const tags = new Set(catalog.cases.flatMap((item) => item.tags))

    expect(tags).toEqual(
      expect.objectContaining(
        new Set([
          'negation',
          'historical',
          'family_experiencer',
          'copied_warning',
          'prompt_injection',
          'short_rural_referral',
          'long_mayo_like_packet',
          'critical_evidence_final_page',
          'missing_data',
          'conflicting_data',
        ]),
      ),
    )
  })

  it('marks model-only cases so offline execution cannot silently pass them', () => {
    const catalog = parseSentinelCatalog(loadRawCatalog())
    const modelOnly = catalog.cases.filter(
      (item) => !item.executionModes.includes('offline_deterministic'),
    )

    expect(modelOnly.length).toBeGreaterThan(0)
    expect(
      modelOnly.every((item) =>
        item.executionModes.includes('live_ensemble'),
      ),
    ).toBe(true)
  })

  it('keeps the approved clinical counterexamples in a separate synthetic, live-only development catalog', () => {
    const clinicalCatalog = parseSentinelCatalog(
      JSON.parse(readFileSync(clinicalPolicyCatalogPath, 'utf8')),
    )
    const coverage = JSON.parse(
      readFileSync(clinicalPolicyCoveragePath, 'utf8'),
    ) as { clinicalValidationClaim: boolean; coverage: Array<{ id: string; cases: string[] }> }

    expect(clinicalCatalog.synthetic).toBe(true)
    expect(clinicalCatalog.cases.length).toBeGreaterThan(20)
    expect(
      clinicalCatalog.cases.every((item) =>
        item.executionModes.includes('live_ensemble'),
      ),
    ).toBe(true)
    expect(
      clinicalCatalog.cases.some((item) =>
        item.tags.includes('observational'),
      ),
    ).toBe(true)
    expect(coverage.clinicalValidationClaim).toBe(false)
    expect(coverage.coverage.map((item) => item.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `C${String(index + 1).padStart(2, '0')}`),
    )
    for (const entry of coverage.coverage) {
      expect(entry.cases.length).toBeGreaterThan(0)
    }
    expect(
      clinicalCatalog.cases.find((item) => item.id === 'C08-ms-day12-unassessed')
        ?.decisionAt,
    ).toBe('2026-09-05T12:00:00.000Z')
    expect(
      clinicalCatalog.cases.find((item) => item.id === 'C11-header-chronology')
        ?.decisionAt,
    ).toBe('2026-09-05T12:00:00.000Z')
  })

  it('provides neutral source-only study imports and separately executable comparison variants', () => {
    const catalog = parseSentinelCatalog(JSON.parse(readFileSync(clinicalPolicyCatalogPath, 'utf8')))
    const rows = JSON.parse(readFileSync(resolve(process.cwd(), 'qa/triage-sentinel/clinical-policy-study-cases.json'), 'utf8')) as Array<Record<string, unknown>>
    expect(rows).toHaveLength(catalog.cases.length)
    rows.forEach((row, index) => {
      const item = catalog.cases[index]
      expect(item.input.kind).toBe('note')
      expect(row).toEqual({ case_number: index + 1, title: `Case ${index + 1}`, referral_text: item.input.kind === 'note' ? item.input.text : '', patient_age: null, patient_sex: null, is_calibration: false })
      expect(Object.keys(row)).not.toContain('expected')
      expect(String(row.referral_text)).not.toMatch(/Record urgency|Record tier|Inspect primary-care|Preserve coordinated care|Reconsider co-occurring/i)
    })
    for (const group of ['C09', 'C10', 'C16', 'C20']) {
      const variants = catalog.cases.filter(item => item.id.startsWith(group))
      expect(variants.length).toBeGreaterThanOrEqual(2)
      expect(new Set(variants.map(item => item.input.kind === 'note' ? item.input.text : '')).size).toBe(variants.length)
    }
  })

  it('accepts only fixed UTC instants for a reproducible case decision clock', () => {
    const raw = loadRawCatalog() as {
      cases: Array<Record<string, unknown>>
      [key: string]: unknown
    }
    expect(() =>
      parseSentinelCatalog({
        ...raw,
        cases: [{ ...raw.cases[0], decisionAt: '2026-09-05T12:00:00-06:00' }],
      }),
    ).toThrow(/UTC instant/i)
  })

  it('allows an explicit missing-source case but rejects an empty ordinary note', () => {
    const raw = loadRawCatalog() as {
      cases: Array<Record<string, unknown>>
      [key: string]: unknown
    }
    const first = raw.cases[0]

    expect(() =>
      parseSentinelCatalog({
        ...raw,
        cases: [{ ...first, input: { kind: 'note', text: '   ' } }],
      }),
    ).toThrow(/text/i)

    expect(() =>
      parseSentinelCatalog({
        ...raw,
        cases: [
          {
            ...first,
            id: 'missing-source-contract',
            input: {
              kind: 'missing',
              reason: 'No clinical text was supplied with the referral.',
            },
            expected: {
              clinicalClass: 'manual_hold',
              pathway: 'undetermined',
              acceptablePathways: ['undetermined'],
              requiredSyndromes: [],
            },
          },
        ],
      }),
    ).not.toThrow()
  })
})

describe('parseSentinelReleaseGates', () => {
  it('accepts only explicitly non-clinical-validation synthetic release gates', () => {
    const raw = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'qa/triage-sentinel/release-gates.json'),
        'utf8',
      ),
    )
    const gates = parseSentinelReleaseGates(raw)

    expect(gates.scope).toBe('synthetic_software_release_only')
    expect(gates.clinicalValidationClaim).toBe(false)
    expect(gates.gates.length).toBeGreaterThan(0)
    expect(() =>
      parseSentinelReleaseGates({ ...raw, clinicalValidationClaim: true }),
    ).toThrow(/clinicalValidationClaim/i)
  })
})
