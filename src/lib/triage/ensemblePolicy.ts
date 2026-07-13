import type { EmergencyGatewayResult } from './emergencyGateway'
import type { ValidatedModelSafetyExtraction } from './modelSafetyExtraction'
import type {
  CarePathway,
  DataQuality,
  OutpatientTriageTier,
  ReviewRequirement,
  TriageDecisionState,
} from './types'

export type ClinicalBranch<T> =
  | { status: 'complete'; result: T }
  | {
      status: 'failed' | 'invalid' | 'timeout'
      reason: string
    }

export interface EnsembleFusionInput {
  gateway: Pick<EmergencyGatewayResult, 'status' | 'carePathway'> & {
    failureCode: string | null
  }
  safetyBranch: ClinicalBranch<ValidatedModelSafetyExtraction>
  scoringBranch: ClinicalBranch<TriageDecisionState>
  /** Monotonic high-stakes marker extracted before full scorer validation. */
  scoringEmergencyOverride?: boolean
}

export interface EnsembleFusionDecision {
  carePathway: CarePathway
  outpatientPriority: OutpatientTriageTier | null
  dataQuality: DataQuality
  reviewRequirement: ReviewRequirement
  schedulingLocked: true
  adjudicationRequired: boolean
  reasons: string[]
}

export interface AdjudicatorDecision {
  carePathway: CarePathway
  rationale: string
}

const PATHWAY_RANK: Record<CarePathway, number> = {
  emergency_now: 0,
  same_day_clinician_review: 1,
  undetermined: 2,
  expedited_outpatient: 3,
  routine_outpatient: 4,
  redirect: 5,
}

const QUALITY_RANK: Record<DataQuality, number> = {
  sufficient: 0,
  partial: 1,
  insufficient: 2,
  conflicting: 3,
}

function moreConservativeQuality(a: DataQuality, b: DataQuality): DataQuality {
  return QUALITY_RANK[a] >= QUALITY_RANK[b] ? a : b
}

function moreUrgentOrConservativePathway(
  current: CarePathway,
  proposed: CarePathway,
): CarePathway {
  return PATHWAY_RANK[proposed] < PATHWAY_RANK[current]
    ? proposed
    : current
}

function reviewForPathway(
  pathway: CarePathway,
  fallback: ReviewRequirement,
): ReviewRequirement {
  if (pathway === 'emergency_now') return 'emergency_action'
  if (
    pathway === 'same_day_clinician_review' ||
    pathway === 'undetermined'
  ) {
    return 'immediate_clinician_review'
  }
  return fallback
}

function gatewayTimeCriticalClass(
  gateway: EnsembleFusionInput['gateway'],
): 'emergency' | 'same_day' | 'quiet' | 'failed' {
  if (gateway.status === 'failed' || gateway.carePathway === 'undetermined') {
    return 'failed'
  }
  if (gateway.carePathway === 'emergency_now') return 'emergency'
  if (gateway.carePathway === 'same_day_clinician_review') return 'same_day'
  return 'quiet'
}

function safetyTimeCriticalClass(
  safety: ValidatedModelSafetyExtraction,
): 'emergency' | 'same_day' | 'quiet' | 'failed' {
  if (safety.carePathway === 'emergency_now') return 'emergency'
  if (safety.carePathway === 'same_day_clinician_review') return 'same_day'
  if (safety.carePathway === 'undetermined') return 'failed'
  return 'quiet'
}

