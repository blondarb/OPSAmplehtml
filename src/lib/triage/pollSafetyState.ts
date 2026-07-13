import { MODEL_SAFETY_EVIDENCE_PERSISTENCE_FAILED_REASON } from './longPacketSafetyPersistenceFailure'

export type GovernedTriageStartSafetyPathway =
  | 'emergency_now'
  | 'same_day_clinician_review'

export interface PollSafetyNotice {
  safetyPathway?: GovernedTriageStartSafetyPathway
  immediateActionRequired: boolean
  outpatientScoringBlocked: boolean
  humanReviewRequired: boolean
  schedulingLocked: boolean
  safetyWorkflowId?: string
  safetyWorkflowIdentityConflict?: boolean
  holdReason?: string
}

export type PollSafetyOutcome =
  | 'none'
  | 'valid_safety'
  | 'local_failure_hold'
  | 'pathway_conflict'
  | 'identity_conflict'

export interface StrictPollSafetyState {
  readonly outcome: PollSafetyOutcome
  readonly workflowId?: string
  readonly notice: Readonly<PollSafetyNotice> | null
}

export interface PollSafetyObservation {
  readonly payload: unknown
  readonly trustRemoteSafety: boolean
  readonly localFailureReason?: string
}

export const SAFETY_WORKFLOW_IDENTITY_CONFLICT_REASON =
  'safety_workflow_identity_conflict_manual_hold'
export const MODEL_SAFETY_WORKFLOW_PERSISTENCE_FAILED_REASON =
  'model_safety_workflow_persistence_failed'
export const SOURCE_SAFETY_WORKFLOW_UNAVAILABLE_REASON =
  'source_safety_workflow_unavailable_manual_hold'
export const SOURCE_SAFETY_WORKFLOW_INCONSISTENT_REASON =
  'source_safety_workflow_inconsistent_manual_hold'
export const SAFETY_PATHWAY_PROJECTION_CONFLICT_REASON =
  'safety_pathway_projection_conflict_manual_hold'

export type SafetyWorkflowIdentitySuppressionReason =
  | typeof MODEL_SAFETY_WORKFLOW_PERSISTENCE_FAILED_REASON
  | typeof MODEL_SAFETY_EVIDENCE_PERSISTENCE_FAILED_REASON
  | typeof SOURCE_SAFETY_WORKFLOW_UNAVAILABLE_REASON
  | typeof SOURCE_SAFETY_WORKFLOW_INCONSISTENT_REASON

const SAFETY_WORKFLOW_IDENTITY_SUPPRESSION_REASONS = new Set<string>([
  MODEL_SAFETY_WORKFLOW_PERSISTENCE_FAILED_REASON,
  MODEL_SAFETY_EVIDENCE_PERSISTENCE_FAILED_REASON,
  SOURCE_SAFETY_WORKFLOW_UNAVAILABLE_REASON,
  SOURCE_SAFETY_WORKFLOW_INCONSISTENT_REASON,
])

export function asSafetyWorkflowIdentitySuppressionReason(
  value: unknown,
): SafetyWorkflowIdentitySuppressionReason | undefined {
  return typeof value === 'string' &&
    SAFETY_WORKFLOW_IDENTITY_SUPPRESSION_REASONS.has(value)
    ? (value as SafetyWorkflowIdentitySuppressionReason)
    : undefined
}

const CARE_PATHWAYS = [
  'routine_outpatient',
  'undetermined',
  'same_day_clinician_review',
  'emergency_now',
] as const

type CarePathway = (typeof CARE_PATHWAYS)[number]

const OUTCOME_RANK: Readonly<Record<PollSafetyOutcome, number>> = {
  none: 0,
  valid_safety: 1,
  local_failure_hold: 2,
  pathway_conflict: 3,
  identity_conflict: 4,
}

const EMPTY_POLL_SAFETY_STATE: StrictPollSafetyState = Object.freeze({
  outcome: 'none',
  notice: null,
})

