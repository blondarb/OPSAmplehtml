import {
  EMERGENCY_GATEWAY_VERSION,
  runEmergencyGateway,
  type EmergencyGatewayResult,
  type GatewaySignal,
} from '../emergencyGateway'
import {
  applyAdjudicatorDecision,
  fuseTriageBranches,
  type ClinicalBranch,
} from '../ensemblePolicy'
import { scanLongPacketEmergency } from '../longPacketEmergency'
import { planLongPacketChunks } from '../longPacketPlanner'
import type { ValidatedTriageAdjudicatorDecision } from '../modelAdjudicator'
import type { ValidatedModelSafetyExtraction } from '../modelSafetyExtraction'
import type { TriageModelRegistry } from '../modelRegistry'
import type { CarePathway, TriageDecisionState } from '../types'
import {
  classifySentinelDisposition,
  validateSentinelEvidence,
} from './evaluator'
import type {
  SentinelBranchTelemetry,
  SentinelCase,
  SentinelCaseOutcome,
} from './types'
import type { BedrockTokenUsage } from '../../bedrock'

export type SentinelLiveBranch = 'safety' | 'scoring' | 'adjudicator'

export interface SentinelModelPricing {
  inputUsdPerMillion: number
  outputUsdPerMillion: number
}

export interface SentinelLiveOptions {
  live: boolean
  branches: SentinelLiveBranch[]
  pricing?: Record<string, SentinelModelPricing>
}

export interface SentinelLiveInvocation<T> {
  result: T
  inputTokens: number | null
  outputTokens: number | null
}

export interface SentinelLiveDependencies {
  models: TriageModelRegistry
  runSafety: (
    item: SentinelCase,
  ) => Promise<SentinelLiveInvocation<ValidatedModelSafetyExtraction>>
  runScoring: (
    item: SentinelCase,
  ) => Promise<SentinelLiveInvocation<TriageDecisionState>>
  runAdjudicator: (
    item: SentinelCase,
    context: {
      deterministicPathway: string
      safetyModelPathway: string
      scoringPathway: string
      fusionReasons: string[]
    },
  ) => Promise<SentinelLiveInvocation<ValidatedTriageAdjudicatorDecision>>
}

const LIVE_BRANCHES: SentinelLiveBranch[] = [
  'safety',
  'scoring',
  'adjudicator',
]

export function assertLiveAllowed(options: SentinelLiveOptions): void {
  if (!Array.isArray(options.branches) || options.branches.length === 0) {
    throw new Error('Live sentinel execution requires at least one model branch.')
  }
  if (
    options.branches.some((branch) => !LIVE_BRANCHES.includes(branch)) ||
    new Set(options.branches).size !== options.branches.length
  ) {
    throw new Error('Live sentinel branches are invalid or duplicated.')
  }
  if (!options.live) {
    throw new Error(
      'Model-backed sentinel execution is disabled unless --live is explicitly supplied.',
    )
  }
}

export function shouldInvokeSparseAdjudicator(input: {
  disagreement: boolean
  criticalUnknownCount: number
}): boolean {
  if (
    !Number.isSafeInteger(input.criticalUnknownCount) ||
    input.criticalUnknownCount < 0
  ) {
    throw new Error('criticalUnknownCount must be a non-negative integer.')
  }
  return input.disagreement || input.criticalUnknownCount > 0
}

function packetSourceText(item: SentinelCase): string {
  if (item.input.kind === 'note') return item.input.text
  if (item.input.kind === 'missing') return item.input.reason
  return item.input.documents
    .flatMap((document) =>
      document.pages.map(
        (page) =>
          `--- ${document.documentId} page ${page.pageNumber} ---\n${page.text}`,
      ),
    )
    .join('\n\n')
}

function outpatientPriority(tier: string): TriageDecisionState['outpatientPriority'] {
  if (
    ['urgent', 'semi_urgent', 'routine_priority', 'routine', 'non_urgent'].includes(
      tier,
    )
  ) {
    return tier as TriageDecisionState['outpatientPriority']
  }
  return tier === 'emergent' ? 'urgent' : 'routine'
}

