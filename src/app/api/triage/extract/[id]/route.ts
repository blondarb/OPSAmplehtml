import { NextResponse } from 'next/server'
import { from } from '@/lib/db-query'
import { getPool } from '@/lib/db'
import {
  FILE_CONSTRAINTS,
  type CarePathway,
  type ClinicalExtraction,
  type ReviewRequirement,
} from '@/lib/triage/types'
import { authorizeClinicalAccess, clinicalAccessDeniedMessage } from '@/lib/auth/clinicalAccess'
import {
  readLongPacketProgress,
  type LongPacketProgress,
} from '@/lib/triage/longPacketProgressRead'
import { LONG_PACKET_EMERGENCY_VERSION } from '@/lib/triage/longPacketEmergency'
import { LONG_PACKET_PLANNER_VERSION } from '@/lib/triage/longPacketPlanner'
import {
  validatePersistedSourceExtractionAuthority,
  validatePersistedSourceSafetyAuthority,
  type ValidatedSourceExtractionAuthority,
} from '@/lib/triage/sourceExtractionAuthority'
import { MODEL_SAFETY_WORKFLOW_PERSISTENCE_FAILED_REASON } from '@/lib/triage/pollSafetyState'
import {
  MODEL_SAFETY_EVIDENCE_PERSISTENCE_FAILED_REASON,
  parseLongPacketSafetyPersistenceFailure,
} from '@/lib/triage/longPacketSafetyPersistenceFailure'
import {
  validatePersistedPartialPdfSafety,
  type ValidatedPartialPdfManifest,
} from '@/lib/triage/partialPdfSafetyAuthority'
import type { EmergencyGatewayResult } from '@/lib/triage/emergencyGateway'

// Poll endpoint for the async extraction flow. POST /api/triage/extract
// returns 202 + extraction_id; the client polls here until terminal status.
export const dynamic = 'force-dynamic'

