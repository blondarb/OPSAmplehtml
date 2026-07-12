import { getPool } from '@/lib/db'
import type { EmergencyGatewayResult } from './emergencyGateway'
import type { CarePathway, DataQuality, ReviewRequirement } from './types'

export type PersistableEmergencyGatewayResult = Omit<
  EmergencyGatewayResult,
  'failureCode' | 'version'
> & {
  failureCode: string | null
  version: string
}

const DATA_QUALITY_SAFETY_RANK: Record<DataQuality, number> = {
  sufficient: 0,
  partial: 1,
  insufficient: 2,
  conflicting: 3,
}

type FlatSafetySnapshot = Record<string, unknown>

const FLAT_SAFETY_KEYS = [
  'modelSafety',
  'modelSafetyFailure',
  'outpatientScoring',
  'fusion',
  'adjudicator',
  'adjudicatorFailure',
  'persistedCarePathwayFloor',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDeterministicGateway(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.status === 'string' &&
    typeof value.carePathway === 'string'
  )
}

function collectFlatSafetySnapshot(
  value: unknown,
  output: FlatSafetySnapshot,
  seen: Set<object>,
  depth: number,
) {
  if (!isRecord(value) || depth > 12 || seen.has(value)) return
  seen.add(value)

  collectFlatSafetySnapshot(
    value.priorSafetyState,
    output,
    seen,
    depth + 1,
  )

  if (isDeterministicGateway(value)) {
    output.deterministicGateway = value
  }

  for (const candidate of [
    value.deterministicGateway,
    value.deterministicIngressGateway,
  ]) {
    if (isDeterministicGateway(candidate)) {
      output.deterministicGateway = candidate
    } else {
      collectFlatSafetySnapshot(candidate, output, seen, depth + 1)
    }
  }

  for (const key of FLAT_SAFETY_KEYS) {
    if (
      Object.prototype.hasOwnProperty.call(value, key) &&
      value[key] !== undefined
    ) {
      output[key] = value[key]
    }
  }
}

export function mergeFlatSafetySnapshot(
  prior: unknown,
  updates: Record<string, unknown>,
): FlatSafetySnapshot {
  const output: FlatSafetySnapshot = {}
  const seen = new Set<object>()
  collectFlatSafetySnapshot(prior, output, seen, 0)
  collectFlatSafetySnapshot(updates, output, seen, 0)
  return output
}

export function applyPersistedTimeCriticalFloor(input: {
  existingCarePathway: string
  existingWorkflowStatus: string
  incomingCarePathway: CarePathway
  hasOpenEmergencyAction: boolean
}): CarePathway {
  if (
    input.hasOpenEmergencyAction ||
    input.existingWorkflowStatus === 'emergency_hold' ||
    input.existingCarePathway === 'emergency_now' ||
    input.incomingCarePathway === 'emergency_now'
  ) {
    return 'emergency_now'
  }
  if (
    input.existingCarePathway === 'same_day_clinician_review' ||
    input.incomingCarePathway === 'same_day_clinician_review'
  ) {
    return 'same_day_clinician_review'
  }
  return input.incomingCarePathway
}

function reviewForPathway(
  carePathway: CarePathway,
  fallback: ReviewRequirement,
): ReviewRequirement {
  if (carePathway === 'emergency_now') return 'emergency_action'
  if (carePathway === 'same_day_clinician_review') {
    return 'immediate_clinician_review'
  }
  return fallback
}

export function moreConservativeDataQuality(
  existing: DataQuality,
  incoming: DataQuality,
): DataQuality {
  return DATA_QUALITY_SAFETY_RANK[existing] >=
    DATA_QUALITY_SAFETY_RANK[incoming]
    ? existing
    : incoming
}