async function loadDefaultLiveDependencies(): Promise<SentinelLiveDependencies> {
  const [
    safetyModule,
    scoringModule,
    adjudicatorModule,
    registryModule,
    longPacketModule,
  ] = await Promise.all([
    import('../modelSafetyExtractor'),
    import('../runTriage'),
    import('../modelAdjudicator'),
    import('../modelRegistry'),
    import('../longPacketModelPipeline'),
  ])
  const models = registryModule.resolveTriageModelRegistry()
  const packetScoringSources = new Map<string, string>()

  return {
    models,
    async runSafety(item) {
      if (item.input.kind === 'missing') {
        return {
          result: {
            carePathway: 'undetermined',
            dataQuality: 'insufficient',
            criticalUnknowns: [item.input.reason],
            signals: [],
          },
          inputTokens: null,
          outputTokens: null,
        }
      }
      if (item.input.kind === 'note') {
        let usage: BedrockTokenUsage = {}
        const result = await safetyModule.runModelSafetyExtractor(
          item.input.text,
          {
            model: models.safetyExtractor,
            onUsage: (observed) => {
              usage = observed
            },
          },
        )
        return {
          result,
          inputTokens: usage.inputTokens ?? null,
          outputTokens: usage.outputTokens ?? null,
        }
      }

      const plan = planLongPacketChunks(
        item.input.documents,
        item.input.chunkOptions,
      )
      const packet = await longPacketModule.runLongPacketModelPipeline(plan)
      packetScoringSources.set(
        item.id,
        JSON.stringify({
          narrative: packet.narrative,
          factsByCategory: packet.factsByCategory,
          conflicts: packet.conflicts,
        }),
      )
      return {
        result: {
          carePathway:
            packet.carePathway === 'routine_outpatient' ||
            packet.carePathway === 'expedited_outpatient' ||
            packet.carePathway === 'redirect'
              ? 'no_time_critical_signal'
              : packet.carePathway,
          dataQuality:
            packet.conflicts.length > 0
              ? 'conflicting'
              : packet.coverageStatus === 'complete'
                ? 'sufficient'
                : packet.coverageStatus === 'partial'
                  ? 'partial'
                  : 'insufficient',
          criticalUnknowns: [
            ...packet.criticalUnknowns.map((unknown) => unknown.text),
            ...packet.conflicts.map((conflict) => conflict.description),
          ],
          signals: packet.safetySignals,
        },
        inputTokens: null,
        outputTokens: null,
      }
    },
    async runScoring(item) {
      if (item.input.kind === 'missing') {
        throw new Error('Cannot score a referral without clinical text.')
      }
      const referralText =
        item.input.kind === 'packet'
          ? packetScoringSources.get(item.id)
          : item.input.text
      if (!referralText) {
        throw new Error(
          'Long-packet outpatient scoring requires the safety/map branch to complete first.',
        )
      }
      let usage: BedrockTokenUsage = {}
      const result = await scoringModule.runTriage(
        {
          referral_text: referralText,
          model: models.outpatientScorer,
        },
        {
          onUsage: (observed) => {
            usage = observed
          },
        },
      )
      const carePathway: CarePathway = result.emergent_override
        ? 'emergency_now'
        : result.insufficient_data
          ? 'undetermined'
          : result.redirect_to_non_neuro
            ? 'redirect'
            : ['urgent', 'semi_urgent'].includes(result.triage_tier)
              ? 'expedited_outpatient'
              : 'routine_outpatient'
      return {
        result: {
          carePathway,
          outpatientPriority: outpatientPriority(result.triage_tier),
          dataQuality: result.insufficient_data ? 'insufficient' : 'sufficient',
          reviewRequirement:
            carePathway === 'emergency_now'
              ? 'emergency_action'
              : carePathway === 'undetermined'
                ? 'immediate_clinician_review'
                : 'clinician_confirmation',
          schedulingLocked: true,
          weightedScore: result.weighted_score ?? 0,
          appliedFloors: [],
        },
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
      }
    },
    async runAdjudicator(item, context) {
      let usage: BedrockTokenUsage = {}
      const result = await adjudicatorModule.runTriageAdjudicator(
        packetSourceText(item),
        context,
        {
          model: models.adjudicator,
          onUsage: (observed) => {
            usage = observed
          },
        },
      )
      return {
        result,
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
      }
    },
  }
}