function parseJSON(value: unknown) {
  if (value == null) return null
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

interface PacketSafetyProjection {
  safety?: ClinicalExtraction['packet_safety']
  invalidReason?: string
  sourceHoldReason?: 'ocr_required'
  partialPdfManifest?: ValidatedPartialPdfManifest
  workflowIdentityAllowed?: boolean
  workflowPersistenceFailed?: boolean
  evidencePersistenceFailed?: boolean
  auditMode?: 'safety_checkpoint' | 'workflow_persistence_failed'
}

interface SourceSafetyWorkflowProjection {
  id: string
  carePathway:
    | 'emergency_now'
    | 'same_day_clinician_review'
    | 'undetermined'
  reviewRequirement: 'emergency_action' | 'immediate_clinician_review'
}

type SourceSafetyWorkflowRead =
  | { status: 'found'; workflow: SourceSafetyWorkflowProjection }
  | { status: 'absent' }
  | {
      status: 'unavailable'
      reason: 'source_safety_workflow_unavailable_manual_hold'
    }
  | {
      status: 'inconsistent'
      reason: 'source_safety_workflow_inconsistent_manual_hold'
    }

function safetyPathwayRank(carePathway: CarePathway): number {
  if (carePathway === 'emergency_now') return 3
  if (carePathway === 'same_day_clinician_review') return 2
  if (carePathway === 'undetermined') return 1
  return 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function persistedDeterministicSafetyMayBeActionable(value: unknown): boolean {
  const parsed = parseJSON(value)
  if (!isRecord(parsed)) return true
  const expectedChunkCount = parsed.expectedChunkCount
  const scannedChunkCount = parsed.scannedChunkCount
  const chunkEvaluations = parsed.chunkEvaluations
  const isStrictCompletedRoutineEnvelope =
    parsed.version === LONG_PACKET_EMERGENCY_VERSION &&
    parsed.plannerVersion === LONG_PACKET_PLANNER_VERSION &&
    parsed.status === 'completed' &&
    parsed.failureCode === null &&
    parsed.carePathway === 'routine_outpatient' &&
    parsed.reviewRequirement === 'clinician_confirmation' &&
    parsed.schedulingLocked === true &&
    Number.isSafeInteger(expectedChunkCount) &&
    typeof expectedChunkCount === 'number' &&
    expectedChunkCount > 0 &&
    scannedChunkCount === expectedChunkCount &&
    Array.isArray(chunkEvaluations) &&
    chunkEvaluations.length === expectedChunkCount &&
    Array.isArray(parsed.signals) &&
    parsed.signals.length === 0 &&
    Array.isArray(parsed.lexicalHits)
  return !isStrictCompletedRoutineEnvelope
}

async function readSourceSafetyWorkflow(
  extractionId: string,
  tenantId: string,
): Promise<SourceSafetyWorkflowRead> {
  try {
    const { data, error } = await from('triage_sessions')
      .select(
        'id, care_pathway, review_requirement, scheduling_locked, workflow_status',
      )
      .eq('source_extraction_id', extractionId)
      .eq('tenant_id', tenantId)
      .single()
    if (error) {
      if (error.code === 'PGRST116' && data == null) return { status: 'absent' }
      console.error('[triage/extract/poll] safety workflow unavailable')
      return {
        status: 'unavailable',
        reason: 'source_safety_workflow_unavailable_manual_hold',
      }
    }
    if (!isRecord(data)) {
      return {
        status: 'inconsistent',
        reason: 'source_safety_workflow_inconsistent_manual_hold',
      }
    }
    const id =
      typeof data.id === 'string' && data.id.trim() && data.id.length <= 200
        ? data.id
        : undefined
    const carePathway = data.care_pathway
    const reviewRequirement = data.review_requirement
    if (
      !id ||
      data.scheduling_locked !== true ||
      (carePathway !== 'emergency_now' &&
        carePathway !== 'same_day_clinician_review' &&
        carePathway !== 'undetermined') ||
      (carePathway === 'emergency_now'
        ? data.workflow_status !== 'emergency_hold'
        : data.workflow_status !== 'clinician_review') ||
      (carePathway === 'emergency_now'
        ? reviewRequirement !== 'emergency_action'
        : reviewRequirement !== 'immediate_clinician_review')
    ) {
      return {
        status: 'inconsistent',
        reason: 'source_safety_workflow_inconsistent_manual_hold',
      }
    }
    return {
      status: 'found',
      workflow: {
        id,
        carePathway,
        reviewRequirement:
          carePathway === 'emergency_now'
            ? 'emergency_action'
            : 'immediate_clinician_review',
      },
    }
  } catch {
    console.error('[triage/extract/poll] safety workflow unavailable')
    return {
      status: 'unavailable',
      reason: 'source_safety_workflow_unavailable_manual_hold',
    }
  }
}

function mergeSourceSafetyWorkflow(
  safety: ClinicalExtraction['packet_safety'] | undefined,
  workflow: SourceSafetyWorkflowProjection | undefined,
): ClinicalExtraction['packet_safety'] | undefined {
  if (!workflow) return safety
  const workflowWins =
    !safety ||
    safetyPathwayRank(workflow.carePathway) >
      safetyPathwayRank(safety.care_pathway)
  const carePathway =
    workflowWins ? workflow.carePathway : safety.care_pathway
  const reviewRequirement: ReviewRequirement =
    carePathway === 'emergency_now'
      ? 'emergency_action'
      : carePathway === 'same_day_clinician_review' ||
          carePathway === 'undetermined'
        ? 'immediate_clinician_review'
        : 'clinician_confirmation'
  return {
    care_pathway: carePathway,
    review_requirement: reviewRequirement,
    clinician_hold: carePathway !== 'routine_outpatient',
    signals: safety?.signals ?? [],
  }
}

function projectedEvidence(evidence: {
  quote: string
  documentId: string | null
  pageNumber: number | null
  startOffset: number
  endOffset: number
}) {
  return {
    quote: evidence.quote,
    documentId: evidence.documentId,
    pageNumber: evidence.pageNumber,
    startOffset: evidence.startOffset,
    endOffset: evidence.endOffset,
  }
}

function projectedGatewaySafety(
  gateway: EmergencyGatewayResult,
): ClinicalExtraction['packet_safety'] {
  return {
    care_pathway: gateway.carePathway,
    review_requirement: gateway.reviewRequirement,
    clinician_hold: gateway.carePathway !== 'routine_outpatient',
    signals: gateway.signals.map((signal) => ({
      code: signal.code,
      syndrome: signal.syndrome,
      action: signal.action,
      evidence: signal.evidence.map(projectedEvidence),
    })),
  }
}

function packetSafety(
  data: Record<string, unknown>,
): PacketSafetyProjection {
  const partialPdf = validatePersistedPartialPdfSafety(data)
  if (partialPdf.kind !== 'not_partial_pdf') {
    return {
      ...(partialPdf.gateway
        ? { safety: projectedGatewaySafety(partialPdf.gateway) }
        : {}),
      ...(partialPdf.kind === 'valid'
        ? {
            sourceHoldReason: partialPdf.reason,
            partialPdfManifest: partialPdf.manifest,
            workflowIdentityAllowed: true,
          }
        : {
            invalidReason: partialPdf.reason,
            workflowIdentityAllowed: false,
          }),
    }
  }
  if (
    typeof data.text_input !== 'string' ||
    data.packet_plan === undefined ||
    data.source_pages === undefined
  ) {
    return {}
  }
  const decision = validatePersistedSourceSafetyAuthority(data)
  if (!decision.ok) {
    const gateway = decision.deterministicGateway
    if (!gateway) return { invalidReason: decision.reason }
    return {
      invalidReason: decision.reason,
      safety: {
        care_pathway: gateway.carePathway,
        review_requirement: gateway.reviewRequirement,
        clinician_hold: gateway.carePathway !== 'routine_outpatient',
        signals: gateway.signals.map((signal) => ({
          code: signal.code,
          syndrome: signal.syndrome,
          action: signal.action,
          evidence: signal.evidence.map(projectedEvidence),
        })),
      },
    }
  }

  const authority = decision.authority
  const modelReduceResult = parseJSON(data.model_reduce_result)
  const workflowPersistenceFailed =
    isRecord(modelReduceResult) &&
    modelReduceResult.kind === 'partial_safety_hold' &&
    modelReduceResult.mode === 'workflow_persistence_failed'
  const auditMode =
    isRecord(modelReduceResult) &&
    modelReduceResult.kind === 'partial_safety_hold' &&
    (modelReduceResult.mode === 'safety_checkpoint' ||
      modelReduceResult.mode === 'workflow_persistence_failed')
      ? modelReduceResult.mode
      : undefined
  const deterministic = authority.deterministicGateway
  const model = authority.longPacketSafety?.safetyResult
  const carePathway: CarePathway =
    deterministic.carePathway === 'emergency_now' ||
    model?.carePathway === 'emergency_now'
      ? 'emergency_now'
      : deterministic.carePathway === 'same_day_clinician_review' ||
          model?.carePathway === 'same_day_clinician_review'
        ? 'same_day_clinician_review'
        : model?.carePathway === 'undetermined'
          ? 'undetermined'
          : deterministic.carePathway
  const reviewRequirement: ReviewRequirement =
    carePathway === 'emergency_now'
      ? 'emergency_action'
      : carePathway === 'same_day_clinician_review' ||
          carePathway === 'undetermined'
        ? 'immediate_clinician_review'
        : 'clinician_confirmation'
  const signals = [
    ...deterministic.signals.map((signal) => ({
      code: signal.code,
      syndrome: signal.syndrome,
      action: signal.action,
      evidence: signal.evidence.map(projectedEvidence),
    })),
    ...(model?.signals ?? []).map((signal) => ({
      code: signal.code,
      syndrome: signal.syndrome,
      action: signal.action,
      evidence: signal.evidence.map(projectedEvidence),
    })),
  ]
  return {
    ...(workflowPersistenceFailed ? { workflowPersistenceFailed: true } : {}),
    ...(auditMode ? { auditMode } : {}),
    safety: {
      care_pathway: carePathway,
      review_requirement: reviewRequirement,
      clinician_hold: carePathway !== 'routine_outpatient',
      signals,
    },
  }
}

function structuredSafetyFields(
  safety: ClinicalExtraction['packet_safety'] | undefined,
  scoringBlocked: boolean,
  safetyWorkflowId?: string,
) {
  const safetyPathway =
    safety?.care_pathway === 'emergency_now' ||
    safety?.care_pathway === 'same_day_clinician_review'
      ? safety.care_pathway
      : undefined
  const humanReviewRequired =
    scoringBlocked || safety?.clinician_hold === true || safetyPathway !== undefined
  return {
    ...(safetyPathway ? { safety_pathway: safetyPathway } : {}),
    immediate_action_required: safetyPathway !== undefined,
    outpatient_scoring_blocked: scoringBlocked,
    human_review_required: humanReviewRequired,
    scheduling_locked: humanReviewRequired,
    ...(safetyWorkflowId
      ? { safety_triage_session_id: safetyWorkflowId }
      : {}),
  }
}

function partialPdfSafetyFields(projection: PacketSafetyProjection) {
  return {
    ...(projection.sourceHoldReason
      ? { source_hold_reason: projection.sourceHoldReason }
      : {}),
    ...(projection.partialPdfManifest
      ? {
          total_page_count: projection.partialPdfManifest.totalPageCount,
          available_page_numbers: [
            ...projection.partialPdfManifest.availablePageNumbers,
          ],
          missing_page_numbers: [
            ...projection.partialPdfManifest.missingPageNumbers,
          ],
        }
      : {}),
  }
}

function serializeLongPacketProgress(progress: LongPacketProgress) {
  return {
    run_status: progress.runStatus,
    expected_chunks: progress.expectedChunks,
    mapper: { ...progress.mapper },
    safety: { ...progress.safety },
    finalizer_status: progress.finalizerStatus,
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const access = await authorizeClinicalAccess({
    action: 'triage.read',
    allowedRoles: ['viewer', 'scheduler', 'clinician', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: clinicalAccessDeniedMessage(access.reason), reason: access.reason },
      { status: access.status },
    )
  }

  const { data, error } = await from('triage_extractions')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', access.context.tenantId)
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'Extraction not found' },
      { status: 404 },
    )
  }

  const status = (data.status as string | undefined) ?? 'complete'
  // Keep the normal pending poll cheap when its workflow is healthy. A
  // persisted checkpoint is always validated immediately; otherwise the
  // complete source gateway is revalidated only if workflow authority cannot
  // be read, so a database-read failure cannot erase a known emergency.
  let safetyProjection: PacketSafetyProjection =
    status === 'pending' &&
    data.model_reduce_result == null &&
    data.coverage_status !== 'failed'
      ? {}
      : packetSafety(data as Record<string, unknown>)
  const unpersistedSafetyPathway =
    parseLongPacketSafetyPersistenceFailure(data.error_message)
  if (unpersistedSafetyPathway) {
    const existingSafety = safetyProjection.safety
    if (
      !existingSafety ||
      safetyPathwayRank(unpersistedSafetyPathway) >
        safetyPathwayRank(existingSafety.care_pathway)
    ) {
      safetyProjection = {
        ...safetyProjection,
        safety: {
          care_pathway: unpersistedSafetyPathway,
          review_requirement:
            unpersistedSafetyPathway === 'emergency_now'
              ? 'emergency_action'
              : 'immediate_clinician_review',
          clinician_hold: true,
          signals: existingSafety?.signals ?? [],
        },
        evidencePersistenceFailed: true,
      }
    } else {
      safetyProjection = {
        ...safetyProjection,
        evidencePersistenceFailed: true,
      }
    }
  }
  const workflowRead =
    status === 'pending' ||
    data.ingestion_mode === 'long_packet' ||
    safetyProjection.safety?.clinician_hold === true
      ? await readSourceSafetyWorkflow(id, access.context.tenantId)
      : { status: 'absent' as const }
  if (
    status === 'pending' &&
    data.model_reduce_result == null &&
    (workflowRead.status === 'unavailable' ||
      workflowRead.status === 'inconsistent' ||
      (workflowRead.status === 'absent' &&
        persistedDeterministicSafetyMayBeActionable(
          data.packet_emergency_result,
        )))
  ) {
    safetyProjection = packetSafety(data as Record<string, unknown>)
    if (safetyProjection.safety?.care_pathway === 'routine_outpatient') {
      safetyProjection = {
        ...safetyProjection,
        safety: undefined,
      }
    }
  }
  const sourceSafetyWorkflow =
    workflowRead.status === 'found' ? workflowRead.workflow : undefined
  const safety = mergeSourceSafetyWorkflow(
    safetyProjection.safety,
    sourceSafetyWorkflow,
  )
  const actionableSourceHold =
    safety?.care_pathway === 'emergency_now' ||
    safety?.care_pathway === 'same_day_clinician_review'
  const workflowBelowSourceFloor =
    sourceSafetyWorkflow !== undefined &&
    safety !== undefined &&
    actionableSourceHold &&
    safetyPathwayRank(sourceSafetyWorkflow.carePathway) <
      safetyPathwayRank(safety.care_pathway)
  const workflowHoldReason =
    workflowBelowSourceFloor
      ? 'source_safety_workflow_inconsistent_manual_hold' as const
      : workflowRead.status === 'unavailable' ||
          workflowRead.status === 'inconsistent'
        ? workflowRead.reason
        : workflowRead.status === 'absent' && actionableSourceHold
          ? 'source_safety_workflow_inconsistent_manual_hold' as const
          : undefined
  const safetyWorkflowId =
    safetyProjection.workflowIdentityAllowed !== false &&
    sourceSafetyWorkflow &&
    safety &&
    safetyPathwayRank(sourceSafetyWorkflow.carePathway) >=
      safetyPathwayRank(safety.care_pathway)
      ? sourceSafetyWorkflow.id
      : undefined

  if (safetyProjection.invalidReason && status !== 'error') {
    return NextResponse.json({
      extraction_id: id,
      status: 'error',
      error:
        'Persisted extraction safety provenance could not be verified. Human review is required.',
      reason: safetyProjection.invalidReason,
      ingestion_mode: data.ingestion_mode ?? 'legacy_unknown',
      coverage_status: data.coverage_status ?? 'legacy_unknown',
      ...(safety ? { packet_safety: safety } : {}),
      ...partialPdfSafetyFields(safetyProjection),
      ...structuredSafetyFields(safety, true, safetyWorkflowId),
    })
  }

  let completedAuthority: ValidatedSourceExtractionAuthority | undefined
  const hasAuthorityEnvelope =
    data.ingestion_mode === 'single_pass' ||
    data.ingestion_mode === 'long_packet' ||
    data.source_pages !== undefined ||
    data.packet_plan !== undefined
  if (status === 'complete' && hasAuthorityEnvelope) {
    const authorityDecision = validatePersistedSourceExtractionAuthority(data)
    const missingSummary =
      authorityDecision.ok && !authorityDecision.authority.extractedSummary
    if (!authorityDecision.ok || missingSummary) {
      const reason = authorityDecision.ok
        ? 'source_extraction_summary_missing'
        : authorityDecision.reason
      return NextResponse.json({
        extraction_id: id,
        status: 'error',
        error:
          reason === 'source_extraction_summary_missing'
            ? 'The authoritative extraction summary is missing. Human review is required.'
            : 'Persisted extraction authority could not be verified. Human review is required.',
        reason,
        ingestion_mode: data.ingestion_mode ?? 'legacy_unknown',
        coverage_status: data.coverage_status ?? 'legacy_unknown',
        ...(safety ? { packet_safety: safety } : {}),
        ...partialPdfSafetyFields(safetyProjection),
        ...structuredSafetyFields(safety, true, safetyWorkflowId),
      })
    }
    completedAuthority = authorityDecision.authority
  }

  if (status === 'pending') {
    let longPacketProgress: ReturnType<
      typeof serializeLongPacketProgress
    > | null = null
    if (data.ingestion_mode === 'long_packet') {
      try {
        const progress = await readLongPacketProgress(await getPool(), {
          extractionId: id,
          tenantId: access.context.tenantId,
        })
        longPacketProgress = progress
          ? serializeLongPacketProgress(progress)
          : null
      } catch {
        console.error(
          '[triage/extract/poll] long-packet progress unavailable',
        )
      }
    }
    return NextResponse.json({
      extraction_id: id,
      status: 'pending',
      ...(workflowHoldReason
        ? { reason: workflowHoldReason }
        : safetyProjection.sourceHoldReason
          ? { reason: safetyProjection.sourceHoldReason }
          : {}),
      ...(safety ? { packet_safety: safety } : {}),
      ...partialPdfSafetyFields(safetyProjection),
      ...(safety || workflowHoldReason
          ? structuredSafetyFields(
            safety,
            workflowHoldReason !== undefined ||
              safetyProjection.sourceHoldReason !== undefined,
            safetyWorkflowId,
          )
        : {}),
      ...(longPacketProgress
        ? { long_packet_progress: longPacketProgress }
        : {}),
    })
  }

  if (status === 'error') {
    if (safetyProjection.workflowPersistenceFailed) {
      console.error(
        '[triage/extract/poll] model_safety_workflow_persistence_failed',
        {
          extractionId: id,
          tenantId: access.context.tenantId,
          safetyPathway: safety?.care_pathway,
        },
      )
    }
    if (safetyProjection.evidencePersistenceFailed) {
      console.error(
        '[triage/extract/poll] model_safety_evidence_persistence_failed',
        {
          extractionId: id,
          tenantId: access.context.tenantId,
          safetyPathway: safety?.care_pathway,
        },
      )
    }
    return NextResponse.json({
      extraction_id: id,
      status: 'error',
      error: data.error_message || 'Extraction failed',
      ...(safetyProjection.evidencePersistenceFailed
        ? { reason: MODEL_SAFETY_EVIDENCE_PERSISTENCE_FAILED_REASON }
        : safetyProjection.workflowPersistenceFailed
        ? { reason: MODEL_SAFETY_WORKFLOW_PERSISTENCE_FAILED_REASON }
        : workflowHoldReason
          ? { reason: workflowHoldReason }
          : safetyProjection.invalidReason
            ? { reason: safetyProjection.invalidReason }
            : safetyProjection.sourceHoldReason
              ? { reason: safetyProjection.sourceHoldReason }
            : {}),
      ingestion_mode: data.ingestion_mode ?? 'legacy_unknown',
      coverage_status: data.coverage_status ?? 'legacy_unknown',
      ...(safety ? { packet_safety: safety } : {}),
      ...partialPdfSafetyFields(safetyProjection),
      ...structuredSafetyFields(safety, true, safetyWorkflowId),
    })
  }

  const authoritativeOriginalText =
    completedAuthority?.rawText ?? data.text_input
  if (
    typeof authoritativeOriginalText !== 'string' ||
    !authoritativeOriginalText.trim()
  ) {
    return NextResponse.json({
      extraction_id: id,
      status: 'error',
      error:
        'The authoritative original source text is unavailable. Human review is required.',
      reason: 'source_extraction_original_text_missing',
      ingestion_mode: data.ingestion_mode ?? 'legacy_unknown',
      coverage_status: data.coverage_status ?? 'legacy_unknown',
      ...(safety ? { packet_safety: safety } : {}),
      ...structuredSafetyFields(safety, true, safetyWorkflowId),
    })
  }
  if (
    authoritativeOriginalText.length >
    FILE_CONSTRAINTS.MAX_PACKET_TEXT_LENGTH
  ) {
    return NextResponse.json({
      extraction_id: id,
      status: 'error',
      error:
        'The authoritative original source text exceeds the verified review limit. Human review is required.',
      reason: 'source_extraction_size_limit_exceeded',
      ingestion_mode: data.ingestion_mode ?? 'legacy_unknown',
      coverage_status: data.coverage_status ?? 'legacy_unknown',
      ...(safety ? { packet_safety: safety } : {}),
      ...structuredSafetyFields(safety, true, safetyWorkflowId),
    })
  }

  // status === 'complete' — return the same shape the synchronous POST returned.
  const extraction = {
    extraction_id: id,
    status: 'complete',
    note_type_detected:
      completedAuthority?.noteTypeDetected ??
      (data.note_type_detected as ClinicalExtraction['note_type_detected']),
    extraction_confidence:
      completedAuthority?.extractionConfidence ??
      (data.extraction_confidence as ClinicalExtraction['extraction_confidence']),
    extracted_summary:
      completedAuthority?.extractedSummary ?? data.extracted_summary,
    key_findings: parseJSON(data.key_findings),
    original_text: authoritativeOriginalText,
    original_text_length: authoritativeOriginalText.length,
    source_filename:
      completedAuthority?.sourceFilename ?? data.source_filename ?? undefined,
    ingestion_mode:
      completedAuthority?.ingestionMode ??
      (data.ingestion_mode as ClinicalExtraction['ingestion_mode']) ??
      'legacy_unknown',
    coverage_status:
      completedAuthority?.coverageStatus ??
      (data.coverage_status as ClinicalExtraction['coverage_status']) ??
      'legacy_unknown',
    ...(safety ? { packet_safety: safety } : {}),
    ...partialPdfSafetyFields(safetyProjection),
    ...(workflowHoldReason ? { reason: workflowHoldReason } : {}),
    ...(safety || workflowHoldReason
      ? structuredSafetyFields(
          safety,
          workflowHoldReason !== undefined,
          safetyWorkflowId,
        )
      : {}),
  }

  return NextResponse.json(extraction)
}
