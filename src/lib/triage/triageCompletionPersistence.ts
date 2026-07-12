import { getPool } from '@/lib/db'
import type { PoolClient } from 'pg'
import {
  buildTriageSummaryForConsult,
} from '@/lib/consult/contextBuilder'
import { formatTierDisplay } from './scoring'
import type {
  CarePathway,
  DataQuality,
  ReviewRequirement,
  TriageConfidence,
  TriageTier,
  WorkflowStatus,
} from './types'

export interface FinalizeTriageAttemptInput {
  triageSessionId: string
  tenantId: string
  processingAttemptCount: number
  proposedCarePathway: CarePathway
  scoringTier: TriageTier
  confidence: TriageConfidence
  dimensionScores: unknown
  weightedScore: number | null
  clinicalReasons: string[]
  redFlags: string[]
  suggestedWorkup: string[]
  failedTherapies: unknown[]
  missingInformation: unknown
  subspecialtyRecommendation: string
  subspecialtyRationale: string
  aiRawResponse: unknown
  aiInputTokens: number | null
  aiOutputTokens: number | null
  redFlagOverride?: boolean
  explicitConsult?: {
    id: string
    expectedPatientId: string | null
    chiefComplaint: string
    /** Accepted for compatibility; the authoritative display is recomputed. */
    tierDisplay?: string
    /** Accepted for compatibility; the authoritative summary is recomputed. */
    summary?: string
  }
  systemConsult?: {
    expectedPatientId: string | null
    referralText: string
    chiefComplaint: string
  }
}

export type FinalizeTriageAttemptResult =
  | {
      ok: true
      triageTier: TriageTier
      carePathway: CarePathway
      dataQuality: DataQuality
      reviewRequirement: ReviewRequirement
      workflowStatus: WorkflowStatus
      consultId: string | null
    }
  | {
      ok: false
      reason: 'claim_or_binding_changed' | 'persistence_failed'
    }

const TRIAGE_TIERS: TriageTier[] = [
  'emergent',
  'urgent',
  'semi_urgent',
  'routine_priority',
  'routine',
  'non_urgent',
  'insufficient_data',
]

const CARE_PATHWAYS: CarePathway[] = [
  'emergency_now',
  'same_day_clinician_review',
  'expedited_outpatient',
  'routine_outpatient',
  'redirect',
  'undetermined',
]

const DATA_QUALITIES: DataQuality[] = [
  'sufficient',
  'partial',
  'insufficient',
  'conflicting',
]

const REVIEW_REQUIREMENTS: ReviewRequirement[] = [
  'emergency_action',
  'immediate_clinician_review',
  'clinician_confirmation',
  'none',
]

const WORKFLOW_STATUSES: WorkflowStatus[] = [
  'pending_safety_screen',
  'emergency_hold',
  'clinician_review',
  'provider_clarification',
  'patient_clarification',
  'decision_ready',
  'action_pending',
  'closed',
]

function includesValue<T extends string>(values: T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T)
}

/**
 * Completes one exact processing claim while taking the current workflow row,
 * any open emergency action, and any explicit or system-created consult
 * binding into the same PostgreSQL statement. A hold that landed before this
 * statement is therefore authoritative over the worker's earlier in-memory
 * decision.
 */
