import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  parseSentinelCatalog,
  parseSentinelReleaseGates,
} from '@/lib/triage/sentinel/catalog'
import {
  aggregateSentinelMetrics,
  classifySentinelDisposition,
  evaluateSentinelReleaseGates,
  runOfflineSentinelCase,
  runOfflineSentinelSuite,
} from '@/lib/triage/sentinel/evaluator'
import type {
  SentinelCaseOutcome,
  SentinelReleaseGateSet,
} from '@/lib/triage/sentinel/types'
import {
  buildOfflineSentinelReport,
  formatSentinelMarkdown,
} from '@/lib/triage/sentinel/report'

const catalog = parseSentinelCatalog(
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'qa/triage-sentinel/cases.json'),
      'utf8',
    ),
  ),
)

function caseById(id: string) {
  const item = catalog.cases.find((candidate) => candidate.id === id)
  if (!item) throw new Error(`Missing sentinel fixture ${id}`)
  return item
}

describe('runOfflineSentinelCase', () => {
  it('finds emergency evidence only on the final page of a long packet with exact provenance', () => {
    const result = runOfflineSentinelCase(
      caseById('long-mayo-like-final-page-stroke'),
    )

    expect(result.evaluated).toBe(true)
    expect(result.actualPathway).toBe('emergency_now')
    expect(result.exactOrAcceptable).toBe(true)
    expect(result.evidenceValidation.invalidReferences).toBe(0)
    expect(
      result.signals.some((signal) =>
        signal.evidence.some(
          (evidence) =>
            evidence.documentId === 'current-referral-and-addenda' &&
            evidence.pageNumber === 8,
        ),
      ),
    ).toBe(true)
  })

  it('fails closed to an explicit manual hold when clinical text is missing', () => {
    const result = runOfflineSentinelCase(
      caseById('missing-referral-clinical-text'),
    )

    expect(result.evaluated).toBe(true)
    expect(result.actualPathway).toBe('undetermined')
    expect(result.manualHold).toBe(true)
    expect(result.exactOrAcceptable).toBe(true)
    expect(result.alertRaised).toBe(false)
  })

  it('does not execute or silently pass a case declared live-only', () => {
    const result = runOfflineSentinelCase(
      caseById('other-time-critical-nms-model-only'),
    )

    expect(result.evaluated).toBe(false)
    expect(result.actualPathway).toBeNull()
    expect(result.exactOrAcceptable).toBe(false)
    expect(result.unevaluatedReason).toMatch(/live_ensemble/)
    expect(result.branchTelemetry).toEqual([
      expect.objectContaining({
        branch: 'deterministic_gateway',
        executed: false,
        status: 'skipped',
      }),
    ])
  })

  it('keeps every offline hard negative below the time-critical alert boundary', () => {
    const outcomes = catalog.cases
      .filter(
        (item) =>
          item.hardNegative &&
          item.executionModes.includes('offline_deterministic'),
      )
      .map(runOfflineSentinelCase)

    expect(outcomes.length).toBeGreaterThan(0)
    const falseAlerts = outcomes.filter((outcome) => outcome.alertRaised)
    expect(falseAlerts.map((outcome) => outcome.caseId)).toEqual([])
  })
})

describe('classifySentinelDisposition', () => {
  it('counts an emergency abstention as both under-triage and manual hold', () => {
    const result = classifySentinelDisposition(
      {
        clinicalClass: 'time_critical',
        pathway: 'emergency_now',
        acceptablePathways: ['emergency_now'],
        requiredSyndromes: ['acute_cerebrovascular'],
      },
      'undetermined',
    )

    expect(result).toEqual({
      exactOrAcceptable: false,
      underTriaged: true,
      overTriaged: false,
      manualHold: true,
      alertRaised: false,
    })
  })

  it('counts a current-emergency alert on a routine hard negative as over-triage', () => {
    const result = classifySentinelDisposition(
      {
        clinicalClass: 'routine',
        pathway: 'routine_outpatient',
        acceptablePathways: ['routine_outpatient'],
        requiredSyndromes: [],
      },
      'emergency_now',
    )

    expect(result.overTriaged).toBe(true)
    expect(result.underTriaged).toBe(false)
    expect(result.alertRaised).toBe(true)
  })
})

