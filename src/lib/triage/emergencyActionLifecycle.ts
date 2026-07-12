import { createHash } from 'node:crypto'
import type { PoolClient } from 'pg'

import type { ClinicalRole } from '@/lib/auth/clinicalAccess'
import { getPool } from '@/lib/db'

export type EmergencyActionStatus =
  | 'open'
  | 'attempting_contact'
  | 'handed_off'
  | 'closed'
  | 'failed'

export type EmergencyContactChannel =
  | 'patient_phone'
  | 'caregiver_phone'
  | 'sms'
  | 'patient_portal'
  | 'in_person'
  | 'referring_provider'
  | 'emergency_services'
  | 'other'

export type EmergencyContactOutcomeCode =
  | 'instructions_delivered'
  | 'no_answer'
  | 'message_left'
  | 'handoff_initiated'
  | 'emergency_services_activated'
  | 'patient_declined'
  | 'provider_contacted'
  | 'contact_failed'

export type EmergencyDispositionCode =
  | 'emergency_evaluation_handoff_confirmed'
  | 'emergency_services_handoff_confirmed'
  | 'referring_clinician_handoff_confirmed'
  | 'patient_declined_with_escalation_plan'
  | 'unable_to_contact_emergency_services_notified'

type EmergencyActorRole = Extract<ClinicalRole, 'clinician' | 'admin'>
type DeliveryStatus = 'delivered' | 'failed' | 'not_applicable'
type UnderstandingStatus =
  | 'confirmed'
  | 'not_confirmed'
  | 'not_applicable'

interface EmergencyActionCommandBase {
  triageSessionId: string
  actionId: string
  tenantId: string
  actorUserId: string
  actorRole: EmergencyActorRole
  idempotencyKey: string
}

export type ClaimEmergencyActionInput = EmergencyActionCommandBase

export interface RecordEmergencyContactAttemptInput
  extends EmergencyActionCommandBase {
  channel: EmergencyContactChannel
  instructionGiven: string
  deliveryStatus: DeliveryStatus
  understandingStatus: UnderstandingStatus
  outcomeCode: EmergencyContactOutcomeCode
  outcomeSummary: string
}

export interface CloseEmergencyActionInput extends EmergencyActionCommandBase {
  dispositionCode: EmergencyDispositionCode
  dispositionEvidence: string
  recipientOrAgency: string
  destination: string
}

export interface EmergencyActionSnapshot {
  id: string
  status: EmergencyActionStatus
  ownerUserId: string | null
}

export type EmergencyActionFailureReason =
  | 'invalid_command'
  | 'invalid_idempotency_key'
  | 'invalid_contact_evidence'
  | 'invalid_disposition_evidence'
  | 'action_not_found'
  | 'action_closed'
  | 'action_owned_by_another'
  | 'action_must_be_claimed'
  | 'invalid_action_state'
  | 'disposition_evidence_incomplete'
  | 'idempotency_conflict'
  | 'persistence_failed'

export type EmergencyActionCommandResult =
  | {
      ok: true
      replayed: boolean
      action: EmergencyActionSnapshot
    }
  | { ok: false; reason: EmergencyActionFailureReason }

interface EmergencyActionRow {
  id: string
  triage_session_id: string
  status: EmergencyActionStatus
  owner_user_id: string | null
  owner_team: string
  contact_attempted_at: Date | string | null
  contact_channel: string | null
  instruction_given: string | null
  delivery_status: 'unknown' | DeliveryStatus | null
  understanding_status: 'unknown' | UnderstandingStatus | null
  outcome: string | null
  closure_code: string | null
  closed_at: Date | string | null
  actor_role: EmergencyActorRole
}

interface WorkflowEventRow {
  event_type: string
  reason: string
  new_state: string | null
}

interface PreparedContact {
  nextStatus: Exclude<EmergencyActionStatus, 'open' | 'closed'>
  channel: EmergencyContactChannel
  instructionGiven: string
  deliveryStatus: DeliveryStatus
  understandingStatus: UnderstandingStatus
  outcomeCode: EmergencyContactOutcomeCode
  outcomeSummary: string
  reason: string
}