export function initialPollSafetyState(): StrictPollSafetyState {
  return EMPTY_POLL_SAFETY_STATE
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(record: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field)
}

function safetyWorkflowIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    value === value.trim() &&
    /^[A-Za-z0-9][A-Za-z0-9_:-]*$/.test(value)
    ? value
    : undefined
}

function parseWorkflowAliases(record: Record<string, unknown>): {
  readonly id?: string
  readonly conflict: boolean
} {
  const values: string[] = []
  for (const field of [
    'safety_triage_session_id',
    'safety_workflow_id',
  ] as const) {
    const value = record[field]
    if (value === undefined || value === null) continue
    const id = safetyWorkflowIdentifier(value)
    if (!id) return { conflict: true }
    values.push(id)
  }

  const unique = [...new Set(values)]
  if (unique.length > 1) return { conflict: true }
  return unique.length === 1
    ? { id: unique[0], conflict: false }
    : { conflict: false }
}

type PathwayProjection =
  | { readonly kind: 'absent' }
  | { readonly kind: 'malformed' }
  | { readonly kind: 'valid'; readonly value: CarePathway }

function parsePathwayProjection(
  record: Record<string, unknown>,
  field: string,
): PathwayProjection {
  if (!hasOwn(record, field)) return { kind: 'absent' }
  const value = record[field]
  if (value === undefined || value === null) return { kind: 'absent' }
  return typeof value === 'string' &&
    CARE_PATHWAYS.includes(value as CarePathway)
    ? { kind: 'valid', value: value as CarePathway }
    : { kind: 'malformed' }
}

function pathwayRank(pathway: CarePathway): number {
  switch (pathway) {
    case 'emergency_now':
      return 3
    case 'same_day_clinician_review':
      return 2
    case 'undetermined':
      return 1
    case 'routine_outpatient':
      return 0
  }
}

function strongestCarePathway(
  projections: readonly PathwayProjection[],
): CarePathway | undefined {
  return projections
    .filter(
      (projection): projection is Extract<PathwayProjection, { kind: 'valid' }> =>
        projection.kind === 'valid',
    )
    .map((projection) => projection.value)
    .sort((left, right) => pathwayRank(right) - pathwayRank(left))[0]
}

function governedPathway(
  pathway: CarePathway | undefined,
): GovernedTriageStartSafetyPathway | undefined {
  return pathway === 'emergency_now' ||
    pathway === 'same_day_clinician_review'
    ? pathway
    : undefined
}

function strongestGovernedPathway(
  left: GovernedTriageStartSafetyPathway | undefined,
  right: GovernedTriageStartSafetyPathway | undefined,
): GovernedTriageStartSafetyPathway | undefined {
  if (left === 'emergency_now' || right === 'emergency_now') {
    return 'emergency_now'
  }
  return left ?? right
}

function hasExplicitSafetyReview(record: Record<string, unknown>): boolean {
  return [record.review_requirement, record.reviewRequirement].some(
    (value) =>
      value === 'emergency_action' ||
      value === 'immediate_clinician_review',
  )
}

interface RemoteSafetyProjection {
  readonly workflowId?: string
  readonly workflowIdentityConflict: boolean
  readonly workflowIdentitySuppressed: boolean
  readonly workflowIdentitySuppressionReason?: SafetyWorkflowIdentitySuppressionReason
  readonly pathway?: GovernedTriageStartSafetyPathway
  readonly pathwayConflict: boolean
  readonly hasSafety: boolean
  readonly immediateActionRequired: boolean
  readonly outpatientScoringBlocked: boolean
}

