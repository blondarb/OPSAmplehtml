import { NextResponse } from 'next/server'
import type { CoverageStatus, SourceType } from '@/lib/triage/types'
import { from } from '@/lib/db-query'
import { runInBackground } from '@/lib/triage/asyncRunner'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import {
  processTriageInBackground,
  TRIAGE_MODEL,
  type TriageBackgroundParams,
} from '@/lib/triage/processTriageInBackground'
import { buildLongPacketAdjudicationText } from '@/lib/triage/longPacketIngestion'
import { FILE_CONSTRAINTS } from '@/lib/triage/types'
import { selectDominantBoundedSafetyEvidence } from '@/lib/triage/safetyEvidenceSelection'
import { startOrReuseTriageSession } from '@/lib/triage/sessionStart'
import {
  runEmergencyGateway,
  type EmergencyGatewayResult,
} from '@/lib/triage/emergencyGateway'
import { persistEmergencyGatewayResult } from '@/lib/triage/gatewayPersistence'
import {
  validatePersistedSourceExtractionAuthority,
  type GovernedSourceSafetyPathway,
  type SourceFailureEmergencyGateway,
} from '@/lib/triage/sourceExtractionAuthority'

// Lambda must stay alive for Bedrock + DB writes after the 202 is sent.
// 120s gives plenty of headroom for the typical 25-40s total work.
export const maxDuration = 120

const MAX_HOLD_SAFETY_SIGNALS = 20
const MAX_HOLD_EVIDENCE_PER_SIGNAL = 5
const MAX_HOLD_EVIDENCE_REEVALUATIONS = 64
const MAX_HOLD_EVIDENCE_QUOTE_CHARACTERS = 2_000

function boundedHoldPacketSafety(
  gateway: SourceFailureEmergencyGateway | undefined,
) {
  if (
    !gateway ||
    (gateway.carePathway !== 'emergency_now' &&
      gateway.carePathway !== 'same_day_clinician_review')
  ) {
    return undefined
  }
  return {
    care_pathway: gateway.carePathway,
    review_requirement: gateway.reviewRequirement,
    clinician_hold: true,
    signals: gateway.signals.slice(0, MAX_HOLD_SAFETY_SIGNALS).map((signal) => ({
      code: signal.code,
      syndrome: signal.syndrome,
      action: signal.action,
      evidence: selectDominantBoundedSafetyEvidence(signal, {
        maximumEvidence: MAX_HOLD_EVIDENCE_PER_SIGNAL,
        maximumQuoteCharacters: MAX_HOLD_EVIDENCE_QUOTE_CHARACTERS,
        maximumReevaluations: MAX_HOLD_EVIDENCE_REEVALUATIONS,
      }),
    })),
  }
}

function sourceAuthorityHoldResponse(input: {
  reason: string
  safetyPathway?: GovernedSourceSafetyPathway
  deterministicGateway?: SourceFailureEmergencyGateway
  safetySessionId?: string
  error?: string
  status?: number
}) {
  const packetSafety = boundedHoldPacketSafety(input.deterministicGateway)
  return NextResponse.json(
    {
      error:
        input.error ??
        'Source extraction authority could not be verified. Human review is required.',
      reason: input.reason,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      immediate_action_required: input.safetyPathway !== undefined,
      ...(input.safetyPathway
        ? { safety_pathway: input.safetyPathway }
        : {}),
      ...(packetSafety ? { packet_safety: packetSafety } : {}),
      ...(input.safetySessionId
        ? {
            session_id: input.safetySessionId,
            safety_triage_session_id: input.safetySessionId,
          }
        : {}),
    },
    { status: input.status ?? 409 },
  )
}

