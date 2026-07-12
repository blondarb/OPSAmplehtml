import { getPool } from '@/lib/db'
import type { CoverageStatus, SourceType } from './types'

const PROCESSING_LEASE_SECONDS = 180

export type StartTriageSessionResult =
  | {
      ok: true
      triageSessionId: string
      launchProcessing: boolean
      reused: boolean
      processingStatus: 'pending' | 'complete'
      processingAttemptCount: number
      patientId?: string
      consultId?: string
    }
  | {
      ok: false
      reason:
        | 'persistence_failed'
        | 'source_extraction_not_found'
        | 'source_session_binding_mismatch'
        | 'patient_not_found'
        | 'consult_not_found'
        | 'patient_consult_mismatch'
    }

export interface StartTriageSessionInput {
  tenantId: string
  sourceExtractionId?: string
  referralText: string
  patientAge?: number
  patientSex?: string
  referringProviderType?: string
  patientId?: string
  consultId?: string
  sourceType: SourceType
  sourceFilename?: string
  extractedSummary?: string
  extractionConfidence?: string
  noteTypeDetected?: string
  batchId?: string
  fusionGroupId?: string
  modelProfile: string
  coverageStatus: CoverageStatus
}

/**
 * Starts outpatient modeling exactly once per active lease while preserving an
 * early deterministic safety hold that may already exist for the extraction.
 *
 * Every path that carries a source extraction locks that tenant-bound source
 * first. This is the same lock order used by the ingestion safety workflow, so
 * concurrent ingestion and scoring requests serialize on one canonical row.
 */