export async function persistEmergencyGatewayResult(
  triageSessionId: string,
  tenantId: string,
  gateway: PersistableEmergencyGatewayResult,
  processingAttemptCount: number,
): Promise<boolean> {
  const pool = await getPool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const workflowResult = await client.query(
      `SELECT workflow_status,
              care_pathway,
              data_quality,
              safety_shadow_result
         FROM triage_sessions
        WHERE id = $1
          AND tenant_id = $2
          AND processing_status = 'pending'
          AND processing_attempt_count = $3
        FOR UPDATE`,
      [triageSessionId, tenantId, processingAttemptCount],
    )
    const workflow = workflowResult.rows[0] as
      | {
          workflow_status: string
          care_pathway: string
          data_quality: DataQuality
          safety_shadow_result: unknown
        }
      | undefined
    if (!workflow || workflow.workflow_status === 'closed') {
      throw new Error('Tenant-bound open triage workflow not found')
    }

    const existingAction = await client.query(
      `SELECT id
         FROM triage_emergency_actions
        WHERE triage_session_id = $1
          AND status <> 'closed'
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE`,
      [triageSessionId],
    )
    let emergencyActionId = existingAction.rows[0]?.id as string | undefined
    const carePathway = applyPersistedTimeCriticalFloor({
      existingCarePathway: workflow.care_pathway,
      existingWorkflowStatus: workflow.workflow_status,
      incomingCarePathway: gateway.carePathway,
      hasOpenEmergencyAction: Boolean(emergencyActionId),
    })
    const emergency = carePathway === 'emergency_now'
    const timeCriticalHold =
      emergency ||
      carePathway === 'same_day_clinician_review' ||
      gateway.status === 'failed'
    const workflowStatus = emergency ? 'emergency_hold' : 'clinician_review'
    const incomingDataQuality: DataQuality =
      gateway.status === 'failed' ? 'insufficient' : 'partial'
    const dataQuality = moreConservativeDataQuality(
      workflow.data_quality ?? 'partial',
      incomingDataQuality,
    )
    const reviewRequirement = reviewForPathway(
      carePathway,
      gateway.reviewRequirement,
    )
    const shadowResult = mergeFlatSafetySnapshot(workflow.safety_shadow_result, {
      deterministicGateway: gateway,
      persistedCarePathwayFloor: carePathway,
    })

    const updateResult = await client.query(
      `UPDATE triage_sessions
          SET care_pathway = $3,
              data_quality = $4,
              review_requirement = $5,
              workflow_status = $6,
              scheduling_locked = true,
              due_at = CASE WHEN $7 THEN COALESCE(due_at, now()) ELSE due_at END,
              next_escalation_at = CASE
                WHEN $7 THEN COALESCE(next_escalation_at, now() + interval '5 minutes')
                ELSE next_escalation_at
              END,
              rule_version = $8,
              safety_shadow_result = $9::jsonb
        WHERE id = $1
          AND tenant_id = $2
          AND processing_status = 'pending'
          AND processing_attempt_count = $10`,
      [
        triageSessionId,
        tenantId,
        carePathway,
        dataQuality,
        reviewRequirement,
        workflowStatus,
        timeCriticalHold,
        gateway.version,
        JSON.stringify(shadowResult),
        processingAttemptCount,
      ],
    )
    if (updateResult.rowCount !== 1) {
      throw new Error('Triage safety row was not found')
    }

    if (emergency && !emergencyActionId) {
      const actionResult = await client.query(
        `INSERT INTO triage_emergency_actions (
           triage_session_id,
           status,
           owner_team,
           due_at,
           next_escalation_at,
           delivery_status,
           understanding_status,
           idempotency_key
         ) VALUES ($1, 'open', 'neurology_triage', now(),
                   now() + interval '5 minutes', 'unknown', 'unknown', $2)
         ON CONFLICT (idempotency_key) DO UPDATE
           SET updated_at = now()
           WHERE triage_emergency_actions.status <> 'closed'
         RETURNING id`,
        [triageSessionId, `gateway:${gateway.version}:${triageSessionId}`],
      )
      emergencyActionId = actionResult.rows[0]?.id
      if (!emergencyActionId) {
        throw new Error('Emergency action was not persisted')
      }
    }

    await client.query(
      `INSERT INTO triage_workflow_events (
         triage_session_id,
         emergency_action_id,
         event_type,
         actor_kind,
         previous_state,
         new_state,
         reason,
         rule_version,
         correlation_id
       ) VALUES ($1, $2, 'deterministic_emergency_screen_completed', 'system',
                 $3, $4, $5, $6, $7)`,
      [
        triageSessionId,
        emergencyActionId ?? null,
        workflow.workflow_status,
        workflowStatus,
        carePathway === gateway.carePathway
          ? 'Deterministic emergency gateway completed before model scoring'
          : 'Deterministic emergency gateway replay completed without lowering the persisted time-critical floor',
        gateway.version,
        `gateway:${gateway.version}:${triageSessionId}`,
      ],
    )

    await client.query('COMMIT')
    return true
  } catch {
    await client.query('ROLLBACK')
    console.error('[triage/gateway] safety result persistence failed')
    return false
  } finally {
    client.release()
  }
}