function positiveRawReferralGateway(
  referralText: unknown,
): (EmergencyGatewayResult & {
  carePathway: GovernedSourceSafetyPathway
}) | undefined {
  if (
    typeof referralText !== 'string' ||
    !referralText.trim() ||
    referralText.length > FILE_CONSTRAINTS.MAX_PACKET_TEXT_LENGTH
  ) {
    return undefined
  }
  const gateway = runEmergencyGateway(referralText)
  return gateway.status === 'completed' &&
    (gateway.carePathway === 'emergency_now' ||
      gateway.carePathway === 'same_day_clinician_review')
    ? (gateway as EmergencyGatewayResult & {
        carePathway: GovernedSourceSafetyPathway
      })
    : undefined
}

function positiveShortReferralGateway(referralText: string) {
  return referralText.trim().length < 50
    ? positiveRawReferralGateway(referralText)
    : undefined
}

async function markShortReferralScoringBlocked(input: {
  triageSessionId: string
  tenantId: string
  processingAttemptCount: number
}): Promise<boolean> {
  try {
    const result = await from('triage_sessions')
      .update({
        processing_status: 'error',
        processing_claimed_at: null,
        processing_lease_expires_at: null,
        error_message:
          'The referral is too short for outpatient scoring. Its time-critical safety pathway remains active for mandatory clinician action.',
        completed_at: new Date(),
      })
      .eq('id', input.triageSessionId)
      .eq('tenant_id', input.tenantId)
      .eq('processing_status', 'pending')
      .eq('processing_attempt_count', input.processingAttemptCount)
      .select('id')
      .single()
    if (
      result.error ||
      !result.data ||
      result.data.id !== input.triageSessionId
    ) {
      console.error('[triage] short-referral scoring block was not persisted')
      return false
    }
    return true
  } catch {
    console.error('[triage] short-referral scoring block was not persisted')
    return false
  }
}

function highestGovernedSafetyPathway(input: {
  deterministic?: string
  model?: string
}): GovernedSourceSafetyPathway | undefined {
  if (
    input.deterministic === 'emergency_now' ||
    input.model === 'emergency_now'
  ) {
    return 'emergency_now'
  }
  if (
    input.deterministic === 'same_day_clinician_review' ||
    input.model === 'same_day_clinician_review'
  ) {
    return 'same_day_clinician_review'
  }
  return undefined
}

function unverifiedPatientBindingHold(input: {
  safetyPathway?: GovernedSourceSafetyPathway
  deterministicGateway?: SourceFailureEmergencyGateway
}) {
  return sourceAuthorityHoldResponse({
    error:
      'Patient or consult binding requires a separately verified identity workflow and is not accepted by triage intake.',
    reason: 'unverified_patient_binding_not_allowed',
    safetyPathway: input.safetyPathway,
    deterministicGateway: input.deterministicGateway,
    status: 409,
  })
}

