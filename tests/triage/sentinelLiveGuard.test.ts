import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  parseSentinelCatalog,
  parseSentinelReleaseGates,
} from '@/lib/triage/sentinel/catalog'
import {
  assertLiveAllowed,
  runLiveSentinelCase,
  shouldInvokeSparseAdjudicator,
  type SentinelLiveDependencies,
} from '@/lib/triage/sentinel/liveRunner'
import type { ValidatedModelSafetyExtraction } from '@/lib/triage/modelSafetyExtraction'
import type { TriageDecisionState } from '@/lib/triage/types'
import { parseSentinelCliArgs } from '@/lib/triage/sentinel/cli'
import { buildSentinelReportFromOutcomes } from '@/lib/triage/sentinel/report'

const catalog = parseSentinelCatalog(
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'qa/triage-sentinel/cases.json'),
      'utf8',
    ),
  ),
)
const releaseGates = parseSentinelReleaseGates(
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'qa/triage-sentinel/release-gates.json'),
      'utf8',
    ),
  ),
)

function caseById(id: string) {
  const item = catalog.cases.find((candidate) => candidate.id === id)
  if (!item) throw new Error(`Missing sentinel fixture ${id}`)
  return item
}

function quietSafety(
  overrides: Partial<ValidatedModelSafetyExtraction> = {},
): ValidatedModelSafetyExtraction {
  return {
    carePathway: 'no_time_critical_signal',
    dataQuality: 'sufficient',
    criticalUnknowns: [],
    signals: [],
    ...overrides,
  }
}

function routineScoring(
  overrides: Partial<TriageDecisionState> = {},
): TriageDecisionState {
  return {
    carePathway: 'routine_outpatient',
    outpatientPriority: 'routine',
    dataQuality: 'sufficient',
    reviewRequirement: 'clinician_confirmation',
    schedulingLocked: true,
    weightedScore: 2,
    appliedFloors: [],
    ...overrides,
  }
}

function dependencies(
  overrides: Partial<SentinelLiveDependencies> = {},
): SentinelLiveDependencies {
  return {
    models: {
      safetyExtractor: 'us.anthropic.claude-sonnet-5',
      outpatientScorer: 'us.anthropic.claude-sonnet-4-6',
      adjudicator: 'us.anthropic.claude-opus-4-8',
      longPacketMapper: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    },
    runSafety: vi.fn(async () => ({
      result: quietSafety(),
      inputTokens: 100,
      outputTokens: 20,
    })),
    runScoring: vi.fn(async () => ({
      result: routineScoring(),
      inputTokens: 80,
      outputTokens: 30,
    })),
    runAdjudicator: vi.fn(async () => ({
      result: {
        carePathway: 'routine_outpatient',
        rationale: 'Synthetic adjudication fixture.',
        evidence: [],
        unresolvedConflicts: [],
      },
      inputTokens: 50,
      outputTokens: 10,
    })),
    ...overrides,
  }
}

describe('live execution guard', () => {
  it('requires an explicit --live opt-in for every model branch', () => {
    expect(() =>
      assertLiveAllowed({ live: false, branches: ['safety'] }),
    ).toThrow(/--live/)
    expect(() =>
      assertLiveAllowed({ live: true, branches: ['safety', 'scoring'] }),
    ).not.toThrow()
  })

  it('does not touch injected model dependencies when live opt-in is absent', async () => {
    const deps = dependencies()

    await expect(
      runLiveSentinelCase(
        caseById('stroke-current-short-rural'),
        { live: false, branches: ['safety'] },
        deps,
      ),
    ).rejects.toThrow(/--live/)
    expect(deps.runSafety).not.toHaveBeenCalled()
    expect(deps.runScoring).not.toHaveBeenCalled()
    expect(deps.runAdjudicator).not.toHaveBeenCalled()
  })
})

describe('live scorer emergency-envelope parity', () => {
  it('fuses an emergency-positive typed scorer failure without accepting malformed outpatient output', async () => {
    const error = Object.assign(
      new Error('AI response validation failed; emergency_override=true preserved'),
      {
        emergencyEnvelope: {
          emergentOverride: true,
          emergentReason: 'Synthetic emergency marker.',
        },
      },
    )
    const outcome = await runLiveSentinelCase(
      caseById('stroke-current-short-rural'),
      { live: true, branches: ['safety', 'scoring'] },
      dependencies({
        runSafety: vi.fn(async () => ({
          result: quietSafety(),
          inputTokens: null,
          outputTokens: null,
        })),
        runScoring: vi.fn(async () => {
          throw error
        }),
      }),
    )

    expect(outcome.actualPathway).toBe('emergency_now')
    expect(outcome.branchTelemetry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          branch: 'outpatient_scorer',
          status: 'failed',
        }),
      ]),
    )
  })
})

describe('sentinel CLI options', () => {
  it('defaults to a no-network offline run', () => {
    expect(parseSentinelCliArgs([])).toEqual(
      expect.objectContaining({
        live: false,
        branches: [],
        format: 'both',
        failOnGate: true,
        allLive: false,
        caseIds: [],
      }),
    )
  })

  it('accepts an explicit offline JSON report', () => {
    expect(parseSentinelCliArgs(['--offline', '--format', 'json'])).toEqual(
      expect.objectContaining({ live: false, format: 'json' }),
    )
  })

  it('requires --live before any live-only setting', () => {
    expect(() =>
      parseSentinelCliArgs(['--branches', 'safety,scoring']),
    ).toThrow(/--live/)
    expect(() =>
      parseSentinelCliArgs(['--profile', 'sevaro-sandbox']),
    ).toThrow(/--live/)
  })

  it('requires an explicit case allowlist or --all-live to bound model cost', () => {
    expect(() => parseSentinelCliArgs(['--live'])).toThrow(/--case|--all-live/)

    expect(
      parseSentinelCliArgs([
        '--live',
        '--case',
        'stroke-current-short-rural',
        '--branches',
        'safety,scoring,adjudicator',
        '--profile',
        'sevaro-sandbox',
        '--region',
        'us-east-2',
      ]),
    ).toEqual(
      expect.objectContaining({
        live: true,
        allLive: false,
        caseIds: ['stroke-current-short-rural'],
        branches: ['safety', 'scoring', 'adjudicator'],
        profile: 'sevaro-sandbox',
        region: 'us-east-2',
      }),
    )
  })

  it('rejects contradictory modes and unknown flags', () => {
    expect(() =>
      parseSentinelCliArgs(['--offline', '--live', '--all-live']),
    ).toThrow(/both/i)
    expect(() => parseSentinelCliArgs(['--surprise'])).toThrow(/unknown/i)
  })
})

