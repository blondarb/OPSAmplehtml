/**
 * Pure render tests for the batch eval harness report builder (Historian
 * Validation Suite Task 5). Every case here is canned in-memory data — no
 * Bedrock/DB call, no fixture file I/O. See report.ts's module doc.
 */
import { describe, expect, it } from 'vitest'

import {
  buildHistorianEvalReport,
  formatHistorianEvalMarkdown,
  aggregateHistorianEvalCases,
  evaluateHistorianEvalGates,
  parseHistorianEvalReleaseGates,
  UNVETTED_SELF_LABEL,
  HISTORIAN_EVAL_HEADLINE,
  type HistorianEvalCaseOutcome,
  type HistorianEvalRunResult,
  type HistorianEvalReleaseGateSet,
} from '@/lib/historian/eval/report'
import { INVESTIGATIONAL_BANNER } from '@/lib/historian/eval/constants'
import releaseGatesJson from '../../qa/historian-eval/release-gates.json'
import type { FinalDifferential } from '@/lib/historian/eval/finalDifferential'
import type { ThoroughnessEvaluation } from '@/lib/historian/eval/thoroughnessJudge'
import type { IndependentDifferential } from '@/lib/historian/eval/independentDdx'
import type { AgreementResult } from '@/lib/historian/eval/agreement'

// ── Canned-data builders ─────────────────────────────────────────────────────

function run<T>(overrides: Partial<HistorianEvalRunResult<T>> = {}): HistorianEvalRunResult<T> {
  return {
    ok: true,
    result: null,
    error: null,
    skippedReason: null,
    latencyMs: 100,
    costUsd: 0.001,
    modelId: 'test-model',
    promptVersion: 'test-prompt-v1',
    rubricVersion: null,
    inferenceParams: { temperature: 0 },
    ...overrides,
  }
}

function failedRun<T>(error: string): HistorianEvalRunResult<T> {
  return run<T>({ ok: false, result: null, error, latencyMs: 50, costUsd: null, modelId: null, promptVersion: null, inferenceParams: null })
}

function skippedRun<T>(reason: string): HistorianEvalRunResult<T> {
  return run<T>({ ok: false, result: null, error: null, skippedReason: reason, latencyMs: 0, costUsd: null, modelId: null, promptVersion: null, inferenceParams: null })
}

function finalDifferential(overrides: Partial<FinalDifferential> = {}): FinalDifferential {
  return {
    differential: [
      { diagnosis: 'Migraine without aura', icd10: 'G43.0', likelihood: 'High', likelihood_pct: 70, rationale: 'r', supporting_quotes: [], contradicting_quotes: [] },
      { diagnosis: 'Tension headache', icd10: 'G44.2', likelihood: 'Moderate', likelihood_pct: 20, rationale: 'r', supporting_quotes: [], contradicting_quotes: [] },
    ],
    summary: 'summary',
    provenance: { model_id: 'sonnet', prompt_version: 'final-ddx-v1', inference_params: { temperature: 0 }, generated_at: '2026-07-21T00:00:00.000Z' },
    dropped_quotes: 0,
    ...overrides,
  }
}

function thoroughnessEvaluation(overrides: Partial<ThoroughnessEvaluation> = {}): ThoroughnessEvaluation {
  const dim = { score: 80, evidence_turns: [0], notes: 'n' }
  return {
    oldcarts: dim,
    red_flags: dim,
    pmh_meds_allergies: dim,
    fh_sh: dim,
    question_quality: dim,
    closure: dim,
    missed_critical_questions: [],
    diagnosis_leak: { leaked: false, quotes: [] },
    fidelity: null,
    overall: 80,
    confidence: { level: 'High', reason: 'r' },
    unvetted: true,
    deterministic: {
      diagnosisLeak: { leaked: false, matches: [] },
      phaseMarkers: { openingPresent: true, closingPresent: true },
      turnCap: { patientTurnCount: 5, limit: 25, exceeded: false },
      structuredOutput: { valid: false, issues: ['structured_output is missing'] },
      criticalCoverage: [],
      issues: ['structured_output is missing'],
    },
    dropped_findings: 0,
    coverage_disagreement: false,
    provenance: {
      model_id: 'sonnet',
      prompt_version: 'thoroughness-v1',
      rubric_version: 'base-neuro-hpi-v1',
      inference_params: { temperature: 0 },
      generated_at: '2026-07-21T00:00:00.000Z',
    },
    ...overrides,
  }
}