export async function POST(request: Request) {
  const access = await authorizeClinicalAccess({
    action: 'triage.create',
    allowedRoles: ['clinician', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: 'Access denied', reason: access.reason },
      { status: access.status },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  let referral_text = body.referral_text as string | undefined
  const rawPositiveGateway = positiveRawReferralGateway(body.referral_text)
  let patient_age = body.patient_age as number | undefined
  let patient_sex = body.patient_sex as string | undefined
  let referring_provider_type = body.referring_provider_type as
    | string
    | undefined
  const unverifiedPatientBindingWasSupplied =
    Object.prototype.hasOwnProperty.call(body, 'patient_id') ||
    Object.prototype.hasOwnProperty.call(body, 'consult_id') ||
    Object.prototype.hasOwnProperty.call(body, 'create_consult')
  let extracted_summary = body.extracted_summary as string | undefined
  const requestedSourceType = body.source_type as string | undefined
  const sourceFilenameWasSupplied = Object.prototype.hasOwnProperty.call(
    body,
    'source_filename',
  )
  let source_filename: string | undefined
  let extraction_confidence = body.extraction_confidence as string | undefined
  let note_type_detected = body.note_type_detected as string | undefined
  const sourceExtractionIdWasSupplied = Object.prototype.hasOwnProperty.call(
    body,
    'source_extraction_id',
  )
  if (
    sourceExtractionIdWasSupplied &&
    (typeof body.source_extraction_id !== 'string' ||
      !body.source_extraction_id.trim())
  ) {
    if (rawPositiveGateway) {
      return sourceAuthorityHoldResponse({
        error: 'source_extraction_id must be a non-empty string.',
        reason: 'invalid_source_extraction_id',
        safetyPathway: rawPositiveGateway.carePathway,
        deterministicGateway: rawPositiveGateway,
        status: 400,
      })
    }
    return NextResponse.json(
      {
        error: 'source_extraction_id must be a non-empty string.',
        reason: 'invalid_source_extraction_id',
      },
      { status: 400 },
    )
  }
  const sourceExtractionId = sourceExtractionIdWasSupplied
    ? (body.source_extraction_id as string).trim()
    : undefined
  const batch_id = body.batch_id as string | undefined
  const fusion_group_id = body.fusion_group_id as string | undefined
  const requestedTemp = body.temperature as number | undefined
  let precomputedGateway: TriageBackgroundParams['precomputedGateway']
  let precomputedSafetyResult: TriageBackgroundParams['precomputedSafetyResult']
  let adjudicationText: string | undefined
  let authoritativeCoverageStatus: CoverageStatus | undefined

  let sourceType: SourceType = 'paste'
  if (!sourceExtractionId) {
    if (
      requestedSourceType !== undefined &&
      !['paste', 'pdf', 'docx', 'txt'].includes(requestedSourceType)
    ) {
      if (rawPositiveGateway) {
        return sourceAuthorityHoldResponse({
          error: 'Invalid source_type',
          reason: 'invalid_source_type',
          safetyPathway: rawPositiveGateway.carePathway,
          deterministicGateway: rawPositiveGateway,
          status: 400,
        })
      }
      return NextResponse.json({ error: 'Invalid source_type' }, { status: 400 })
    }
    if (sourceFilenameWasSupplied) {
      return sourceAuthorityHoldResponse({
        error:
          'Document filename metadata requires its tenant-bound raw source extraction.',
        reason: 'raw_source_binding_required',
        safetyPathway: rawPositiveGateway?.carePathway,
        deterministicGateway: rawPositiveGateway,
      })
    }
    sourceType = (requestedSourceType ?? 'paste') as SourceType
    // A caller-generated summary has no immutable source or model provenance.
    // Plain pasted referrals are scored from the pasted note itself.
    extracted_summary = undefined
  }

  if (!sourceExtractionId && unverifiedPatientBindingWasSupplied) {
    return unverifiedPatientBindingHold({
      safetyPathway: rawPositiveGateway?.carePathway,
      deterministicGateway: rawPositiveGateway,
    })
  }

  // A generated summary is never accepted as the only source for an uploaded
  // document. Resolve the tenant-bound extraction and retain the complete raw
  // text for the deterministic emergency gateway.
  if (sourceExtractionId) {
    const { data: sourceExtraction, error: sourceError } = await from(
      'triage_extractions',
    )
      .select(
        'id, status, text_input, extracted_summary, key_findings, source_filename, patient_age, patient_sex, extraction_confidence, note_type_detected, ingestion_mode, coverage_status, coverage_report, source_pages, source_sha256, packet_plan, packet_plan_sha256, packet_emergency_result, model_map_result, model_reduce_result, safety_prompt_versions',
      )
      .eq('id', sourceExtractionId)
      .eq('tenant_id', access.context.tenantId)
      .single()

    if (sourceError || !sourceExtraction) {
      return sourceAuthorityHoldResponse({
        error: 'Source extraction not found',
        reason: 'source_extraction_not_found',
        safetyPathway: rawPositiveGateway?.carePathway,
        deterministicGateway: rawPositiveGateway,
        status: 404,
      })
    }
    const authorityDecision = validatePersistedSourceExtractionAuthority(
      sourceExtraction,
    )
    if (!authorityDecision.ok) {
      return sourceAuthorityHoldResponse({
        reason: authorityDecision.reason,
        safetyPathway: authorityDecision.safetyPathway,
        deterministicGateway: authorityDecision.deterministicGateway,
      })
    }

    const authority = authorityDecision.authority
    referral_text = authority.rawText
    extracted_summary = authority.extractedSummary
    sourceType = authority.sourceType
    source_filename = authority.sourceFilename
    patient_age = authority.patientAge
    patient_sex = authority.patientSex
    extraction_confidence = authority.extractionConfidence
    note_type_detected = authority.noteTypeDetected
    // Pre-referral-case milestone: the extraction row has no source-bound
    // referring-provider field, so a caller value cannot become authoritative.
    referring_provider_type = undefined
    authoritativeCoverageStatus = authority.coverageStatus
    precomputedGateway = authority.deterministicGateway

    if (authority.ingestionMode === 'long_packet') {
      const validated = authority.longPacketSafety
      if (!validated) {
        return sourceAuthorityHoldResponse({
          error: 'Long-packet safety provenance could not be verified',
          reason: 'long_packet_safety_artifacts_invalid',
          safetyPathway: highestGovernedSafetyPathway({
            deterministic: authority.deterministicGateway.carePathway,
          }),
        })
      }
      precomputedGateway = validated.gateway
      precomputedSafetyResult = validated.safetyResult
    }

    const verifiedSafetyPathway = highestGovernedSafetyPathway({
      deterministic: authority.deterministicGateway.carePathway,
      model: precomputedSafetyResult?.carePathway,
    })
    if (unverifiedPatientBindingWasSupplied) {
      return unverifiedPatientBindingHold({
        safetyPathway: verifiedSafetyPathway,
        deterministicGateway: authority.deterministicGateway,
      })
    }
    if (!extracted_summary) {
      return sourceAuthorityHoldResponse({
        error:
          'The persisted extraction summary is missing. Outpatient scoring is blocked pending human review.',
        reason: 'source_extraction_summary_missing',
        safetyPathway: verifiedSafetyPathway,
      })
    }

    if (authority.ingestionMode === 'long_packet') {
      try {
        adjudicationText = buildLongPacketAdjudicationText({
          extractedSummary: extracted_summary,
          safetyArtifacts: authority.longPacketSafety!,
        })
      } catch {
        return sourceAuthorityHoldResponse({
          error: 'Long-packet safety provenance could not be verified',
          reason: 'long_packet_safety_artifacts_invalid',
          safetyPathway: verifiedSafetyPathway,
        })
      }
    }
  } else if (sourceType !== 'paste') {
    if (rawPositiveGateway) {
      return sourceAuthorityHoldResponse({
        error:
          'Uploaded-document triage requires its tenant-bound raw source extraction.',
        reason: 'raw_source_binding_required',
        safetyPathway: rawPositiveGateway.carePathway,
        deterministicGateway: rawPositiveGateway,
      })
    }
    return NextResponse.json(
      {
        error:
          'Uploaded-document triage requires its tenant-bound raw source extraction.',
        reason: 'raw_source_binding_required',
      },
      { status: 409 },
    )
  }

  // Synchronous input validation — return JSON for client errors.
  if (!referral_text || typeof referral_text !== 'string') {
    return NextResponse.json({ error: 'referral_text is required' }, { status: 400 })
  }
  if (referral_text.trim().length < 50) {
    const shortGateway = positiveShortReferralGateway(referral_text)
    if (shortGateway) {
      const shortCoverageStatus: CoverageStatus =
        authoritativeCoverageStatus ??
        (extracted_summary || sourceType !== 'paste'
          ? 'partial'
          : 'not_applicable')
      let shortStart: Awaited<ReturnType<typeof startOrReuseTriageSession>>
      try {
        shortStart = await startOrReuseTriageSession({
          tenantId: access.context.tenantId,
          sourceExtractionId,
          referralText: referral_text,
          patientAge: patient_age,
          patientSex: patient_sex,
          referringProviderType: referring_provider_type,
          sourceType,
          sourceFilename: source_filename,
          extractedSummary: extracted_summary,
          extractionConfidence: extraction_confidence,
          noteTypeDetected: note_type_detected,
          batchId: batch_id,
          fusionGroupId: fusion_group_id,
          modelProfile: TRIAGE_MODEL,
          coverageStatus: shortCoverageStatus,
        })
      } catch {
        shortStart = { ok: false, reason: 'persistence_failed' }
      }
      if (!shortStart.ok || shortStart.processingStatus !== 'pending') {
        return sourceAuthorityHoldResponse({
          error:
            'Time-critical language was detected, but its automated safety workflow could not be created. Escalate manually now.',
          reason: 'short_referral_safety_workflow_unavailable',
          safetyPathway: shortGateway.carePathway,
          deterministicGateway: shortGateway,
          status: 503,
        })
      }
      let safetyPersisted = false
      try {
        safetyPersisted = await persistEmergencyGatewayResult(
          shortStart.triageSessionId,
          access.context.tenantId,
          shortGateway,
          shortStart.processingAttemptCount,
        )
      } catch {
        console.error('[triage] short-referral safety workflow was not persisted')
      }
      const scoringBlockPersisted = await markShortReferralScoringBlocked({
        triageSessionId: shortStart.triageSessionId,
        tenantId: access.context.tenantId,
        processingAttemptCount: shortStart.processingAttemptCount,
      })
      const shortWorkflowIsPollSafe =
        safetyPersisted && scoringBlockPersisted
      return sourceAuthorityHoldResponse({
        error: shortWorkflowIsPollSafe
          ? 'This short referral contains time-critical neurologic language. Complete the mandatory safety action now; outpatient scoring remains blocked.'
          : safetyPersisted
            ? 'Time-critical language was recorded, but a terminal scoring block could not be confirmed. Escalate manually now; do not poll or schedule from this response.'
            : 'Time-critical language was detected, but its automated safety workflow could not be recorded. Escalate manually now.',
        reason: shortWorkflowIsPollSafe
          ? 'referral_text_below_minimum_time_critical'
          : safetyPersisted
            ? 'short_referral_scoring_block_unavailable'
            : 'short_referral_safety_workflow_unavailable',
        safetyPathway: shortGateway.carePathway,
        deterministicGateway: shortGateway,
        ...(shortWorkflowIsPollSafe
          ? { safetySessionId: shortStart.triageSessionId }
          : {}),
        status: shortWorkflowIsPollSafe ? 409 : 503,
      })
    }
    return NextResponse.json(
      { error: 'Referral text must be at least 50 characters for meaningful triage.' },
      { status: 413 },
    )
  }
  if (referral_text.length > FILE_CONSTRAINTS.MAX_PACKET_TEXT_LENGTH) {
    return NextResponse.json(
      {
        error:
          'Referral text exceeds the maximum verified packet size.',
      },
      { status: 413 },
    )
  }
  if (
    referral_text.length > FILE_CONSTRAINTS.MAX_TEXT_LENGTH &&
    (!precomputedGateway || !precomputedSafetyResult)
  ) {
    return NextResponse.json(
      {
        error:
          'Long referral text requires a completed tenant-bound long-packet extraction.',
        reason: 'long_packet_extraction_required',
      },
      { status: 409 },
    )
  }

  const temperature =
    typeof requestedTemp === 'number' ? Math.max(0, Math.min(1, requestedTemp)) : 0
  const coverageStatus: CoverageStatus =
    authoritativeCoverageStatus ??
    (extracted_summary || sourceType !== 'paste'
      ? 'partial'
      : 'not_applicable')

  let started: Awaited<ReturnType<typeof startOrReuseTriageSession>>
  try {
    started = await startOrReuseTriageSession({
      tenantId: access.context.tenantId,
      sourceExtractionId,
      referralText: referral_text,
      patientAge: patient_age,
      patientSex: patient_sex,
      referringProviderType: referring_provider_type,
      sourceType,
      sourceFilename: source_filename,
      extractedSummary: extracted_summary,
      extractionConfidence: extraction_confidence,
      noteTypeDetected: note_type_detected,
      batchId: batch_id,
      fusionGroupId: fusion_group_id,
      modelProfile: TRIAGE_MODEL,
      coverageStatus,
    })
  } catch {
    console.error('[triage] session start rejected')
    return sourceAuthorityHoldResponse({
      error:
        'The authoritative triage workflow could not be started. Maintain the human-review hold.',
      reason: 'triage_session_start_failed',
      safetyPathway: highestGovernedSafetyPathway({
        deterministic: precomputedGateway?.carePathway,
        model: precomputedSafetyResult?.carePathway,
      }),
      status: 503,
    })
  }

  if (!started.ok) {
    console.error('Triage init or processing claim failed:', started.reason)
    const sourceBindingMismatch =
      started.reason === 'source_session_binding_mismatch'
    const transactionalBindingFailure =
      started.reason === 'patient_not_found' ||
      started.reason === 'consult_not_found' ||
      started.reason === 'patient_consult_mismatch'
    return sourceAuthorityHoldResponse({
      error:
        started.reason === 'source_extraction_not_found'
          ? 'Source extraction not found'
          : sourceBindingMismatch
            ? 'The source-bound triage session belongs to a different patient or consult.'
            : transactionalBindingFailure
              ? 'Patient or consult binding is not available'
              : 'The authoritative triage workflow could not be started. Maintain the human-review hold.',
      reason:
        started.reason === 'source_extraction_not_found'
          ? 'source_extraction_not_found'
          : sourceBindingMismatch
            ? 'source_session_binding_mismatch'
            : transactionalBindingFailure
              ? started.reason
              : 'triage_session_start_failed',
      safetyPathway: highestGovernedSafetyPathway({
        deterministic: precomputedGateway?.carePathway,
        model: precomputedSafetyResult?.carePathway,
      }),
      status:
        started.reason === 'source_extraction_not_found'
          ? 404
          : sourceBindingMismatch
            ? 409
            : started.reason === 'patient_consult_mismatch'
              ? 409
              : transactionalBindingFailure
                ? 404
            : 503,
    })
  }

  const sessionId = started.triageSessionId
  const successfulStartSafetyPathway = highestGovernedSafetyPathway({
    deterministic: precomputedGateway?.carePathway,
    model: precomputedSafetyResult?.carePathway,
  })

  if (started.launchProcessing) {
    // The database lease prevents duplicate model runs for repeated POSTs and
    // permits a safe retry if a compute invocation dies before completion.
    runInBackground(() =>
      processTriageInBackground(sessionId, {
        referral_text,
        gatewayText: referral_text,
        textForScoring:
          adjudicationText ?? extracted_summary ?? referral_text,
        patient_age,
        patient_sex,
        referring_provider_type,
        patient_id: started.patientId,
        temperature,
        createConsultFlag: false,
        existingConsultId: started.consultId,
        coverageStatus,
        tenantId: access.context.tenantId,
        precomputedGateway,
        precomputedSafetyResult,
        adjudicationText,
        processingAttemptCount: started.processingAttemptCount,
      }),
    )
  }

  return NextResponse.json(
    {
      session_id: sessionId,
      status: started.processingStatus,
      reused: started.reused,
      processing_started: started.launchProcessing,
      ...(successfulStartSafetyPathway
        ? {
            safety_pathway: successfulStartSafetyPathway,
            immediate_review_required: true,
            immediate_action_required: true,
            outpatient_scoring_blocked: true,
            human_review_required: true,
            scheduling_locked: true,
            safety_triage_session_id: sessionId,
          }
        : {}),
    },
    { status: 202 },
  )
}