function parseRemoteSafety(
  payload: unknown,
  previousWorkflowId: string | undefined,
): RemoteSafetyProjection {
  if (!isRecord(payload)) {
    return {
      workflowIdentityConflict: false,
      workflowIdentitySuppressed: false,
      pathwayConflict: false,
      hasSafety: false,
      immediateActionRequired: false,
      outpatientScoringBlocked: false,
    }
  }

  const aliases = parseWorkflowAliases(payload)
  const workflowIdentitySuppressionReason =
    asSafetyWorkflowIdentitySuppressionReason(payload.reason)
  const recoveredPersistedWorkflow = Boolean(
    (workflowIdentitySuppressionReason ===
      MODEL_SAFETY_WORKFLOW_PERSISTENCE_FAILED_REASON ||
      workflowIdentitySuppressionReason ===
        MODEL_SAFETY_EVIDENCE_PERSISTENCE_FAILED_REASON) &&
      aliases.id &&
      !aliases.conflict,
  )
  const workflowIdentitySuppressed =
    workflowIdentitySuppressionReason !== undefined &&
    !recoveredPersistedWorkflow
  const workflowIdentityConflict = Boolean(
    aliases.conflict ||
      (!workflowIdentitySuppressed &&
        aliases.id &&
        previousWorkflowId &&
        aliases.id !== previousWorkflowId),
  )
  const workflowId =
    workflowIdentityConflict || workflowIdentitySuppressed
      ? undefined
      : (aliases.id ?? previousWorkflowId)

  const topLevelPathway = parsePathwayProjection(payload, 'safety_pathway')
  let nestedPathway: PathwayProjection = { kind: 'absent' }
  let packetSafety: Record<string, unknown> | null = null
  let malformedPacketSafety = false
  if (hasOwn(payload, 'packet_safety')) {
    if (isRecord(payload.packet_safety)) {
      packetSafety = payload.packet_safety
      nestedPathway = parsePathwayProjection(packetSafety, 'care_pathway')
    } else {
      malformedPacketSafety = true
      nestedPathway = { kind: 'malformed' }
    }
  }

  const validPathwayValues = [topLevelPathway, nestedPathway]
    .filter(
      (projection): projection is Extract<PathwayProjection, { kind: 'valid' }> =>
        projection.kind === 'valid',
    )
    .map((projection) => projection.value)
  const pathwayConflict = Boolean(
    malformedPacketSafety ||
      topLevelPathway.kind === 'malformed' ||
      nestedPathway.kind === 'malformed' ||
      new Set(validPathwayValues).size > 1,
  )
  const pathway = governedPathway(
    strongestCarePathway([topLevelPathway, nestedPathway]),
  )

  const safetyReview = isRecord(payload.safety_review)
    ? payload.safety_review
    : null
  const explicitSafetyReview = Boolean(
    hasExplicitSafetyReview(payload) ||
      (packetSafety && hasExplicitSafetyReview(packetSafety)) ||
      (safetyReview && hasExplicitSafetyReview(safetyReview)),
  )
  const immediateActionRequired = Boolean(
    pathway ||
      payload.immediate_action_required === true ||
      payload.immediate_review_required === true,
  )
  const clinicianHold = packetSafety?.clinician_hold === true
  const outpatientScoringBlocked =
    payload.outpatient_scoring_blocked === true
  const hasSafety = Boolean(
    pathway ||
      immediateActionRequired ||
      clinicianHold ||
      payload.human_review_required === true ||
      outpatientScoringBlocked ||
      explicitSafetyReview,
  )

  return {
    ...(workflowId ? { workflowId } : {}),
    workflowIdentityConflict,
    workflowIdentitySuppressed,
    ...(workflowIdentitySuppressionReason
      ? { workflowIdentitySuppressionReason }
      : {}),
    ...(pathway ? { pathway } : {}),
    pathwayConflict,
    hasSafety,
    immediateActionRequired,
    outpatientScoringBlocked,
  }
}

function strongerOutcome(
  previous: PollSafetyOutcome,
  candidate: PollSafetyOutcome,
): PollSafetyOutcome {
  return OUTCOME_RANK[candidate] > OUTCOME_RANK[previous]
    ? candidate
    : previous
}