interface PreparedClose {
  dispositionCode: EmergencyDispositionCode
  dispositionEvidence: string
  recipientOrAgency: string
  destination: string
  reason: string
}

interface CommandDescriptor {
  eventType: string
  reason: string
  apply: (
    row: EmergencyActionRow,
    client: PoolClient,
  ) => Promise<
    | { ok: true; status: EmergencyActionStatus; ownerUserId: string | null }
    | { ok: false; reason: EmergencyActionFailureReason }
  >
}

const CONTACT_CHANNELS = new Set<EmergencyContactChannel>([
  'patient_phone',
  'caregiver_phone',
  'sms',
  'patient_portal',
  'in_person',
  'referring_provider',
  'emergency_services',
  'other',
])
const CONTACT_OUTCOME_CODES = new Set<EmergencyContactOutcomeCode>([
  'instructions_delivered',
  'no_answer',
  'message_left',
  'handoff_initiated',
  'emergency_services_activated',
  'patient_declined',
  'provider_contacted',
  'contact_failed',
])
const DELIVERY_STATUSES = new Set<DeliveryStatus>([
  'delivered',
  'failed',
  'not_applicable',
])
const UNDERSTANDING_STATUSES = new Set<UnderstandingStatus>([
  'confirmed',
  'not_confirmed',
  'not_applicable',
])
const DISPOSITION_CODES = new Set<EmergencyDispositionCode>([
  'emergency_evaluation_handoff_confirmed',
  'emergency_services_handoff_confirmed',
  'referring_clinician_handoff_confirmed',
  'patient_declined_with_escalation_plan',
  'unable_to_contact_emergency_services_notified',
])

function boundedText(value: string, maximum: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && trimmed.length <= maximum ? trimmed : null
}

function validBase(input: EmergencyActionCommandBase): EmergencyActionFailureReason | null {
  if (
    !boundedText(input.triageSessionId, 200) ||
    !boundedText(input.actionId, 200) ||
    !boundedText(input.tenantId, 200) ||
    !boundedText(input.actorUserId, 500) ||
    !['clinician', 'admin'].includes(input.actorRole)
  ) {
    return 'invalid_command'
  }
  if (
    typeof input.idempotencyKey !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(input.idempotencyKey)
  ) {
    return 'invalid_idempotency_key'
  }
  return null
}

function prepareContact(
  input: RecordEmergencyContactAttemptInput,
): PreparedContact | null {
  if (
    !CONTACT_CHANNELS.has(input.channel) ||
    !CONTACT_OUTCOME_CODES.has(input.outcomeCode) ||
    !DELIVERY_STATUSES.has(input.deliveryStatus) ||
    !UNDERSTANDING_STATUSES.has(input.understandingStatus)
  ) {
    return null
  }
  const instructionGiven = boundedText(input.instructionGiven, 2_000)
  const outcomeSummary = boundedText(input.outcomeSummary, 2_000)
  if (!instructionGiven || !outcomeSummary) return null

  let nextStatus: PreparedContact['nextStatus']
  switch (input.outcomeCode) {
    case 'handoff_initiated':
      if (
        input.deliveryStatus !== 'delivered' ||
        input.understandingStatus !== 'confirmed'
      ) {
        return null
      }
      nextStatus = 'handed_off'
      break
    case 'emergency_services_activated': {
      const confirmed =
        input.deliveryStatus === 'delivered' &&
        input.understandingStatus === 'confirmed'
      const notApplicable =
        input.deliveryStatus === 'not_applicable' &&
        input.understandingStatus === 'not_applicable'
      if (
        input.channel !== 'emergency_services' ||
        (!confirmed && !notApplicable)
      ) {
        return null
      }
      nextStatus = 'handed_off'
      break
    }
    case 'no_answer':
    case 'contact_failed':
      if (
        input.deliveryStatus !== 'failed' ||
        input.understandingStatus !== 'not_confirmed'
      ) {
        return null
      }
      nextStatus = 'failed'
      break
    case 'message_left':
      if (
        input.deliveryStatus !== 'delivered' ||
        input.understandingStatus !== 'not_confirmed'
      ) {
        return null
      }
      nextStatus = 'failed'
      break
    case 'instructions_delivered':
    case 'patient_declined':
    case 'provider_contacted':
      if (
        input.deliveryStatus !== 'delivered' ||
        input.understandingStatus !== 'confirmed'
      ) {
        return null
      }
      nextStatus = 'attempting_contact'
      break
  }

  const reason = JSON.stringify({
    operation: 'contact_attempt',
    channel: input.channel,
    instruction_given: instructionGiven,
    delivery_status: input.deliveryStatus,
    understanding_status: input.understandingStatus,
    outcome_code: input.outcomeCode,
    outcome_summary: outcomeSummary,
    next_status: nextStatus,
  })
  return {
    nextStatus,
    channel: input.channel,
    instructionGiven,
    deliveryStatus: input.deliveryStatus,
    understandingStatus: input.understandingStatus,
    outcomeCode: input.outcomeCode,
    outcomeSummary,
    reason,
  }
}