export async function finalizeTriageAttempt(
  input: FinalizeTriageAttemptInput,
): Promise<FinalizeTriageAttemptResult> {
  if (input.explicitConsult && input.systemConsult) {
    return { ok: false, reason: 'persistence_failed' }
  }

  const tierDisplayByTier = Object.fromEntries(
    TRIAGE_TIERS.map((tier) => [
      tier,
      formatTierDisplay(tier, input.redFlagOverride),
    ]),
  )
  const summaryByTier = Object.fromEntries(
    TRIAGE_TIERS.map((tier) => [
      tier,
      buildTriageSummaryForConsult(
        tierDisplayByTier[tier],
        input.clinicalReasons,
        input.suggestedWorkup,
        input.subspecialtyRecommendation,
        input.subspecialtyRationale,
      ),
    ]),
  )

  let client: PoolClient | null = null
  try {
    client = await (await getPool()).connect()
    await client.query('BEGIN')
    const result = await client.query(
      `WITH locked_session AS MATERIALIZED (
         SELECT session.id,
                session.patient_id,
                session.care_pathway,
                session.data_quality,
                session.review_requirement,
                session.workflow_status,
                EXISTS (
                  SELECT 1
                    FROM triage_emergency_actions action
                   WHERE action.triage_session_id = session.id
                     AND action.status <> 'closed'
                ) AS has_open_emergency_action
           FROM triage_sessions session
          WHERE session.id = $1
            AND session.tenant_id = $2
            AND session.processing_status = 'pending'
            AND session.processing_attempt_count = $3
            AND session.workflow_status <> 'closed'
            AND session.consult_id IS NOT DISTINCT FROM $7
            AND (
              ($7 IS NULL AND $24 = false)
              OR session.patient_id IS NOT DISTINCT FROM $6
            )
          FOR UPDATE OF session
       ),
       locked_consult AS MATERIALIZED (
         SELECT consult.id
           FROM neurology_consults consult
          WHERE $7 IS NOT NULL
            AND consult.id = $7
            AND consult.tenant_id = $2
            AND consult.patient_id IS NOT DISTINCT FROM $6
            AND (
              consult.triage_session_id IS NULL
              OR consult.triage_session_id = $1
            )
          FOR UPDATE OF consult
       ),
       valid_system_patient AS MATERIALIZED (
         SELECT patient.id
           FROM patients patient
          WHERE $24 = true
            AND $6 IS NOT NULL
            AND patient.id = $6
            AND patient.tenant_id = $2
          FOR KEY SHARE OF patient
       ),
       eligible_session AS (
         SELECT session.*
           FROM locked_session session
          WHERE ($7 IS NULL OR EXISTS (SELECT 1 FROM locked_consult))
            AND (
              $24 = false
              OR $6 IS NULL
              OR EXISTS (SELECT 1 FROM valid_system_patient)
            )
       ),
       resolved_pathway AS (
         SELECT session.*,
                CASE
                  WHEN session.has_open_emergency_action
                    OR session.workflow_status = 'emergency_hold'
                    OR session.care_pathway = 'emergency_now'
                    OR $4 = 'emergency_now'
                    THEN 'emergency_now'
                  WHEN session.care_pathway = 'same_day_clinician_review'
                    OR $4 = 'same_day_clinician_review'
                    THEN 'same_day_clinician_review'
                  ELSE session.care_pathway
                END AS final_care_pathway
           FROM eligible_session session
       ),
       resolved AS (
         SELECT pathway.*,
                CASE
                  WHEN pathway.final_care_pathway = 'emergency_now'
                    THEN 'emergent'
                  WHEN pathway.final_care_pathway = 'same_day_clinician_review'
                    THEN 'urgent'
                  WHEN pathway.final_care_pathway = 'undetermined'
                    THEN 'insufficient_data'
                  ELSE $5
                END AS final_triage_tier
           FROM resolved_pathway pathway
       ),
       upserted_system_consult AS (
         INSERT INTO neurology_consults AS consult (
           tenant_id,
           patient_id,
           status,
           triage_session_id,
           triage_urgency,
           triage_tier_display,
           triage_summary,
           triage_chief_complaint,
           triage_red_flags,
           triage_subspecialty,
           triage_completed_at,
           referral_text,
           updated_at
         )
         SELECT $2,
                $6,
                'triage_complete',
                resolved.id,
                resolved.final_triage_tier,
                $21::jsonb ->> resolved.final_triage_tier,
                $22::jsonb ->> resolved.final_triage_tier,
                $23,
                ARRAY(SELECT jsonb_array_elements_text($12::jsonb)),
                $16,
                now(),
                $25,
                now()
           FROM resolved
          WHERE $24 = true
         ON CONFLICT (tenant_id, triage_session_id)
           WHERE triage_session_id IS NOT NULL
         DO UPDATE
               SET status = 'triage_complete',
                   triage_urgency = EXCLUDED.triage_urgency,
                   triage_tier_display = EXCLUDED.triage_tier_display,
                   triage_summary = EXCLUDED.triage_summary,
                   triage_chief_complaint = EXCLUDED.triage_chief_complaint,
                   triage_red_flags = EXCLUDED.triage_red_flags,
                   triage_subspecialty = EXCLUDED.triage_subspecialty,
                   triage_completed_at = EXCLUDED.triage_completed_at,
                   referral_text = EXCLUDED.referral_text,
                   updated_at = EXCLUDED.updated_at
             WHERE consult.tenant_id = EXCLUDED.tenant_id
               AND consult.patient_id IS NOT DISTINCT FROM EXCLUDED.patient_id
               AND consult.status IN ('triage_pending', 'triage_complete')
         RETURNING consult.id
       ),
       finalizable AS (
         SELECT resolved.*,
                CASE
                  WHEN $7 IS NOT NULL THEN $7
                  WHEN $24 = true THEN system_consult.id
                  ELSE NULL
                END AS final_consult_id
           FROM resolved
           LEFT JOIN upserted_system_consult system_consult ON true
          WHERE $24 = false OR system_consult.id IS NOT NULL
       ),
       updated_session AS (
         UPDATE triage_sessions session
            SET triage_tier = finalizable.final_triage_tier,
                confidence = $8,
                dimension_scores = $9::jsonb,
                weighted_score = $10,
                clinical_reasons = $11::jsonb,
                red_flags = $12::jsonb,
                suggested_workup = $13::jsonb,
                failed_therapies = $14::jsonb,
                missing_information = $15::jsonb,
                subspecialty_recommendation = $16,
                subspecialty_rationale = $17,
                ai_raw_response = $18::jsonb,
                ai_input_tokens = $19,
                ai_output_tokens = $20,
                care_pathway = finalizable.final_care_pathway,
                review_requirement = CASE
                  WHEN finalizable.final_care_pathway = 'emergency_now'
                    THEN 'emergency_action'
                  WHEN finalizable.final_care_pathway = 'same_day_clinician_review'
                    THEN 'immediate_clinician_review'
                  ELSE finalizable.review_requirement
                END,
                workflow_status = CASE
                  WHEN finalizable.final_care_pathway = 'emergency_now'
                    THEN 'emergency_hold'
                  ELSE 'clinician_review'
                END,
                consult_id = finalizable.final_consult_id,
                scheduling_locked = true,
                processing_status = 'complete',
                processing_claimed_at = NULL,
                processing_lease_expires_at = NULL,
                completed_at = now()
           FROM finalizable
          WHERE session.id = finalizable.id
          RETURNING session.id,
                    session.consult_id,
                    session.triage_tier,
                    session.care_pathway,
                    session.data_quality,
                    session.review_requirement,
                    session.workflow_status
       ),
       updated_consult AS (
         UPDATE neurology_consults consult
            SET status = 'triage_complete',
                triage_session_id = updated.id,
                triage_urgency = updated.triage_tier,
                triage_tier_display = $21::jsonb ->> updated.triage_tier,
                triage_summary = $22::jsonb ->> updated.triage_tier,
                triage_chief_complaint = $23,
                triage_red_flags = ARRAY(
                  SELECT jsonb_array_elements_text($12::jsonb)
                ),
                triage_subspecialty = $16,
                triage_completed_at = now(),
                updated_at = now()
           FROM updated_session updated, locked_consult locked
          WHERE consult.id = locked.id
          RETURNING consult.id
       )
       SELECT updated.id,
              updated.triage_tier,
              updated.care_pathway,
              updated.data_quality,
              updated.review_requirement,
              updated.workflow_status,
              updated.consult_id
         FROM updated_session updated
         LEFT JOIN updated_consult linked ON true
        WHERE ($7 IS NULL OR linked.id IS NOT NULL)
          AND ($24 = false OR updated.consult_id IS NOT NULL)`,
      [
        input.triageSessionId,
        input.tenantId,
        input.processingAttemptCount,
        input.proposedCarePathway,
        input.scoringTier,
        input.explicitConsult?.expectedPatientId ??
          input.systemConsult?.expectedPatientId ??
          null,
        input.explicitConsult?.id ?? null,
        input.confidence,
        JSON.stringify(input.dimensionScores),
        input.weightedScore,
        JSON.stringify(input.clinicalReasons),
        JSON.stringify(input.redFlags),
        JSON.stringify(input.suggestedWorkup),
        JSON.stringify(input.failedTherapies),
        input.missingInformation == null
          ? null
          : JSON.stringify(input.missingInformation),
        input.subspecialtyRecommendation,
        input.subspecialtyRationale,
        JSON.stringify(input.aiRawResponse),
        input.aiInputTokens,
        input.aiOutputTokens,
        JSON.stringify(tierDisplayByTier),
        JSON.stringify(summaryByTier),
        input.explicitConsult?.chiefComplaint ??
          input.systemConsult?.chiefComplaint ??
          null,
        input.systemConsult !== undefined,
        input.systemConsult?.referralText ?? null,
      ],
    )
    const row = result.rows[0] as Record<string, unknown> | undefined
    if (!row) {
      await client.query('ROLLBACK')
      return { ok: false, reason: 'claim_or_binding_changed' }
    }
    if (
      row.id !== input.triageSessionId ||
      (input.explicitConsult !== undefined &&
        row.consult_id !== input.explicitConsult.id) ||
      (input.systemConsult !== undefined &&
        typeof row.consult_id !== 'string') ||
      !includesValue(TRIAGE_TIERS, row.triage_tier) ||
      !includesValue(CARE_PATHWAYS, row.care_pathway) ||
      !includesValue(DATA_QUALITIES, row.data_quality) ||
      !includesValue(REVIEW_REQUIREMENTS, row.review_requirement) ||
      !includesValue(WORKFLOW_STATUSES, row.workflow_status)
    ) {
      await client.query('ROLLBACK')
      return { ok: false, reason: 'persistence_failed' }
    }
    await client.query('COMMIT')
    return {
      ok: true,
      triageTier: row.triage_tier,
      carePathway: row.care_pathway,
      dataQuality: row.data_quality,
      reviewRequirement: row.review_requirement,
      workflowStatus: row.workflow_status,
      consultId: typeof row.consult_id === 'string' ? row.consult_id : null,
    }
  } catch {
    if (client) {
      try {
        await client.query('ROLLBACK')
      } catch {
        console.error('[triage/completion] atomic finalization rollback failed')
      }
    }
    console.error('[triage/completion] atomic finalization failed')
    return { ok: false, reason: 'persistence_failed' }
  } finally {
    if (client) {
      try {
        client.release()
      } catch {
        console.error('[triage/completion] atomic finalization release failed')
      }
    }
  }
}