export function fuseTriageBranches(
  input: EnsembleFusionInput,
): EnsembleFusionDecision {
  const reasons: string[] = []
  const scoring =
    input.scoringBranch.status === 'complete'
      ? input.scoringBranch.result
      : null
  let carePathway: CarePathway = scoring?.carePathway ?? 'undetermined'
  let dataQuality: DataQuality = scoring?.dataQuality ?? 'insufficient'
  let adjudicationRequired = false

  if (input.scoringEmergencyOverride === true) {
    carePathway = 'emergency_now'
    reasons.push('scoring_emergency_override')
  }

  const gatewayClass = gatewayTimeCriticalClass(input.gateway)
  if (gatewayClass === 'failed') {
    carePathway = moreUrgentOrConservativePathway(
      carePathway,
      'undetermined',
    )
    dataQuality = moreConservativeQuality(dataQuality, 'insufficient')
    reasons.push(
      `deterministic_gateway_${input.gateway.failureCode ?? 'undetermined'}`,
    )
    adjudicationRequired = true
  } else if (gatewayClass === 'emergency') {
    carePathway = 'emergency_now'
    reasons.push('deterministic_emergency_gateway')
  } else if (gatewayClass === 'same_day') {
    carePathway = moreUrgentOrConservativePathway(
      carePathway,
      'same_day_clinician_review',
    )
    reasons.push('deterministic_same_day_gateway')
  }

  let safetyClass: ReturnType<typeof safetyTimeCriticalClass> = 'failed'
  if (input.safetyBranch.status !== 'complete') {
    if (carePathway !== 'emergency_now' && carePathway !== 'same_day_clinician_review') {
      carePathway = 'undetermined'
    }
    dataQuality = moreConservativeQuality(dataQuality, 'insufficient')
    reasons.push(`safety_branch_${input.safetyBranch.status}`)
    adjudicationRequired = true
  } else {
    const safety = input.safetyBranch.result
    safetyClass = safetyTimeCriticalClass(safety)
    dataQuality = moreConservativeQuality(dataQuality, safety.dataQuality)
    if (safetyClass === 'emergency') {
      carePathway = 'emergency_now'
      reasons.push('safety_model_emergency')
    } else if (safetyClass === 'same_day') {
      carePathway = moreUrgentOrConservativePathway(
        carePathway,
        'same_day_clinician_review',
      )
      reasons.push('safety_model_same_day')
    } else if (safetyClass === 'failed') {
      if (carePathway !== 'emergency_now' && carePathway !== 'same_day_clinician_review') {
        carePathway = 'undetermined'
      }
      dataQuality = moreConservativeQuality(dataQuality, 'insufficient')
      reasons.push('safety_model_undetermined')
      adjudicationRequired = true
    }

    if (
      gatewayClass !== 'failed' &&
      gatewayClass !== safetyClass
    ) {
      reasons.push('safety_branch_disagreement')
      adjudicationRequired = true
    }
  }

  if (input.scoringBranch.status !== 'complete') {
    if (carePathway !== 'emergency_now' && carePathway !== 'same_day_clinician_review') {
      carePathway = 'undetermined'
    }
    dataQuality = moreConservativeQuality(dataQuality, 'insufficient')
    reasons.push(`scoring_branch_${input.scoringBranch.status}`)
    adjudicationRequired = true
  } else {
    const scorerTimeCritical =
      scoring?.carePathway === 'emergency_now'
        ? 'emergency'
        : scoring?.carePathway === 'same_day_clinician_review'
          ? 'same_day'
          : scoring?.carePathway === 'undetermined'
            ? 'failed'
            : 'quiet'
    if (
      input.safetyBranch.status === 'complete' &&
      scorerTimeCritical !== safetyClass
    ) {
      reasons.push('model_branch_disagreement')
      adjudicationRequired = true
    }
  }

  const fallbackReview = scoring?.reviewRequirement ?? 'immediate_clinician_review'
  return {
    carePathway,
    outpatientPriority: scoring?.outpatientPriority ?? null,
    dataQuality,
    reviewRequirement: reviewForPathway(carePathway, fallbackReview),
    schedulingLocked: true,
    adjudicationRequired,
    reasons: [...new Set(reasons)],
  }
}

export function applyAdjudicatorDecision(
  fused: EnsembleFusionDecision,
  adjudicator: AdjudicatorDecision,
): EnsembleFusionDecision {
  const nextPathway = moreUrgentOrConservativePathway(
    fused.carePathway,
    adjudicator.carePathway,
  )
  const downgradeRejected = nextPathway !== adjudicator.carePathway
  return {
    ...fused,
    carePathway: nextPathway,
    reviewRequirement: reviewForPathway(
      nextPathway,
      fused.reviewRequirement,
    ),
    schedulingLocked: true,
    reasons: [
      ...fused.reasons,
      downgradeRejected
        ? 'adjudicator_downgrade_rejected'
        : 'adjudicator_escalation_applied',
    ],
  }
}