function noticeEquals(
  left: Readonly<PollSafetyNotice> | null,
  right: Readonly<PollSafetyNotice> | null,
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  return (
    left.safetyPathway === right.safetyPathway &&
    left.immediateActionRequired === right.immediateActionRequired &&
    left.outpatientScoringBlocked === right.outpatientScoringBlocked &&
    left.humanReviewRequired === right.humanReviewRequired &&
    left.schedulingLocked === right.schedulingLocked &&
    left.safetyWorkflowId === right.safetyWorkflowId &&
    left.safetyWorkflowIdentityConflict ===
      right.safetyWorkflowIdentityConflict &&
    left.holdReason === right.holdReason
  )
}

export function reducePollSafetyState(
  previous: StrictPollSafetyState,
  observation: PollSafetyObservation,
): StrictPollSafetyState {
  const remote = observation.trustRemoteSafety
    ? parseRemoteSafety(observation.payload, previous.workflowId)
    : {
        workflowId: previous.workflowId,
        workflowIdentityConflict: false,
        workflowIdentitySuppressed: false,
        pathwayConflict: false,
        hasSafety: false,
        immediateActionRequired: false,
        outpatientScoringBlocked: false,
      }

  const localFailureReason =
    remote.workflowIdentitySuppressionReason ??
    observation.localFailureReason
  const candidateOutcome: PollSafetyOutcome = remote.workflowIdentityConflict
    ? 'identity_conflict'
    : remote.workflowIdentitySuppressed
      ? 'local_failure_hold'
      : remote.pathwayConflict
        ? 'pathway_conflict'
        : localFailureReason
          ? 'local_failure_hold'
          : remote.hasSafety
            ? 'valid_safety'
            : 'none'
  const outcome = strongerOutcome(previous.outcome, candidateOutcome)
  const pathwayConflictIdentityFrozen =
    previous.outcome === 'pathway_conflict' &&
    outcome === 'pathway_conflict'
  const workflowId =
    outcome === 'identity_conflict'
      ? undefined
      : remote.workflowIdentitySuppressed
        ? undefined
        : pathwayConflictIdentityFrozen
          ? previous.workflowId
          : (remote.workflowId ?? previous.workflowId)
  const pathway = strongestGovernedPathway(
    previous.notice?.safetyPathway,
    remote.pathway,
  )
  const forcedHold =
    outcome === 'identity_conflict' ||
    outcome === 'pathway_conflict' ||
    outcome === 'local_failure_hold'

  const holdReason =
    outcome === 'identity_conflict'
      ? SAFETY_WORKFLOW_IDENTITY_CONFLICT_REASON
      : remote.workflowIdentitySuppressionReason ??
        (outcome === 'pathway_conflict'
          ? SAFETY_PATHWAY_PROJECTION_CONFLICT_REASON
          : outcome === 'local_failure_hold'
            ? (localFailureReason ?? previous.notice?.holdReason)
            : undefined)

  const notice: Readonly<PollSafetyNotice> | null =
    outcome === 'none'
      ? null
      : Object.freeze({
          ...(pathway ? { safetyPathway: pathway } : {}),
          immediateActionRequired: Boolean(
            previous.notice?.immediateActionRequired ||
              remote.immediateActionRequired ||
              pathway,
          ),
          outpatientScoringBlocked: Boolean(
            forcedHold ||
              previous.notice?.outpatientScoringBlocked ||
              remote.outpatientScoringBlocked,
          ),
          humanReviewRequired: true,
          schedulingLocked: true,
          ...(workflowId ? { safetyWorkflowId: workflowId } : {}),
          ...(outcome === 'identity_conflict'
            ? { safetyWorkflowIdentityConflict: true }
            : {}),
          ...(holdReason ? { holdReason } : {}),
        })

  if (
    previous.outcome === outcome &&
    previous.workflowId === workflowId &&
    noticeEquals(previous.notice, notice)
  ) {
    return previous
  }

  return Object.freeze({
    outcome,
    ...(workflowId ? { workflowId } : {}),
    notice,
  })
}

export function isPollSafetyConflict(
  state: StrictPollSafetyState,
): boolean {
  return (
    state.outcome === 'identity_conflict' ||
    state.outcome === 'pathway_conflict'
  )
}