describe('live report scope', () => {
  it('never treats a cost-bounded subset run as release-gate eligible', async () => {
    const outcome = await runLiveSentinelCase(
      caseById('prompt-injection-hard-negative'),
      { live: true, branches: ['safety', 'scoring', 'adjudicator'] },
      dependencies(),
    )

    const report = buildSentinelReportFromOutcomes({
      catalog,
      gateSet: releaseGates,
      mode: 'live_ensemble',
      outcomes: [outcome],
      evaluationScope: 'subset',
      generatedAt: '2026-07-11T12:00:00.000Z',
    })

    expect(report.evaluationScope).toBe('subset')
    expect(report.releaseGateEligible).toBe(false)
    expect(report.releaseGatePassed).toBe(false)
  })
})

describe('sparse Opus adjudication', () => {
  it.each([
    [{ disagreement: true, criticalUnknownCount: 0 }, true],
    [{ disagreement: false, criticalUnknownCount: 1 }, true],
    [{ disagreement: false, criticalUnknownCount: 0 }, false],
  ] as const)('uses only disagreement or critical unknowns: %o', (input, expected) => {
    expect(shouldInvokeSparseAdjudicator(input)).toBe(expected)
  })

  it('does not invoke Opus when the completed branches agree', async () => {
    const deps = dependencies()

    const result = await runLiveSentinelCase(
      caseById('prompt-injection-hard-negative'),
      { live: true, branches: ['safety', 'scoring', 'adjudicator'] },
      deps,
    )

    expect(result.actualPathway).toBe('routine_outpatient')
    expect(deps.runAdjudicator).not.toHaveBeenCalled()
    expect(
      result.branchTelemetry.find((item) => item.branch === 'adjudicator'),
    ).toEqual(
      expect.objectContaining({ executed: false, status: 'skipped' }),
    )
  })

  it('does not invoke Opus for a branch failure alone', async () => {
    const deps = dependencies({
      runSafety: vi.fn(async () => {
        throw new Error('synthetic safety branch failure')
      }),
    })

    const result = await runLiveSentinelCase(
      caseById('prompt-injection-hard-negative'),
      { live: true, branches: ['safety', 'scoring', 'adjudicator'] },
      deps,
    )

    expect(result.actualPathway).toBe('undetermined')
    expect(result.manualHold).toBe(true)
    expect(deps.runAdjudicator).not.toHaveBeenCalled()
  })

  it('invokes Opus on disagreement but cannot lower a deterministic emergency floor', async () => {
    const deps = dependencies()

    const result = await runLiveSentinelCase(
      caseById('stroke-current-short-rural'),
      {
        live: true,
        branches: ['safety', 'scoring', 'adjudicator'],
        pricing: {
          'us.anthropic.claude-sonnet-5': {
            inputUsdPerMillion: 3,
            outputUsdPerMillion: 15,
          },
          'us.anthropic.claude-opus-4-8': {
            inputUsdPerMillion: 15,
            outputUsdPerMillion: 75,
          },
        },
      },
      deps,
    )

    expect(deps.runAdjudicator).toHaveBeenCalledTimes(1)
    expect(result.actualPathway).toBe('emergency_now')
    expect(result.underTriaged).toBe(false)
    expect(
      result.branchTelemetry.find((item) => item.branch === 'adjudicator'),
    ).toEqual(
      expect.objectContaining({
        executed: true,
        modelId: 'us.anthropic.claude-opus-4-8',
        inputTokens: 50,
        outputTokens: 10,
        costUsd: 0.0015,
      }),
    )
  })

  it('invokes Opus for a critical unknown even when pathway classes agree', async () => {
    const runAdjudicator = vi.fn(async () => ({
      result: {
        carePathway: 'same_day_clinician_review' as const,
        rationale: 'Critical timing remains unknown.',
        evidence: [],
        unresolvedConflicts: ['Onset is unknown.'],
      },
      inputTokens: null,
      outputTokens: null,
    }))
    const deps = dependencies({
      runSafety: vi.fn(async () => ({
        result: quietSafety({
          carePathway: 'same_day_clinician_review',
          dataQuality: 'partial',
          criticalUnknowns: ['Is the focal deficit present now?'],
        }),
        inputTokens: null,
        outputTokens: null,
      })),
      runScoring: vi.fn(async () => ({
        result: routineScoring({
          carePathway: 'same_day_clinician_review',
          dataQuality: 'partial',
          reviewRequirement: 'immediate_clinician_review',
        }),
        inputTokens: null,
        outputTokens: null,
      })),
      runAdjudicator,
    })

    await runLiveSentinelCase(
      caseById('stroke-uncertain-onset-same-day'),
      { live: true, branches: ['safety', 'scoring', 'adjudicator'] },
      deps,
    )

    expect(runAdjudicator).toHaveBeenCalledTimes(1)
  })
})