export async function startOrReuseTriageSession(
  input: StartTriageSessionInput,
): Promise<StartTriageSessionResult> {
  const pool = await getPool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    let existing:
      | {
          id: string
          processing_status: 'pending' | 'complete' | 'error'
          lease_active: boolean
          processing_attempt_count: number
          patient_id: string | null
          consult_id: string | null
        }
      | undefined

    if (input.sourceExtractionId) {
      const extraction = await client.query(
        `SELECT id
           FROM triage_extractions
          WHERE id = $1
            AND tenant_id = $2
          FOR UPDATE`,
        [input.sourceExtractionId, input.tenantId],
      )
      if (!extraction.rows[0]) {
        await client.query('ROLLBACK')
        return { ok: false, reason: 'source_extraction_not_found' }
      }

      const existingResult = await client.query(
        `SELECT id,
                processing_status,
                patient_id,
                consult_id,
                processing_attempt_count,
                COALESCE(processing_lease_expires_at > now(), false) AS lease_active
           FROM triage_sessions
          WHERE source_extraction_id = $1
            AND tenant_id = $2
          ORDER BY created_at
          LIMIT 1
          FOR UPDATE`,
        [input.sourceExtractionId, input.tenantId],
      )
      existing = existingResult.rows[0]
    }

    const initialIngressClaim = Boolean(
      existing &&
        existing.processing_status === 'pending' &&
        !existing.lease_active &&
        existing.processing_attempt_count === 0,
    )
    if (existing) {
      const bindingMismatch = Boolean(
        (input.patientId !== undefined &&
          existing.patient_id !== input.patientId &&
          !(initialIngressClaim && existing.patient_id === null)) ||
          (input.consultId !== undefined &&
            existing.consult_id !== input.consultId &&
            !(initialIngressClaim && existing.consult_id === null)),
      )
      if (bindingMismatch) {
        await client.query('ROLLBACK')
        return { ok: false, reason: 'source_session_binding_mismatch' }
      }
    }

    let canonicalPatientId =
      input.patientId ?? existing?.patient_id ?? undefined
    const canonicalConsultId =
      input.consultId ?? existing?.consult_id ?? undefined

    if (canonicalConsultId) {
      const consult = await client.query(
        `SELECT id, patient_id
           FROM neurology_consults
          WHERE id = $1
            AND tenant_id = $2
          LIMIT 1
          FOR UPDATE`,
        [canonicalConsultId, input.tenantId],
      )
      const found = consult.rows[0] as
        | { id: string; patient_id: string | null }
        | undefined
      if (!found) {
        await client.query('ROLLBACK')
        return { ok: false, reason: 'consult_not_found' }
      }
      if (
        existing &&
        !initialIngressClaim &&
        (existing.patient_id ?? null) !== found.patient_id
      ) {
        await client.query('ROLLBACK')
        return { ok: false, reason: 'patient_consult_mismatch' }
      }
      if (canonicalPatientId !== undefined) {
        if (found.patient_id !== canonicalPatientId) {
          await client.query('ROLLBACK')
          return { ok: false, reason: 'patient_consult_mismatch' }
        }
      } else if (found.patient_id) {
        canonicalPatientId = found.patient_id
      }
    }

    if (canonicalPatientId) {
      const patient = await client.query(
        `SELECT id
           FROM patients
          WHERE id = $1
            AND tenant_id = $2
          LIMIT 1
          FOR KEY SHARE`,
        [canonicalPatientId, input.tenantId],
      )
      if (!patient.rows[0]) {
        await client.query('ROLLBACK')
        return { ok: false, reason: 'patient_not_found' }
      }
    }

    if (
      existing &&
      initialIngressClaim &&
      (canonicalPatientId !== undefined || canonicalConsultId !== undefined)
    ) {
      const established = await client.query(
        `UPDATE triage_sessions
            SET patient_id = COALESCE(patient_id, $3),
                consult_id = COALESCE(consult_id, $4)
          WHERE id = $1
            AND tenant_id = $2
            AND processing_status = 'pending'
            AND processing_attempt_count = 0
            AND processing_claimed_at IS NULL
            AND processing_lease_expires_at IS NULL
            AND ($3 IS NULL OR patient_id IS NULL OR patient_id = $3)
            AND ($4 IS NULL OR consult_id IS NULL OR consult_id = $4)
          RETURNING id`,
        [
          existing.id,
          input.tenantId,
          canonicalPatientId ?? null,
          canonicalConsultId ?? null,
        ],
      )
      if (!established.rows[0]?.id) {
        throw new Error('Initial ingress binding claim failed')
      }
    }

    const canonicalBindings = {
      ...(canonicalPatientId ? { patientId: canonicalPatientId } : {}),
      ...(canonicalConsultId ? { consultId: canonicalConsultId } : {}),
    }

    if (existing) {
      if (existing.processing_status === 'complete') {
        await client.query('COMMIT')
        return {
          ok: true,
          triageSessionId: existing.id,
          launchProcessing: false,
          reused: true,
          processingStatus: 'complete',
          processingAttemptCount: existing.processing_attempt_count,
          ...canonicalBindings,
        }
      }

      if (existing.processing_status === 'pending' && existing.lease_active) {
        await client.query('COMMIT')
        return {
          ok: true,
          triageSessionId: existing.id,
          launchProcessing: false,
          reused: true,
          processingStatus: 'pending',
          processingAttemptCount: existing.processing_attempt_count,
          ...canonicalBindings,
        }
      }

      const claimed = await client.query(
        `UPDATE triage_sessions
            SET referral_text = $3,
                patient_age = COALESCE($4, patient_age),
                patient_sex = COALESCE($5, patient_sex),
                referring_provider_type = COALESCE($6, referring_provider_type),
                source_type = $7,
                source_filename = COALESCE($8, source_filename),
                extracted_summary = COALESCE($9, extracted_summary),
                extraction_confidence = COALESCE($10, extraction_confidence),
                note_type_detected = COALESCE($11, note_type_detected),
                batch_id = COALESCE($12, batch_id),
                fusion_group_id = COALESCE($13, fusion_group_id),
                ai_model_used = $14,
                processing_status = 'pending',
                error_message = NULL,
                completed_at = NULL,
                processing_claimed_at = now(),
                processing_lease_expires_at = now() + make_interval(secs => $15),
                processing_attempt_count = processing_attempt_count + 1
          WHERE id = $1
            AND tenant_id = $2
          RETURNING id`,
        [
          existing.id,
          input.tenantId,
          input.referralText,
          input.patientAge ?? null,
          input.patientSex ?? null,
          input.referringProviderType ?? null,
          input.sourceType,
          input.sourceFilename ?? null,
          input.extractedSummary ?? null,
          input.extractionConfidence ?? null,
          input.noteTypeDetected ?? null,
          input.batchId ?? null,
          input.fusionGroupId ?? null,
          input.modelProfile,
          PROCESSING_LEASE_SECONDS,
        ],
      )
      if (!claimed.rows[0]?.id) throw new Error('Triage processing claim failed')

      await client.query('COMMIT')
      return {
        ok: true,
        triageSessionId: existing.id,
        launchProcessing: true,
        reused: true,
        processingStatus: 'pending',
        processingAttemptCount: existing.processing_attempt_count + 1,
        ...canonicalBindings,
      }
    }

    const inserted = await client.query(
      `INSERT INTO triage_sessions (
         tenant_id,
         source_extraction_id,
         referral_text,
         patient_age,
         patient_sex,
         referring_provider_type,
         patient_id,
         consult_id,
         source_type,
         source_filename,
         extracted_summary,
         extraction_confidence,
         note_type_detected,
         batch_id,
         fusion_group_id,
         ai_model_used,
         processing_status,
         care_pathway,
         data_quality,
         coverage_status,
         review_requirement,
         workflow_status,
         scheduling_locked,
         processing_claimed_at,
         processing_lease_expires_at,
         processing_attempt_count
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
         $15, $16, 'pending', 'undetermined', 'partial', $17,
         'clinician_confirmation', 'pending_safety_screen', true,
         now(), now() + make_interval(secs => $18), 1
       )
       RETURNING id`,
      [
        input.tenantId,
        input.sourceExtractionId ?? null,
        input.referralText,
        input.patientAge ?? null,
        input.patientSex ?? null,
        input.referringProviderType ?? null,
        canonicalPatientId ?? null,
        canonicalConsultId ?? null,
        input.sourceType,
        input.sourceFilename ?? null,
        input.extractedSummary ?? null,
        input.extractionConfidence ?? null,
        input.noteTypeDetected ?? null,
        input.batchId ?? null,
        input.fusionGroupId ?? null,
        input.modelProfile,
        input.coverageStatus,
        PROCESSING_LEASE_SECONDS,
      ],
    )
    const triageSessionId = inserted.rows[0]?.id as string | undefined
    if (!triageSessionId) throw new Error('Triage session insert failed')

    await client.query('COMMIT')
    return {
      ok: true,
      triageSessionId,
      launchProcessing: true,
      reused: false,
      processingStatus: 'pending',
      processingAttemptCount: 1,
      ...canonicalBindings,
    }
  } catch {
    await client.query('ROLLBACK')
    console.error('[triage/start] failed to initialize or claim triage processing')
    return { ok: false, reason: 'persistence_failed' }
  } finally {
    client.release()
  }
}
