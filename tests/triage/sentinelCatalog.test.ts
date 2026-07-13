import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  SENTINEL_SYNDROMES,
  parseSentinelCatalog,
  parseSentinelReleaseGates,
} from '@/lib/triage/sentinel/catalog'

const catalogPath = resolve(process.cwd(), 'qa/triage-sentinel/cases.json')

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