function prepareClose(input: CloseEmergencyActionInput): PreparedClose | null {
  if (!DISPOSITION_CODES.has(input.dispositionCode)) return null
  const dispositionEvidence = boundedText(input.dispositionEvidence, 2_000)
  const recipientOrAgency = boundedText(input.recipientOrAgency, 500)
  const destination = boundedText(input.destination, 500)
  if (!dispositionEvidence || !recipientOrAgency || !destination) return null
  return {
    dispositionCode: input.dispositionCode,
    dispositionEvidence,
    recipientOrAgency,
    destination,
    reason: JSON.stringify({
      operation: 'close',
      disposition_code: input.dispositionCode,
      disposition_evidence: dispositionEvidence,
      recipient_or_agency: recipientOrAgency,
      destination,
    }),
  }
}

function correlationId(
  actionId: string,
  eventType: string,
  idempotencyKey: string,
): string {
  const keyDigest = createHash('sha256')
    .update(idempotencyKey, 'utf8')
    .digest('hex')
  return `emergency-action:${actionId}:${eventType}:${keyDigest}`
}

function snapshot(
  row: EmergencyActionRow,
  overrides: Partial<EmergencyActionSnapshot> = {},
): EmergencyActionSnapshot {
  return {
    id: row.id,
    status: row.status,
    ownerUserId: row.owner_user_id,
    ...overrides,
  }
}