describe('sentinel metrics and release gates', () => {
  it('reports safety, trust, abstention, evidence, subgroup, alert burden, and telemetry separately', () => {
    const suite = runOfflineSentinelSuite(catalog)

    expect(suite.metrics.totalCases).toBe(catalog.cases.length)
    expect(suite.metrics.evaluatedCases).toBeGreaterThan(0)
    expect(suite.metrics.unevaluatedCases).toBeGreaterThan(0)
    expect(suite.metrics.underTriage).toEqual(
      expect.objectContaining({ count: expect.any(Number), denominator: expect.any(Number) }),
    )
    expect(suite.metrics.overTriage.count).toBe(0)
    expect(suite.metrics.manualHold.count).toBeGreaterThan(0)
    expect(suite.metrics.hardNegativeFalseAlerts.count).toBe(0)
    expect(suite.metrics.alertBurden.denominator).toBe(
      suite.metrics.evaluatedCases,
    )
    expect(suite.metrics.evidenceExactness.count).toBe(
      suite.metrics.evidenceExactness.denominator,
    )
    expect(suite.metrics.bySyndrome.acute_cerebrovascular).toBeDefined()
    expect(suite.metrics.bySubgroup.negation).toBeDefined()
    expect(suite.metrics.telemetryByBranch.deterministic_gateway).toEqual(
      expect.objectContaining({
        executions: suite.metrics.evaluatedCases,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      }),
    )
    expect(suite.metrics.telemetryByBranch.adjudicator).toEqual({
      executions: 0,
      inputTokens: 0,
      outputTokens: 0,
      tokenUsageComplete: true,
      latencyMs: 0,
      costUsd: 0,
    })
  })

  it('uses explicit denominators and never turns an empty denominator into a perfect rate', () => {
    const metrics = aggregateSentinelMetrics([])

    expect(metrics.exactOrAcceptable).toEqual({
      count: 0,
      denominator: 0,
      rate: null,
    })
    expect(metrics.evidenceExactness.rate).toBeNull()
    expect(metrics.hardNegativeFalseAlerts.rate).toBeNull()
  })

  it('reports observed values for both passing and failing declarative gates', () => {
    const outcome = runOfflineSentinelCase(
      caseById('stroke-current-short-rural'),
    )
    const corrupted: SentinelCaseOutcome = {
      ...outcome,
      underTriaged: true,
      actualPathway: 'routine_outpatient',
      exactOrAcceptable: false,
    }
    const metrics = aggregateSentinelMetrics([corrupted])
    const gates: SentinelReleaseGateSet = {
      schemaVersion: '1.0',
      gateSetId: 'test-gates',
      scope: 'synthetic_software_release_only',
      clinicalValidationClaim: false,
      gates: [
        {
          id: 'zero-emergency-under-triage',
          scope: 'synthetic_software_release_only',
          metric: 'emergency_under_triage_count',
          operator: 'eq',
          threshold: 0,
          description: 'Synthetic emergency misses must be zero.',
        },
        {
          id: 'manual-hold-bounded',
          scope: 'synthetic_software_release_only',
          metric: 'manual_hold_rate',
          operator: 'lte',
          threshold: 1,
          description: 'Synthetic hold burden is bounded.',
        },
      ],
    }

    const results = evaluateSentinelReleaseGates(metrics, gates)

    expect(results[0]).toEqual(
      expect.objectContaining({ observed: 1, passed: false }),
    )
    expect(results[1]).toEqual(
      expect.objectContaining({ observed: 0, passed: true }),
    )
  })

  it('builds a stable non-validation report with every required metric family', () => {
    const gateSet = parseSentinelReleaseGates(
      JSON.parse(
        readFileSync(
          resolve(process.cwd(), 'qa/triage-sentinel/release-gates.json'),
          'utf8',
        ),
      ),
    )
    const report = buildOfflineSentinelReport(
      catalog,
      gateSet,
      '2026-07-11T12:00:00.000Z',
    )
    const markdown = formatSentinelMarkdown(report)

    expect(report.synthetic).toBe(true)
    expect(report.clinicalValidationClaim).toBe(false)
    expect(report.gates.length).toBe(gateSet.gates.length)
    expect(report.releaseGatePassed).toBe(true)
    expect(markdown).toContain('NOT CLINICALLY VALIDATED')
    expect(markdown).toContain('Under-triage')
    expect(markdown).toContain('Over-triage')
    expect(markdown).toContain('Manual hold')
    expect(markdown).toContain('Exact evidence')
    expect(markdown).toContain('Alert burden')
    expect(markdown).toContain('Tokens / cost / latency')
    expect(markdown).toContain('Syndrome performance')
  })
})