function independentDifferential(overrides: Partial<IndependentDifferential> = {}): IndependentDifferential {
  return {
    differential: [
      { diagnosis: 'Migraine', icd10: 'G43.9', likelihood: 'High', likelihood_pct: 65, rationale: 'r', supporting_quotes: [], contradicting_quotes: [] },
    ],
    summary: 'summary',
    provenance: { model_id: 'deepseek-r1', prompt_version: 'independent-ddx-r1-v1', inference_params: { temperature: 0.6 }, generated_at: '2026-07-21T00:00:00.000Z' },
    dropped_quotes: 0,
    stop_reason: 'stop',
    retried: false,
    ...overrides,
  }
}

function agreementResult(overrides: Partial<AgreementResult> = {}): AgreementResult {
  return {
    top1Match: true,
    top3Overlap: 1,
    jaccardTop3: 0.5,
    matchedPairs: [{ a: 'Migraine without aura', b: 'Migraine', via: 'icd10' }],
    disagreements: [],
    ...overrides,
  }
}

function makeCase(overrides: Partial<HistorianEvalCaseOutcome> = {}): HistorianEvalCaseOutcome {
  return {
    caseId: 'acute-stroke.json',
    source: 'fixture',
    chiefComplaint: 'Sudden weakness',
    syndrome: 'acute-stroke',
    turnCount: 10,
    finalDifferential: run<FinalDifferential>({ result: finalDifferential(), promptVersion: 'final-ddx-v1', modelId: 'sonnet' }),
    thoroughness: run<ThoroughnessEvaluation>({
      result: thoroughnessEvaluation(),
      promptVersion: 'thoroughness-v1',
      rubricVersion: 'base-neuro-hpi-v1+acute-stroke-v1',
      modelId: 'sonnet',
    }),
    independentDdx: run<IndependentDifferential>({ result: independentDifferential(), promptVersion: 'independent-ddx-r1-v1', modelId: 'deepseek-r1' }),
    agreement: run<AgreementResult>({ result: agreementResult(), promptVersion: 'agreement-icd10-adjudicated-v1', modelId: 'haiku', costUsd: null }),
    groundTruth: {
      expectedCandidates: ['Migraine without aura'],
      pipeline: { top1Hit: true, top3Hit: true },
      independent: { top1Hit: false, top3Hit: true },
    },
    ...overrides,
  }
}