async function executeCommand(
  input: EmergencyActionCommandBase,
  descriptor: CommandDescriptor,
): Promise<EmergencyActionCommandResult> {
  const baseFailure = validBase(input)
  if (baseFailure) return { ok: false, reason: baseFailure }

  let client: PoolClient | null = null
  let transactionOpen = false
  try {
    const pool = await getPool()
    client = await pool.connect()
    await client.query('BEGIN')
    transactionOpen = true
    const actionResult = await client.query(
      `SELECT action.id,
              action.triage_session_id,
              action.status,
              action.owner_user_id,
              action.owner_team,
              action.contact_attempted_at,
              action.contact_channel,
              action.instruction_given,
              action.delivery_status,
              action.understanding_status,
              action.outcome,
              action.closure_code,
              action.closed_at,
              membership.role AS actor_role
         FROM triage_emergency_actions action
         JOIN triage_sessions session
           ON session.id = action.triage_session_id
         JOIN clinical_access_memberships membership
           ON membership.user_id = $4
          AND membership.tenant_id = session.tenant_id
          AND membership.active = true
          AND membership.role IN ('clinician', 'admin')
          AND membership.role = $5
        WHERE action.id = $1
          AND action.triage_session_id = $2
          AND session.tenant_id = $3
        FOR UPDATE OF action`,
      [
        input.actionId,
        input.triageSessionId,
        input.tenantId,
        input.actorUserId,
        input.actorRole,
      ],
    )
    const row = actionResult.rows[0] as EmergencyActionRow | undefined
    if (!row) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { ok: false, reason: 'action_not_found' }
    }

    const commandCorrelationId = correlationId(
      row.id,
      descriptor.eventType,
      input.idempotencyKey,
    )
    const priorEventResult = await client.query(
      `SELECT event_type, reason, new_state
         FROM triage_workflow_events
        WHERE emergency_action_id = $1
          AND correlation_id = $2
        LIMIT 1`,
      [row.id, commandCorrelationId],
    )
    const priorEvent = priorEventResult.rows[0] as WorkflowEventRow | undefined
    if (priorEvent) {
      if (
        priorEvent.event_type !== descriptor.eventType ||
        priorEvent.reason !== descriptor.reason
      ) {
        await client.query('ROLLBACK')
        transactionOpen = false
        return { ok: false, reason: 'idempotency_conflict' }
      }
      await client.query('COMMIT')
      transactionOpen = false
      return { ok: true, replayed: true, action: snapshot(row) }
    }

    const previousState = row.status
    const applied = await descriptor.apply(row, client)
    if (!applied.ok) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return applied
    }
    await client.query(
      `INSERT INTO triage_workflow_events (
         triage_session_id,
         emergency_action_id,
         event_type,
         actor_kind,
         actor_id,
         actor_role,
         previous_state,
         new_state,
         reason,
         correlation_id
       ) VALUES ($1, $2, $3, 'clinician', $4, $5, $6, $7, $8, $9)`,
      [
        input.triageSessionId,
        input.actionId,
        descriptor.eventType,
        input.actorUserId,
        input.actorRole,
        previousState,
        applied.status,
        descriptor.reason,
        commandCorrelationId,
      ],
    )
    await client.query('COMMIT')
    transactionOpen = false
    return {
      ok: true,
      replayed: false,
      action: snapshot(row, {
        status: applied.status,
        ownerUserId: applied.ownerUserId,
      }),
    }
  } catch {
    if (transactionOpen && client) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // The original persistence failure remains the command outcome.
      }
    }
    console.error('[triage/emergency-action] lifecycle command failed')
    return { ok: false, reason: 'persistence_failed' }
  } finally {
    if (client) {
      try {
        client.release()
      } catch {
        // Command outcome is already determined; release errors are not exposed.
      }
    }
  }
}

export async function claimEmergencyAction(
  input: ClaimEmergencyActionInput,
): Promise<EmergencyActionCommandResult> {
  const reason = JSON.stringify({
    operation: 'claim',
    actor_user_id: input.actorUserId,
  })
  return executeCommand(input, {
    eventType: 'emergency_action_claimed',
    reason,
    apply: async (row, client) => {
      if (row.status === 'closed') return { ok: false, reason: 'action_closed' }
      if (row.owner_user_id && row.owner_user_id !== input.actorUserId) {
        return { ok: false, reason: 'action_owned_by_another' }
      }
      const updateResult = await client.query(
        `UPDATE triage_emergency_actions
            SET owner_user_id = $3,
                updated_at = now()
          WHERE id = $1
            AND triage_session_id = $2`,
        [input.actionId, input.triageSessionId, input.actorUserId],
      ) as { rowCount?: number }
      if (updateResult.rowCount !== 1) throw new Error('claim update failed')
      return {
        ok: true,
        status: row.status,
        ownerUserId: input.actorUserId,
      }
    },
  })
}

export async function recordEmergencyContactAttempt(
  input: RecordEmergencyContactAttemptInput,
): Promise<EmergencyActionCommandResult> {
  const baseFailure = validBase(input)
  if (baseFailure) return { ok: false, reason: baseFailure }
  const prepared = prepareContact(input)
  if (!prepared) return { ok: false, reason: 'invalid_contact_evidence' }

  return executeCommand(input, {
    eventType: 'emergency_contact_attempt_recorded',
    reason: prepared.reason,
    apply: async (row, client) => {
      if (row.status === 'closed') return { ok: false, reason: 'action_closed' }
      if (!row.owner_user_id) {
        return { ok: false, reason: 'action_must_be_claimed' }
      }
      if (row.owner_user_id !== input.actorUserId) {
        return { ok: false, reason: 'action_owned_by_another' }
      }
      if (
        row.status === 'handed_off' &&
        prepared.nextStatus === 'attempting_contact'
      ) {
        return { ok: false, reason: 'invalid_action_state' }
      }
      const escalationAssignment =
        prepared.nextStatus === 'failed'
          ? 'next_escalation_at = now()'
          : "next_escalation_at = now() + interval '5 minutes'"
      const updateResult = await client.query(
        `UPDATE triage_emergency_actions
            SET status = $3,
                contact_attempted_at = now(),
                contact_channel = $4,
                instruction_given = $5,
                delivery_status = $6,
                understanding_status = $7,
                outcome = $8,
                ${escalationAssignment},
                updated_at = now()
          WHERE id = $1
            AND triage_session_id = $2`,
        [
          input.actionId,
          input.triageSessionId,
          prepared.nextStatus,
          prepared.channel,
          prepared.instructionGiven,
          prepared.deliveryStatus,
          prepared.understandingStatus,
          prepared.outcomeSummary,
        ],
      ) as { rowCount?: number }
      if (updateResult.rowCount !== 1) {
        throw new Error('contact update failed')
      }
      return {
        ok: true,
        status: prepared.nextStatus,
        ownerUserId: row.owner_user_id,
      }
    },
  })
}

