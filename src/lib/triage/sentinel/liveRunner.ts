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
import { deriveClinicalTiming, type ClinicalTimingV1 } from '../clinicalTiming'
import { buildLongPacketAdjudicationText, longPacketPipelineToPersistedClinicalExtraction, safetyArtifactsFromValidatedPipeline } from '../longPacketIngestion'

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

/**
 * Review-only scorer fields retained in a live sentinel outcome. They exclude
 * the referral/source text so reports can inspect model behavior without
 * re-emitting the evaluated packet.
 */
export interface SentinelScoringMetadata {
  tier: string
  dimensionRatings: Record<string, number>
  suggestedWorkup: string[]
  subspecialtyRecommendation: string
  redirectDestination: string | null
}

type SentinelScoringState = TriageDecisionState & {
  sentinelMetadata?: SentinelScoringMetadata
}

export interface SentinelLiveDependencies {
  models: TriageModelRegistry
  runSafety: (
    item: SentinelCase,
  ) => Promise<SentinelLiveInvocation<ValidatedModelSafetyExtraction>>
  runScoring: (
    item: SentinelCase,
    context: { decisionAt: string; chronologySourceText: string },
  ) => Promise<SentinelLiveInvocation<SentinelScoringState>>
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
  const packetBoundedRepresentations = new Map<string, string>()

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
      const gateway = scanLongPacketEmergency(plan)
      const safetyArtifacts = safetyArtifactsFromValidatedPipeline({
        pages: item.input.documents.flatMap(document => document.pages.map(page => ({ ...page, documentId: document.documentId }))),
        gateway, pipeline: packet,
      })
      const safetyResult = safetyArtifacts.safetyResult
      const clinical = longPacketPipelineToPersistedClinicalExtraction({ pipeline: packet, deterministicGateway: gateway })
      const bounded = buildLongPacketAdjudicationText({
        extractedSummary: clinical.extractedSummary, safetyArtifacts,
      })
      packetBoundedRepresentations.set(item.id, bounded)
      return {
        result: {
          ...safetyResult,
        },
        inputTokens: null,
        outputTokens: null,
      }
    },
    async runScoring(item, context) {
      if (item.input.kind === 'missing') {
        throw new Error('Cannot score a referral without clinical text.')
      }
      const referralText =
        item.input.kind === 'packet'
          ? packetBoundedRepresentations.get(item.id)
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
          decisionAt: context.decisionAt,
          chronologySourceText: context.chronologySourceText,
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
          sentinelMetadata: {
            tier: result.triage_tier,
            dimensionRatings: Object.fromEntries(
              Object.entries(result.dimension_scores).map(([dimension, value]) => [
                dimension,
                value.score,
              ]),
            ),
            suggestedWorkup: result.suggested_workup,
            subspecialtyRecommendation: result.subspecialty_recommendation,
            redirectDestination: result.redirect_to_non_neuro
              ? result.redirect_specialty
              : null,
          },
        },
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
      }
    },
    async runAdjudicator(item, context) {
      let usage: BedrockTokenUsage = {}
      const result = await adjudicatorModule.runTriageAdjudicator(
        item.input.kind === 'packet'
          ? packetBoundedRepresentations.get(item.id) ?? (() => { throw new Error('Long-packet adjudication requires the validated safety/map branch to complete first.') })()
          : packetSourceText(item),
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

function deterministicGateway(item: SentinelCase, decisionAt: string): {
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
        ? runEmergencyGateway(item.input.text, {
            decisionAsOf: decisionAt.slice(0, 10),
          })
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

function rawChronologySource(item: SentinelCase): string {
  return packetSourceText(item)
}

function timingMetadata(timing: ClinicalTimingV1): SentinelCaseOutcome['timingMetadata'] {
  return {
    sourceDigest: timing.sourceDigest,
    decisionAt: timing.decisionAt,
    decisionTimeZone: timing.decisionTimeZone,
    chronology: {
      onset: timing.chronology.onset.state,
      lastVerifiedStatus: timing.chronology.lastVerifiedStatus.state,
      completedAssessment: timing.chronology.completedAssessment.state,
    },
    actionRequirement: timing.action.requirement,
    assessmentDeadlineState: timing.assessmentDeadline.state,
    issues: timing.issues,
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
  const decisionAt = item.decisionAt ?? new Date().toISOString()
  const chronologySourceText = rawChronologySource(item)
  const deterministic = deterministicGateway(item, decisionAt)
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

  let scoringBranch: ClinicalBranch<SentinelScoringState> = {
    status: 'failed',
    reason: 'branch_not_selected',
  }
  let scoringEmergencyOverride = false
  if (options.branches.includes('scoring')) {
    const startedAt = performance.now()
    try {
      const invocation = await deps.runScoring(item, {
        decisionAt,
        chronologySourceText,
      })
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
  if (options.branches.includes('adjudicator') && fused.adjudicationRequired) {
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
          ? 'fusion_policy_not_triggered'
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
  const timing = deriveClinicalTiming({
    sourceText: chronologySourceText,
    decisionAt,
    decisionTimeZone: 'UTC',
    carePathway: fused.carePathway,
    reviewRequirement: fused.reviewRequirement,
  })

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
    scoringMetadata:
      scoringBranch.status === 'complete'
        ? scoringBranch.result.sentinelMetadata ?? null
        : null,
    timingMetadata: timingMetadata(timing),
  }
}

// Kept as an explicit compile-time marker in reports/debugging without importing
// any model code at module load time.
export const SENTINEL_LIVE_DETERMINISTIC_GATEWAY_VERSION =
  EMERGENCY_GATEWAY_VERSION