const GATE_SET: HistorianEvalReleaseGateSet = {
  schemaVersion: '1.0',
  gateSetId: 'test-gate-set-v1',
  scope: 'synthetic_software_release_only',
  clinicalValidationClaim: false,
  gates: [
    {
      id: 'thoroughness-floor',
      scope: 'synthetic_software_release_only',
      metric: 'thoroughness_mean_overall',
      operator: 'gte',
      threshold: 70,
      description: 'Mean thoroughness overall must be at least 70.',
    },
    {
      id: 'zero-diagnosis-leaks',
      scope: 'synthetic_software_release_only',
      metric: 'deterministic_diagnosis_leak_count',
      operator: 'eq',
      threshold: 0,
      description: 'No deterministic diagnosis leaks.',
    },
    {
      id: 'ddx-top3-ground-truth',
      scope: 'synthetic_software_release_only',
      metric: 'pipeline_ground_truth_top3_rate',
      operator: 'gte',
      threshold: 0.6,
      description: 'Pipeline GT top-3 rate >= 0.6.',
    },
    {
      id: 'independent-agreement-top3',
      scope: 'synthetic_software_release_only',
      metric: 'independent_agreement_top3_rate',
      operator: 'gte',
      threshold: 0.5,
      description: 'Independent/pipeline top-3 agreement rate >= 0.5.',
    },
  ],
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildHistorianEvalReport + formatHistorianEvalMarkdown', () => {
  it('always includes the INVESTIGATIONAL_BANNER constant and the headline', () => {
    const report = buildHistorianEvalReport({
      mode: 'fixtures',
      live: true,
      cases: [makeCase()],
      gateSet: GATE_SET,
      generatedAt: '2026-07-21T00:00:00.000Z',
    })
    expect(report.banner).toBe(INVESTIGATIONAL_BANNER)
    expect(report.headline).toBe(HISTORIAN_EVAL_HEADLINE)
    expect(report.clinicalValidationClaim).toBe(false)

    const md = formatHistorianEvalMarkdown(report)
    expect(md).toContain(INVESTIGATIONAL_BANNER)
    expect(md).toContain(HISTORIAN_EVAL_HEADLINE)
  })

  describe('self-label logic', () => {
    it('shows the unvetted self-label when any case used an unvetted rubric', () => {
      const report = buildHistorianEvalReport({
        mode: 'fixtures',
        live: true,
        cases: [makeCase({ thoroughness: run({ result: thoroughnessEvaluation({ unvetted: true }) }) })],
        gateSet: GATE_SET,
        generatedAt: '2026-07-21T00:00:00.000Z',
      })
      expect(report.selfLabel.unvetted).toBe(true)
      expect(report.selfLabel.label).toBe(UNVETTED_SELF_LABEL)
      const md = formatHistorianEvalMarkdown(report)
      expect(md).toContain(UNVETTED_SELF_LABEL)
    })

    it('does NOT show the unvetted self-label when every case used a vetted rubric', () => {
      const report = buildHistorianEvalReport({
        mode: 'fixtures',
        live: true,
        cases: [makeCase({ thoroughness: run({ result: thoroughnessEvaluation({ unvetted: false }) }) })],
        gateSet: GATE_SET,
        generatedAt: '2026-07-21T00:00:00.000Z',
      })
      expect(report.selfLabel.unvetted).toBe(false)
      expect(report.selfLabel.label).toBeNull()
      const md = formatHistorianEvalMarkdown(report)
      expect(md).not.toContain(UNVETTED_SELF_LABEL)
    })
  })

  describe('honest-n', () => {
    it('computes n from the case count rather than hardcoding it (fixtures mode)', () => {
      const report = buildHistorianEvalReport({
        mode: 'fixtures',
        live: true,
        cases: [makeCase({ caseId: 'a' }), makeCase({ caseId: 'b' }), makeCase({ caseId: 'c' })],
        gateSet: GATE_SET,
        generatedAt: '2026-07-21T00:00:00.000Z',
      })
      expect(report.honestN.n).toBe(3)
      expect(report.honestN.label).toBe('n=3 development-set personas; tuning permitted; no held-out claims')
    })

    it('uses sessions-mode framing (not "development-set personas") for sessions mode', () => {
      const report = buildHistorianEvalReport({
        mode: 'sessions',
        live: true,
        cases: [makeCase({ source: 'session' })],
        gateSet: GATE_SET,
        generatedAt: '2026-07-21T00:00:00.000Z',
      })
      expect(report.honestN.label).not.toContain('development-set personas')
      expect(report.honestN.label).toContain('n=1')
    })
  })

  describe('gate math', () => {
    it('passes a gte gate exactly at the threshold', () => {
      const gates = evaluateHistorianEvalGates(
        aggregateHistorianEvalCases([makeCase({ thoroughness: run({ result: thoroughnessEvaluation({ overall: 70 }) }) })]),
        GATE_SET,
        true,
      )
      const gate = gates.find((g) => g.id === 'thoroughness-floor')!
      expect(gate.observed).toBe(70)
      expect(gate.passed).toBe(true)
    })

    it('fails a gte gate one unit below the threshold', () => {
      const gates = evaluateHistorianEvalGates(
        aggregateHistorianEvalCases([makeCase({ thoroughness: run({ result: thoroughnessEvaluation({ overall: 69 }) }) })]),
        GATE_SET,
        true,
      )
      const gate = gates.find((g) => g.id === 'thoroughness-floor')!
      expect(gate.passed).toBe(false)
    })

    it('passes an eq gate exactly at threshold (zero diagnosis leaks)', () => {
      const gates = evaluateHistorianEvalGates(aggregateHistorianEvalCases([makeCase()]), GATE_SET, true)
      const gate = gates.find((g) => g.id === 'zero-diagnosis-leaks')!
      expect(gate.observed).toBe(0)
      expect(gate.passed).toBe(true)
    })

    it('fails an eq gate when the count is nonzero', () => {
      const leaked = makeCase({
        thoroughness: run({
          result: thoroughnessEvaluation({
            deterministic: {
              diagnosisLeak: { leaked: true, matches: [{ turnIndex: 2, phrase: 'you have migraine', label: 'you have' }] },
              phaseMarkers: { openingPresent: true, closingPresent: true },
              turnCap: { patientTurnCount: 5, limit: 25, exceeded: false },
              structuredOutput: { valid: false, issues: [] },
              criticalCoverage: [],
              issues: [],
            },
          }),
        }),
      })
      const gates = evaluateHistorianEvalGates(aggregateHistorianEvalCases([leaked]), GATE_SET, true)
      const gate = gates.find((g) => g.id === 'zero-diagnosis-leaks')!
      expect(gate.observed).toBe(1)
      expect(gate.passed).toBe(false)
    })

    it('passes a rate gate exactly at its threshold (0.6 with 3/5 hits)', () => {
      const cases = [
        makeCase({ caseId: 'a', groundTruth: { expectedCandidates: ['x'], pipeline: { top1Hit: true, top3Hit: true }, independent: null } }),
        makeCase({ caseId: 'b', groundTruth: { expectedCandidates: ['x'], pipeline: { top1Hit: true, top3Hit: true }, independent: null } }),
        makeCase({ caseId: 'c', groundTruth: { expectedCandidates: ['x'], pipeline: { top1Hit: true, top3Hit: true }, independent: null } }),
        makeCase({ caseId: 'd', groundTruth: { expectedCandidates: ['x'], pipeline: { top1Hit: false, top3Hit: false }, independent: null } }),
        makeCase({ caseId: 'e', groundTruth: { expectedCandidates: ['x'], pipeline: { top1Hit: false, top3Hit: false }, independent: null } }),
      ]
      const gates = evaluateHistorianEvalGates(aggregateHistorianEvalCases(cases), GATE_SET, true)
      const gate = gates.find((g) => g.id === 'ddx-top3-ground-truth')!
      expect(gate.observed).toBe(0.6)
      expect(gate.passed).toBe(true)
    })

    it('marks every gate NOT evaluated when live is false, regardless of aggregate data', () => {
      const gates = evaluateHistorianEvalGates(aggregateHistorianEvalCases([makeCase()]), GATE_SET, false)
      for (const gate of gates) {
        expect(gate.evaluated).toBe(false)
        expect(gate.observed).toBeNull()
        expect(gate.passed).toBeNull()
      }
    })

    it('rolls gate results up into releaseGatePassed at the report level', () => {
      const allPass = buildHistorianEvalReport({
        mode: 'fixtures',
        live: true,
        cases: [makeCase()],
        gateSet: GATE_SET,
        generatedAt: '2026-07-21T00:00:00.000Z',
      })
      expect(allPass.releaseGatePassed).toBe(true)

      const oneFails = buildHistorianEvalReport({
        mode: 'fixtures',
        live: true,
        cases: [makeCase({ thoroughness: run({ result: thoroughnessEvaluation({ overall: 10 }) }) })],
        gateSet: GATE_SET,
        generatedAt: '2026-07-21T00:00:00.000Z',
      })
      expect(oneFails.releaseGatePassed).toBe(false)

      const dryRun = buildHistorianEvalReport({
        mode: 'fixtures',
        live: false,
        cases: [],
        gateSet: GATE_SET,
        generatedAt: '2026-07-21T00:00:00.000Z',
      })
      expect(dryRun.releaseGatePassed).toBeNull()
    })
  })

  describe('aggregates render as ranges, never a single point estimate', () => {
    it('computes min/mean/max across cases with differing scores', () => {
      const report = buildHistorianEvalReport({
        mode: 'fixtures',
        live: true,
        cases: [
          makeCase({ caseId: 'low', thoroughness: run({ result: thoroughnessEvaluation({ overall: 60 }) }) }),
          makeCase({ caseId: 'high', thoroughness: run({ result: thoroughnessEvaluation({ overall: 90 }) }) }),
        ],
        gateSet: GATE_SET,
        generatedAt: '2026-07-21T00:00:00.000Z',
      })
      expect(report.aggregates.thoroughnessOverall).toEqual({ n: 2, min: 60, mean: 75, max: 90 })

      const md = formatHistorianEvalMarkdown(report)
      expect(md).toContain('min 60.0')
      expect(md).toContain('mean 75.0')
      expect(md).toContain('max 90.0')
      // Guard against a regression that collapses the range into one number.
      expect(md.includes('min 60.0') && md.includes('max 90.0')).toBe(true)
    })

    it('is null (not zero) when no case produced a thoroughness result', () => {
      const aggregates = aggregateHistorianEvalCases([makeCase({ thoroughness: failedRun('boom') })])
      expect(aggregates.thoroughnessOverall).toBeNull()
    })
  })

  describe('dry run (live: false)', () => {
    it('produces a complete, honest report shape without claiming any evaluation happened', () => {
      const report = buildHistorianEvalReport({
        mode: 'fixtures',
        live: false,
        cases: [],
        gateSet: GATE_SET,
        generatedAt: '2026-07-21T00:00:00.000Z',
      })
      expect(report.live).toBe(false)
      expect(report.releaseGateEligible).toBe(false)
      expect(report.releaseGatePassed).toBeNull()
      expect(report.selfLabel.label).toBeNull()

      const md = formatHistorianEvalMarkdown(report)
      expect(md).toContain('dry run')
      expect(md).toContain('NOT EVALUATED')
    })
  })

  describe('cost/latency', () => {
    it('sums known costs per evaluator and flags partial/unknown when some are null', () => {
      const report = buildHistorianEvalReport({
        mode: 'fixtures',
        live: true,
        cases: [makeCase()],
        gateSet: GATE_SET,
        generatedAt: '2026-07-21T00:00:00.000Z',
      })
      const thoroughnessRow = report.costLatency.byEvaluator.find((e) => e.evaluator === 'thoroughness')!
      expect(thoroughnessRow.totalCostUsd).toBe(0.001)
      expect(thoroughnessRow.costKnownForAll).toBe(true)

      // agreement's costUsd is null in makeCase() (agreement.ts exposes no token usage) — never coerced to zero.
      const agreementRow = report.costLatency.byEvaluator.find((e) => e.evaluator === 'agreement')!
      expect(agreementRow.totalCostUsd).toBeNull()
      expect(agreementRow.costKnownForAll).toBe(false)

      const md = formatHistorianEvalMarkdown(report)
      expect(md).toContain('unknown')
      expect(md).toContain('(partial/unknown)')
    })

    it('excludes skipped evaluators from n/latency/cost totals', () => {
      const skipped = makeCase({ agreement: skippedRun('requires both finalDifferential and independentDdx') })
      const summary = aggregateHistorianEvalCases([skipped])
      expect(summary.totalCases).toBe(1)
      const report = buildHistorianEvalReport({
        mode: 'fixtures',
        live: true,
        cases: [skipped],
        gateSet: GATE_SET,
        generatedAt: '2026-07-21T00:00:00.000Z',
      })
      const agreementRow = report.costLatency.byEvaluator.find((e) => e.evaluator === 'agreement')!
      expect(agreementRow.n).toBe(0)
      expect(agreementRow.totalLatencyMs).toBe(0)
    })
  })

  describe('per-case scorecards', () => {
    it('renders one scorecard per case with thoroughness, ddx, agreement, and ground-truth data', () => {
      const report = buildHistorianEvalReport({
        mode: 'fixtures',
        live: true,
        cases: [makeCase({ caseId: 'first-seizure.json' })],
        gateSet: GATE_SET,
        generatedAt: '2026-07-21T00:00:00.000Z',
      })
      const md = formatHistorianEvalMarkdown(report)
      expect(md).toContain('first-seizure.json')
      expect(md).toContain('overall=80')
      expect(md).toContain('confidence=High')
      expect(md).toContain('Migraine without aura')
      expect(md).toContain('top1Match=true')
    })

    it('surfaces a per-case evaluator failure without crashing the render', () => {
      const report = buildHistorianEvalReport({
        mode: 'fixtures',
        live: true,
        cases: [makeCase({ independentDdx: failedRun('DeepSeek-R1 output was not differential-shaped') })],
        gateSet: GATE_SET,
        generatedAt: '2026-07-21T00:00:00.000Z',
      })
      const md = formatHistorianEvalMarkdown(report)
      expect(md).toContain('FAILED')
      expect(md).toContain('DeepSeek-R1 output was not differential-shaped')
    })
  })

  describe('parseHistorianEvalReleaseGates', () => {
    it('parses the real committed gate file', () => {
      const gateSet = parseHistorianEvalReleaseGates(releaseGatesJson)
      expect(gateSet.gates.map((g) => g.id).sort()).toEqual([
        'ddx-top3-ground-truth',
        'independent-agreement-top3',
        'thoroughness-floor',
        'zero-diagnosis-leaks',
      ])
      expect(gateSet.clinicalValidationClaim).toBe(false)
    })

    it('rejects a gate set missing clinicalValidationClaim: false', () => {
      expect(() =>
        parseHistorianEvalReleaseGates({
          schemaVersion: '1.0',
          gateSetId: 'x',
          scope: 'synthetic_software_release_only',
          clinicalValidationClaim: true,
          gates: [],
        }),
      ).toThrow(/clinicalValidationClaim/)
    })

    it('rejects a gate with an unknown metric', () => {
      expect(() =>
        parseHistorianEvalReleaseGates({
          schemaVersion: '1.0',
          gateSetId: 'x',
          scope: 'synthetic_software_release_only',
          clinicalValidationClaim: false,
          gates: [
            {
              id: 'bad',
              scope: 'synthetic_software_release_only',
              metric: 'made_up_metric',
              operator: 'gte',
              threshold: 1,
              description: 'd',
            },
          ],
        }),
      ).toThrow(/metric/)
    })

    it('rejects duplicate gate ids', () => {
      const oneGate = {
        id: 'dup',
        scope: 'synthetic_software_release_only',
        metric: 'deterministic_diagnosis_leak_count',
        operator: 'eq',
        threshold: 0,
        description: 'd',
      }
      expect(() =>
        parseHistorianEvalReleaseGates({
          schemaVersion: '1.0',
          gateSetId: 'x',
          scope: 'synthetic_software_release_only',
          clinicalValidationClaim: false,
          gates: [oneGate, oneGate],
        }),
      ).toThrow(/duplicate/)
    })
  })

  it('produces valid JSON (round-trips through JSON.stringify/parse)', () => {
    const report = buildHistorianEvalReport({
      mode: 'fixtures',
      live: true,
      cases: [makeCase()],
      gateSet: GATE_SET,
      generatedAt: '2026-07-21T00:00:00.000Z',
    })
    const roundTripped = JSON.parse(JSON.stringify(report))
    expect(roundTripped.headline).toBe(HISTORIAN_EVAL_HEADLINE)
    expect(roundTripped.gates).toHaveLength(4)
  })
})