function closeEvidenceIsComplete(
  row: EmergencyActionRow,
  prepared: PreparedClose,
): boolean {
  if (
    !row.contact_attempted_at ||
    !boundedText(row.contact_channel ?? '', 500) ||
    !boundedText(row.instruction_given ?? '', 2_000) ||
    !boundedText(row.outcome ?? '', 2_000)
  ) {
    return false
  }
  const confirmedContact =
    row.delivery_status === 'delivered' &&
    row.understanding_status === 'confirmed'
  const emergencyServicesContact =
    row.status === 'handed_off' &&
    row.contact_channel === 'emergency_services' &&
    ((row.delivery_status === 'not_applicable' &&
      row.understanding_status === 'not_applicable') ||
      confirmedContact)

  switch (prepared.dispositionCode) {
    case 'emergency_services_handoff_confirmed':
    case 'unable_to_contact_emergency_services_notified':
      return emergencyServicesContact
    case 'emergency_evaluation_handoff_confirmed':
      return row.status === 'handed_off' && confirmedContact
    case 'referring_clinician_handoff_confirmed':
      return (
        row.status === 'handed_off' &&
        row.contact_channel === 'referring_provider' &&
        confirmedContact
      )
    case 'patient_declined_with_escalation_plan':
      return (
        ['attempting_contact', 'handed_off'].includes(row.status) &&
        [
          'patient_phone',
          'caregiver_phone',
          'in_person',
          'patient_portal',
        ].includes(row.contact_channel ?? '') &&
        confirmedContact
      )
  }
}

export async function closeEmergencyAction(
  input: CloseEmergencyActionInput,
): Promise<EmergencyActionCommandResult> {
  const baseFailure = validBase(input)
  if (baseFailure) return { ok: false, reason: baseFailure }
  const prepared = prepareClose(input)
  if (!prepared) return { ok: false, reason: 'invalid_disposition_evidence' }

  return executeCommand(input, {
    eventType: 'emergency_action_closed',
    reason: prepared.reason,
    apply: async (row, client) => {
      if (row.status === 'closed') return { ok: false, reason: 'action_closed' }
      if (!row.owner_user_id) {
        return { ok: false, reason: 'action_must_be_claimed' }
      }
      if (row.owner_user_id !== input.actorUserId) {
        return { ok: false, reason: 'action_owned_by_another' }
      }
      if (!closeEvidenceIsComplete(row, prepared)) {
        return {
          ok: false,
          reason: 'disposition_evidence_incomplete',
        }
      }
      const updateResult = await client.query(
        `UPDATE triage_emergency_actions
            SET status = 'closed',
                outcome = $3,
                closure_code = $4,
                closed_at = now(),
                reviewed_by = $5,
                reviewed_at = now(),
                updated_at = now()
          WHERE id = $1
            AND triage_session_id = $2`,
        [
          input.actionId,
          input.triageSessionId,
          prepared.dispositionEvidence,
          prepared.dispositionCode,
          input.actorUserId,
        ],
      ) as { rowCount?: number }
      if (updateResult.rowCount !== 1) throw new Error('closure update failed')
      return {
        ok: true,
        status: 'closed',
        ownerUserId: row.owner_user_id,
      }
    },
  })
}