function deterministicGateway(item: SentinelCase): {
  gateway: Pick<EmergencyGatewayResult, 'status' | 'carePathway'> & {
    failureCode: string | null
  }
  signals: GatewaySignal[]
  telemetry: SentinelBranchTelemetry
} {
  const startedAt = performance.now()
  try {
    if (item.input.kind === 'missing') {
      return {
        gateway: {
          status: 'failed',
          carePathway: 'undetermined',
          failureCode: 'empty_input',
        },
        signals: [],
        telemetry: {
          branch: 'deterministic_gateway',
          executed: true,
          modelId: null,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: Math.max(0, performance.now() - startedAt),
          costUsd: 0,
          status: 'failed',
          reason: 'empty_input',
        },
      }
    }
    const result =
      item.input.kind === 'note'
        ? runEmergencyGateway(item.input.text)
        : scanLongPacketEmergency(
            planLongPacketChunks(
              item.input.documents,
              item.input.chunkOptions,
            ),
          )
    return {
      gateway: {
        status: result.status,
        carePathway: result.carePathway,
        failureCode: result.failureCode,
      },
      signals: result.signals,
      telemetry: {
        branch: 'deterministic_gateway',
        executed: true,
        modelId: null,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Math.max(0, performance.now() - startedAt),
        costUsd: 0,
        status: result.status === 'completed' ? 'complete' : 'failed',
        reason: result.failureCode,
      },
    }
  } catch (error) {
    return {
      gateway: {
        status: 'failed',
        carePathway: 'undetermined',
        failureCode: 'gateway_execution_failed',
      },
      signals: [],
      telemetry: {
        branch: 'deterministic_gateway',
        executed: true,
        modelId: null,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Math.max(0, performance.now() - startedAt),
        costUsd: 0,
        status: 'failed',
        reason:
          error instanceof Error ? error.message : 'gateway_execution_failed',
      },
    }
  }
}

function skippedTelemetry(
  branch: SentinelBranchTelemetry['branch'],
  modelId: string,
  reason: string,
): SentinelBranchTelemetry {
  return {
    branch,
    executed: false,
    modelId,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    costUsd: 0,
    status: 'skipped',
    reason,
  }
}

function invocationCost(
  modelId: string,
  invocation: Pick<
    SentinelLiveInvocation<unknown>,
    'inputTokens' | 'outputTokens'
  >,
  pricing: SentinelLiveOptions['pricing'],
): number | null {
  const price = pricing?.[modelId]
  if (
    !price ||
    invocation.inputTokens === null ||
    invocation.outputTokens === null
  ) {
    return null
  }
  return (
    (invocation.inputTokens * price.inputUsdPerMillion +
      invocation.outputTokens * price.outputUsdPerMillion) /
    1_000_000
  )
}

function pathwayClass(pathway: string): 'emergency' | 'same_day' | 'quiet' | 'hold' {
  if (pathway === 'emergency_now') return 'emergency'
  if (pathway === 'same_day_clinician_review') return 'same_day'
  if (pathway === 'undetermined') return 'hold'
  return 'quiet'
}

function completedBranchDisagreement(input: {
  gateway: ReturnType<typeof deterministicGateway>['gateway']
  safety: ClinicalBranch<ValidatedModelSafetyExtraction>
  scoring: ClinicalBranch<TriageDecisionState>
}): boolean {
  const classes: string[] = []
  if (input.gateway.status === 'completed') {
    classes.push(pathwayClass(input.gateway.carePathway))
  }
  if (input.safety.status === 'complete') {
    classes.push(pathwayClass(input.safety.result.carePathway))
  }
  if (input.scoring.status === 'complete') {
    classes.push(pathwayClass(input.scoring.result.carePathway))
  }
  return new Set(classes).size > 1
}

function scoringEmergencyOverrideFromError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const envelope = Reflect.get(error, 'emergencyEnvelope')
  return (
    typeof envelope === 'object' &&
    envelope !== null &&
    Reflect.get(envelope, 'emergentOverride') === true
  )
}

export async function runLiveSentinelCase(
  item: SentinelCase,
  options: SentinelLiveOptions,
  dependencies?: SentinelLiveDependencies,
): Promise<SentinelCaseOutcome> {
  assertLiveAllowed(options)
  const deps = dependencies ?? (await loadDefaultLiveDependencies())
  const deterministic = deterministicGateway(item)
  const branchTelemetry: SentinelBranchTelemetry[] = [deterministic.telemetry]

  let safetyBranch: ClinicalBranch<ValidatedModelSafetyExtraction> = {
    status: 'failed',
    reason: 'branch_not_selected',
  }
  if (options.branches.includes('safety')) {
    const startedAt = performance.now()
    try {
      const invocation = await deps.runSafety(item)
      safetyBranch = { status: 'complete', result: invocation.result }
      branchTelemetry.push({
        branch: 'safety_extractor',
        executed: true,
        modelId: deps.models.safetyExtractor,
        inputTokens: invocation.inputTokens,
        outputTokens: invocation.outputTokens,
        latencyMs: Math.max(0, performance.now() - startedAt),
        costUsd: invocationCost(
          deps.models.safetyExtractor,
          invocation,
          options.pricing,
        ),
        status: 'complete',
        reason: null,
      })
    } catch (error) {
      safetyBranch = {
        status: 'failed',
        reason:
          error instanceof Error ? error.message : 'safety_branch_failed',
      }
      branchTelemetry.push({
        branch: 'safety_extractor',
        executed: true,
        modelId: deps.models.safetyExtractor,
        inputTokens: null,
        outputTokens: null,
        latencyMs: Math.max(0, performance.now() - startedAt),
        costUsd: null,
        status: 'failed',
        reason: safetyBranch.reason,
      })
    }
  } else {
    branchTelemetry.push(
      skippedTelemetry(
        'safety_extractor',
        deps.models.safetyExtractor,
        'branch_not_selected',
      ),
    )
  }

  let scoringBranch: ClinicalBranch<TriageDecisionState> = {
    status: 'failed',
    reason: 'branch_not_selected',
  }
  let scoringEmergencyOverride = false
  if (options.branches.includes('scoring')) {
    const startedAt = performance.now()
    try {
      const invocation = await deps.runScoring(item)
      scoringBranch = { status: 'complete', result: invocation.result }
      branchTelemetry.push({
        branch: 'outpatient_scorer',
        executed: true,
        modelId: deps.models.outpatientScorer,
        inputTokens: invocation.inputTokens,
        outputTokens: invocation.outputTokens,
        latencyMs: Math.max(0, performance.now() - startedAt),
        costUsd: invocationCost(
          deps.models.outpatientScorer,
          invocation,
          options.pricing,
        ),
        status: 'complete',
        reason: null,
      })
    } catch (error) {
      scoringEmergencyOverride = scoringEmergencyOverrideFromError(error)
      scoringBranch = {
        status: 'failed',
        reason:
          error instanceof Error ? error.message : 'scoring_branch_failed',
      }
      branchTelemetry.push({
        branch: 'outpatient_scorer',
        executed: true,
        modelId: deps.models.outpatientScorer,
        inputTokens: null,
        outputTokens: null,
        latencyMs: Math.max(0, performance.now() - startedAt),
        costUsd: null,
        status: 'failed',
        reason: scoringBranch.reason,
      })
    }
  } else {
    branchTelemetry.push(
      skippedTelemetry(
        'outpatient_scorer',
        deps.models.outpatientScorer,
        'branch_not_selected',
      ),
    )
  }

  let fused = fuseTriageBranches({
    gateway: deterministic.gateway,
    safetyBranch,
    scoringBranch,
    scoringEmergencyOverride,
  })
  const disagreement = completedBranchDisagreement({
    gateway: deterministic.gateway,
    safety: safetyBranch,
    scoring: scoringBranch,
  })
  const criticalUnknownCount =
    safetyBranch.status === 'complete'
      ? safetyBranch.result.criticalUnknowns.length
      : 0
  const sparseAdjudicationRequired = shouldInvokeSparseAdjudicator({
    disagreement,
    criticalUnknownCount,
  })

  if (
    options.branches.includes('adjudicator') &&
    sparseAdjudicationRequired
  ) {
    const startedAt = performance.now()
    try {
      const invocation = await deps.runAdjudicator(item, {
        deterministicPathway: deterministic.gateway.carePathway,
        safetyModelPathway:
          safetyBranch.status === 'complete'
            ? safetyBranch.result.carePathway
            : safetyBranch.status,
        scoringPathway:
          scoringEmergencyOverride
            ? 'emergency_now'
            : scoringBranch.status === 'complete'
              ? scoringBranch.result.carePathway
              : scoringBranch.status,
        fusionReasons: fused.reasons,
      })
      fused = applyAdjudicatorDecision(fused, invocation.result)
      branchTelemetry.push({
        branch: 'adjudicator',
        executed: true,
        modelId: deps.models.adjudicator,
        inputTokens: invocation.inputTokens,
        outputTokens: invocation.outputTokens,
        latencyMs: Math.max(0, performance.now() - startedAt),
        costUsd: invocationCost(
          deps.models.adjudicator,
          invocation,
          options.pricing,
        ),
        status: 'complete',
        reason: null,
      })
    } catch (error) {
      branchTelemetry.push({
        branch: 'adjudicator',
        executed: true,
        modelId: deps.models.adjudicator,
        inputTokens: null,
        outputTokens: null,
        latencyMs: Math.max(0, performance.now() - startedAt),
        costUsd: null,
        status: 'failed',
        reason:
          error instanceof Error ? error.message : 'adjudicator_failed',
      })
    }
  } else {
    branchTelemetry.push(
      skippedTelemetry(
        'adjudicator',
        deps.models.adjudicator,
        options.branches.includes('adjudicator')
          ? 'sparse_policy_not_triggered'
          : 'branch_not_selected',
      ),
    )
  }

  const safetySignals =
    safetyBranch.status === 'complete' ? safetyBranch.result.signals : []
  const signals = [...deterministic.signals, ...safetySignals]
  const evidenceValidation = validateSentinelEvidence(signals, item.input)
  const disposition = classifySentinelDisposition(
    item.expected,
    fused.carePathway,
  )
  const requiredSyndromesPresent = item.expected.requiredSyndromes.every(
    (syndrome) => signals.some((signal) => signal.syndrome === syndrome),
  )
  const forbiddenSyndromesAbsent = (
    item.expected.forbiddenSyndromes ?? []
  ).every(
    (syndrome) => !signals.some((signal) => signal.syndrome === syndrome),
  )

  return {
    caseId: item.id,
    title: item.title,
    syndrome: item.syndrome,
    tags: item.tags,
    hardNegative: item.hardNegative,
    expectedClinicalClass: item.expected.clinicalClass,
    offlineRequired: item.executionModes.includes('offline_deterministic'),
    evaluated: true,
    unevaluatedReason: null,
    expectedPathway: item.expected.pathway,
    acceptablePathways: item.expected.acceptablePathways,
    actualPathway: fused.carePathway,
    exactOrAcceptable:
      disposition.exactOrAcceptable &&
      requiredSyndromesPresent &&
      forbiddenSyndromesAbsent &&
      evidenceValidation.invalidReferences === 0,
    underTriaged: disposition.underTriaged,
    overTriaged: disposition.overTriaged,
    manualHold: disposition.manualHold,
    alertRaised: disposition.alertRaised,
    signals,
    evidenceValidation,
    branchTelemetry,
  }
}

// Kept as an explicit compile-time marker in reports/debugging without importing
// any model code at module load time.
export const SENTINEL_LIVE_DETERMINISTIC_GATEWAY_VERSION =
  EMERGENCY_GATEWAY_VERSION
