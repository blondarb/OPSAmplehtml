import { randomUUID } from 'node:crypto'

import { NextResponse } from 'next/server'
import { invokeBedrockClinicalJSON, BEDROCK_MODEL } from '@/lib/bedrock'
import {
  parseUploadedFile,
  type FileParseError,
  type PartialParsedFile,
  type ParsedFilePage,
} from '@/lib/triage/fileParser'
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionUserPrompt } from '@/lib/triage/extractionPrompt'
import { FILE_CONSTRAINTS, type SourceType } from '@/lib/triage/types'
import type { ExtractionKeyFindings } from '@/lib/triage/types'
import { from } from '@/lib/db-query'
import { getPool } from '@/lib/db'
import { runInBackground } from '@/lib/triage/asyncRunner'
import { authorizeClinicalAccess, clinicalAccessDeniedMessage } from '@/lib/auth/clinicalAccess'
import { validateClinicalExtractionOutput } from '@/lib/triage/extractionValidation'
import {
  buildLongPacketIngestionArtifacts,
  longPacketPipelineToPersistedClinicalExtraction,
  type LongPacketIngestionArtifacts,
} from '@/lib/triage/longPacketIngestion'
import {
  LONG_PACKET_MODEL_PIPELINE_VERSION,
  LONG_PACKET_NARRATIVE_REDUCER_MODEL,
  LONG_PACKET_NARRATIVE_REDUCER_PROMPT_VERSION,
  LongPacketOutcomeCallbackError,
  runLongPacketModelPipeline,
} from '@/lib/triage/longPacketModelPipeline'
import {
  LONG_PACKET_CLINICAL_MAPPER_PROMPT_VERSION,
} from '@/lib/triage/longPacketClinicalMapper'
import { MODEL_SAFETY_EXTRACTION_PROMPT_VERSION } from '@/lib/triage/modelSafetyExtractor'
import { LONG_PACKET_EMERGENCY_VERSION } from '@/lib/triage/longPacketEmergency'
import { LONG_PACKET_PLANNER_VERSION } from '@/lib/triage/longPacketPlanner'
import { runClinicalModelWithTimeout } from '@/lib/triage/modelTimeout'
import { resolveTriageModelRegistry } from '@/lib/triage/modelRegistry'
import { createIngressSafetyWorkflow } from '@/lib/triage/ingressSafetyWorkflow'
import { notifyTriageUrgent } from '@/lib/notifications'
import { createPostgresLongPacketDurableWorkService } from '@/lib/triage/longPacketDurableWork'
import {
  deriveLongPacketPipelineSafetyResult,
  persistLongPacketSafetyEscalation,
  type LongPacketSafetyEscalationResult,
} from '@/lib/triage/longPacketSafetyEscalation'
import {
  deriveLongPacketMapperSafetyFloor,
  persistLongPacketPartialSafetyHold,
  persistLongPacketSafetyPersistenceFailureFloor,
  persistValidatedLongPacketAggregateFailure,
  persistValidatedLongPacketCompletion,
} from '@/lib/triage/longPacketPartialSafetyHold'
import {
  longPacketSafetyPersistenceFailureMessage,
  type ActionableLongPacketSafetyPathway,
} from '@/lib/triage/longPacketSafetyPersistenceFailure'
import {
  runEmergencyGateway,
  type EmergencyGatewayResult,
} from '@/lib/triage/emergencyGateway'
import { selectDominantBoundedSafetyEvidence } from '@/lib/triage/safetyEvidenceSelection'
import { screenPartialPdfEmergencyGateway } from '@/lib/triage/partialPdfSafetyAuthority'

const EXTRACTION_MODEL = process.env.BEDROCK_EXTRACTION_MODEL || BEDROCK_MODEL
const TRIAGE_MODELS = resolveTriageModelRegistry()
const MAX_INLINE_LONG_PACKET_CHUNKS = 80
const LONG_PACKET_DEADLINE_MS = 13 * 60 * 1_000
const SINGLE_PASS_EXTRACTION_DEADLINE_MS = 90_000
const SAFETY_ARTIFACT_PERSISTENCE_ATTEMPTS = 3
const MAX_PARTIAL_HOLD_SAFETY_SIGNALS = 20
const MAX_PARTIAL_HOLD_EVIDENCE_PER_SIGNAL = 5
const MAX_PARTIAL_HOLD_EVIDENCE_REEVALUATIONS = 64
const MAX_PARTIAL_HOLD_EVIDENCE_QUOTE_CHARACTERS = 2_000

class PersistedInlinePartialSafetyHoldError extends Error {
  readonly name = 'PersistedInlinePartialSafetyHoldError'

  constructor() {
    super('A source-bound partial safety hold was persisted.')
  }
}

class UnpersistedInlineSafetyEvidenceError extends Error {
  readonly name = 'UnpersistedInlineSafetyEvidenceError'

  constructor(readonly carePathway: ActionableLongPacketSafetyPathway) {
    super('Validated actionable safety evidence could not be persisted.')
  }
}

async function persistSafetyArtifactWithBoundedRetry(
  operation: () => Promise<{ ok: boolean }>,
): Promise<boolean> {
  for (let attempt = 0; attempt < SAFETY_ARTIFACT_PERSISTENCE_ATTEMPTS; attempt += 1) {
    try {
      if ((await operation()).ok) return true
    } catch {
      // Retry only the same exact, already-validated persistence input.
    }
  }
  return false
}

async function persistLongPacketSafetyEscalationFailClosed(
  input: Parameters<typeof persistLongPacketSafetyEscalation>[0],
): Promise<LongPacketSafetyEscalationResult> {
  try {
    return await persistLongPacketSafetyEscalation(input)
  } catch {
    console.error(
      '[triage/extract] long-packet safety escalation rejected unexpectedly',
    )
    return { ok: false, reason: 'persistence_failed' }
  }
}

async function checkpointThenEscalateLongPacketSafety(input: {
  extractionId: string
  tenantId: string
  plan: LongPacketIngestionArtifacts['plan']
  sourceSha256: string
  projection: Parameters<typeof persistLongPacketPartialSafetyHold>[0]['projection']
  escalation: Parameters<typeof persistLongPacketSafetyEscalation>[0]
}): Promise<LongPacketSafetyEscalationResult> {
  const escalated = await persistLongPacketSafetyEscalationFailClosed(
    {
      ...input.escalation,
      checkpoint: {
        kind: 'chunk_projection',
        plan: input.plan,
        sourceSha256: input.sourceSha256,
        projection: input.projection,
      },
    },
  )
  if (escalated.ok) return escalated

  const terminalPersisted = await persistSafetyArtifactWithBoundedRetry(() =>
    persistLongPacketPartialSafetyHold({
      extractionId: input.extractionId,
      tenantId: input.tenantId,
      plan: input.plan,
      sourceSha256: input.sourceSha256,
      mode: 'workflow_persistence_failed',
      projection: input.projection,
    }),
  )
  if (!terminalPersisted) {
    const carePathway = input.escalation.safetyResult.carePathway
    if (
      carePathway === 'emergency_now' ||
      carePathway === 'same_day_clinician_review'
    ) {
      const floorPersisted = await persistSafetyArtifactWithBoundedRetry(() =>
        persistLongPacketSafetyPersistenceFailureFloor({
          extractionId: input.extractionId,
          tenantId: input.tenantId,
          carePathway,
        }),
      )
      if (floorPersisted) {
        throw new PersistedInlinePartialSafetyHoldError()
      }
      throw new UnpersistedInlineSafetyEvidenceError(carePathway)
    }
    throw new Error('Validated inline safety evidence could not be held.')
  }
  throw new PersistedInlinePartialSafetyHoldError()
}

function isPersistedInlinePartialSafetyHoldError(error: unknown): boolean {
  return (
    error instanceof PersistedInlinePartialSafetyHoldError ||
    (error instanceof LongPacketOutcomeCallbackError &&
      error.cause instanceof PersistedInlinePartialSafetyHoldError)
  )
}

function unpersistedInlineSafetyPathway(
  error: unknown,
): ActionableLongPacketSafetyPathway | undefined {
  const candidate =
    error instanceof LongPacketOutcomeCallbackError ? error.cause : error
  return candidate instanceof UnpersistedInlineSafetyEvidenceError
    ? candidate.carePathway
    : undefined
}

function governedExtractionSafetyFields(input: {
  carePathway: string
  safetyTriageSessionId: string | null
}) {
  const safetyPathway =
    input.carePathway === 'emergency_now' ||
    input.carePathway === 'same_day_clinician_review'
      ? input.carePathway
      : undefined
  return {
    immediate_action_required: safetyPathway !== undefined,
    outpatient_scoring_blocked: true,
    human_review_required: true,
    scheduling_locked: true,
    safety_triage_session_id: input.safetyTriageSessionId,
    ...(safetyPathway ? { safety_pathway: safetyPathway } : {}),
  }
}

function extractionPacketSafety(
  gateway: LongPacketIngestionArtifacts['emergency'],
) {
  return {
    care_pathway: gateway.carePathway,
    review_requirement: gateway.reviewRequirement,
    clinician_hold: gateway.carePathway !== 'routine_outpatient',
    signals: gateway.signals.map((signal) => ({
      code: signal.code,
      syndrome: signal.syndrome,
      action: signal.action,
      evidence: signal.evidence.map((evidence) => ({
        quote: evidence.quote,
        documentId: evidence.documentId,
        pageNumber: evidence.pageNumber,
        startOffset: evidence.startOffset,
        endOffset: evidence.endOffset,
      })),
    })),
  }
}

type BoundedSafetyGateway = Pick<
  EmergencyGatewayResult,
  'carePathway' | 'reviewRequirement' | 'signals'
>

function boundedSafetyPacket(gateway: BoundedSafetyGateway) {
  return {
    care_pathway: gateway.carePathway,
    review_requirement: gateway.reviewRequirement,
    clinician_hold: true,
    signals: gateway.signals
      .slice(0, MAX_PARTIAL_HOLD_SAFETY_SIGNALS)
      .map((signal) => ({
        code: signal.code,
        syndrome: signal.syndrome,
        action: signal.action,
        evidence: selectDominantBoundedSafetyEvidence(signal, {
          maximumEvidence: MAX_PARTIAL_HOLD_EVIDENCE_PER_SIGNAL,
          maximumQuoteCharacters:
            MAX_PARTIAL_HOLD_EVIDENCE_QUOTE_CHARACTERS,
          maximumReevaluations:
            MAX_PARTIAL_HOLD_EVIDENCE_REEVALUATIONS,
        }),
      })),
  }
}

function durableLongPacketEnabled(): boolean {
  return process.env.TRIAGE_LONG_PACKET_DURABLE_ENABLED === 'true'
}

function durableMaxAttempts(): number {
  const value = Number(process.env.TRIAGE_LONG_PACKET_MAX_ATTEMPTS ?? '3')
  if (!Number.isSafeInteger(value) || value < 1 || value > 20) {
    throw new Error('Durable long-packet retry configuration is invalid.')
  }
  return value
}

type OptionalDemographicValidation<T> =
  | { ok: true; value: T | null }
  | { ok: false }

function validateOptionalPatientAge(
  value: unknown,
): OptionalDemographicValidation<number> {
  if (value === null || value === undefined) {
    return { ok: true, value: null }
  }

  let parsedAge: number
  if (typeof value === 'number') {
    parsedAge = value
  } else if (typeof value === 'string') {
    if (value.trim() === '') return { ok: true, value: null }
    if (!/^[0-9]+$/.test(value)) return { ok: false }
    parsedAge = Number(value)
  } else {
    return { ok: false }
  }

  if (
    !Number.isFinite(parsedAge) ||
    !Number.isInteger(parsedAge) ||
    parsedAge < 0 ||
    parsedAge > 130
  ) {
    return { ok: false }
  }
  return { ok: true, value: parsedAge }
}

type PatientSex = 'Male' | 'Female' | 'Other'
const PATIENT_SEX_VALUES = new Set<PatientSex>(['Male', 'Female', 'Other'])

function validateOptionalPatientSex(
  value: unknown,
): OptionalDemographicValidation<PatientSex> {
  if (value === null || value === undefined) {
    return { ok: true, value: null }
  }
  if (typeof value !== 'string') return { ok: false }
  if (value.trim() === '') return { ok: true, value: null }
  if (!PATIENT_SEX_VALUES.has(value as PatientSex)) return { ok: false }
  return { ok: true, value: value as PatientSex }
}

function invalidPatientAgeResponse() {
  return NextResponse.json(
    {
      error: 'patient_age must be a whole number from 0 through 130.',
      reason: 'invalid_patient_age',
    },
    { status: 400 },
  )
}

function invalidPatientSexResponse() {
  return NextResponse.json(
    {
      error: 'patient_sex must be Male, Female, or Other.',
      reason: 'invalid_patient_sex',
    },
    { status: 400 },
  )
}

type InvalidDemographicReason =
  | 'invalid_patient_age'
  | 'invalid_patient_sex'

function invalidDemographicMessage(reason: InvalidDemographicReason): string {
  return reason === 'invalid_patient_age'
    ? 'patient_age must be a whole number from 0 through 130.'
    : 'patient_sex must be Male, Female, or Other.'
}

function invalidDemographicResponse(reason: InvalidDemographicReason) {
  return reason === 'invalid_patient_age'
    ? invalidPatientAgeResponse()
    : invalidPatientSexResponse()
}

function positiveCompleteSourceSafetyArtifacts(input: {
  text: string
  pages?: ParsedFilePage[]
}): LongPacketIngestionArtifacts | undefined {
  if (
    !input.text.trim() ||
    input.text.length > FILE_CONSTRAINTS.MAX_PACKET_TEXT_LENGTH
  ) {
    return undefined
  }
  try {
    const artifacts = buildLongPacketIngestionArtifacts({
      packetId: randomUUID(),
      documentId: 'document-1',
      text: input.text,
      pages: input.pages,
      singlePassCharacterLimit: FILE_CONSTRAINTS.MAX_TEXT_LENGTH,
    })
    const gateway = artifacts.emergency
    return gateway.status === 'completed' &&
      (gateway.carePathway === 'emergency_now' ||
        gateway.carePathway === 'same_day_clinician_review')
      ? artifacts
      : undefined
  } catch {
    return undefined
  }
}

async function handleInvalidDemographicPositiveCompleteSource(input: {
  reason: InvalidDemographicReason
  artifacts: LongPacketIngestionArtifacts
  text: string
  sourceFilename: string | null
  sourceType: SourceType
  tenantId: string
}) {
  const gateway = input.artifacts.emergency
  const validationMessage = invalidDemographicMessage(input.reason)
  const commonResponse = {
    immediate_review_required: true,
    packet_safety: boundedSafetyPacket(gateway),
  }

  let extractionId: string | null = null
  try {
    const { data: inserted, error: insertError } = await from(
      'triage_extractions',
    )
      .insert({
        tenant_id: input.tenantId,
        text_input: input.text,
        source_filename: input.sourceFilename,
        patient_age: null,
        patient_sex: null,
        original_text_length: input.text.length,
        ingestion_mode: input.artifacts.ingestionMode,
        source_pages: JSON.stringify(input.artifacts.sourcePages),
        source_sha256: input.artifacts.sourceSha256,
        packet_plan: input.artifacts.plan,
        coverage_status: input.artifacts.plan.coverage.status,
        coverage_report: input.artifacts.plan.coverage,
        packet_emergency_result: gateway,
        safety_prompt_versions: {
          deterministicEmergency: gateway.version,
        },
        safety_screened_at: new Date(),
        ai_model_used: gateway.version,
        status: 'error',
        error_message: validationMessage,
        completed_at: new Date(),
      })
      .select('id')
      .single()
    if (!insertError && inserted?.id) extractionId = inserted.id as string
  } catch {
    extractionId = null
  }

  if (!extractionId) {
    console.error(
      '[triage/extract] invalid-demographic complete-source safety persistence failed',
    )
    return NextResponse.json(
      {
        error:
          'Time-critical source evidence was detected with invalid demographic metadata, but its safety record could not be persisted. Escalate manually now and correct the metadata before retrying.',
        reason: 'extraction_persistence_unavailable',
        validation_reason: input.reason,
        validation_error: validationMessage,
        ...commonResponse,
        ...governedExtractionSafetyFields({
          carePathway: gateway.carePathway,
          safetyTriageSessionId: null,
        }),
      },
      { status: 503 },
    )
  }

  let workflow: Awaited<ReturnType<typeof createIngressSafetyWorkflow>>
  try {
    workflow = await createIngressSafetyWorkflow({
      extractionId,
      tenantId: input.tenantId,
      sourceType: input.sourceType,
      gateway,
      modelProfile: gateway.version,
      coverageStatus: 'complete',
    })
  } catch {
    workflow = { ok: false, reason: 'persistence_failed' }
  }
  if (!workflow.ok) {
    console.error(
      '[triage/extract] invalid-demographic complete-source ingress safety workflow failed',
    )
    return NextResponse.json(
      {
        error:
          'Time-critical source evidence was detected with invalid demographic metadata, but its mandatory safety workflow is unavailable. Escalate manually now and correct the metadata before retrying.',
        reason: 'ingress_safety_workflow_unavailable',
        validation_reason: input.reason,
        validation_error: validationMessage,
        extraction_id: extractionId,
        ...commonResponse,
        ...governedExtractionSafetyFields({
          carePathway: gateway.carePathway,
          safetyTriageSessionId: null,
        }),
      },
      { status: 503 },
    )
  }

  try {
    await notifyTriageUrgent(
      workflow.triageSessionId,
      gateway.carePathway === 'emergency_now' ? 'emergent' : 'urgent',
      gateway.carePathway === 'emergency_now'
        ? 'EMERGENT — immediate action required'
        : 'SAME-DAY CLINICIAN REVIEW',
      'Complete-source screening created a mandatory safety workflow; invalid demographic metadata blocks extraction and outpatient scoring.',
      null,
      input.tenantId,
    )
  } catch {
    console.error(
      '[triage/extract] invalid-demographic complete-source safety notification failed',
    )
  }

  return NextResponse.json(
    {
      error: validationMessage,
      reason: input.reason,
      extraction_id: extractionId,
      ...commonResponse,
      ...governedExtractionSafetyFields({
        carePathway: gateway.carePathway,
        safetyTriageSessionId: workflow.triageSessionId,
      }),
    },
    { status: 400 },
  )
}

function exactlyOneReferralFileResponse() {
  return NextResponse.json(
    {
      error: 'Exactly one referral file is required.',
      reason: 'exactly_one_referral_file_required',
    },
    { status: 400 },
  )
}

function isBinaryFormDataValue(value: unknown): value is File {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as {
    name?: unknown
    size?: unknown
    type?: unknown
    arrayBuffer?: unknown
  }
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.size === 'number' &&
    typeof candidate.type === 'string' &&
    typeof candidate.arrayBuffer === 'function'
  )
}

function isFileParseError(value: unknown): value is FileParseError {
  return (
    value instanceof Error &&
    value.name === 'FileParseError' &&
    typeof (value as { code?: unknown }).code === 'string'
  )
}

function requestParseErrorResponse(parseErr: unknown) {
  if (isFileParseError(parseErr) && parseErr.code === 'OCR_REQUIRED') {
    const partial = parseErr.partialResult
    return NextResponse.json(
      {
        error: parseErr.message,
        reason: 'ocr_required',
        coverage_status: 'failed',
        missing_page_numbers: parseErr.pageNumbers ?? [],
        ...(partial
          ? {
              total_page_count: partial.totalPageCount,
              available_page_numbers: partial.pages.map(
                (page) => page.pageNumber,
              ),
            }
          : {}),
        immediate_review_required: false,
        ...governedExtractionSafetyFields({
          carePathway: 'routine_outpatient',
          safetyTriageSessionId: null,
        }),
      },
      { status: 422 },
    )
  }
  if (parseErr instanceof Error && parseErr.name === 'FileParseError') {
    const code = (parseErr as { code?: string }).code
    return NextResponse.json(
      {
        error: parseErr.message,
        ...(code === 'LONG_PACKET_REQUIRED'
          ? { reason: 'long_packet_pipeline_required' }
          : {}),
      },
      { status: code === 'LONG_PACKET_REQUIRED' ? 413 : 400 },
    )
  }
  const message =
    parseErr instanceof Error ? parseErr.message : 'Failed to parse request'
  return NextResponse.json({ error: message }, { status: 400 })
}

function partialPdfManualHoldResponse(input: {
  parseError: FileParseError
  partial: PartialParsedFile
  invalidDemographicReason?: InvalidDemographicReason
  safetyValidationReason?: string
}) {
  const invalidReason = input.invalidDemographicReason
  return NextResponse.json(
    {
      error: invalidReason
        ? invalidDemographicMessage(invalidReason)
        : input.parseError.message,
      reason: invalidReason ?? 'ocr_required',
      source_hold_reason: 'ocr_required',
      ...(input.safetyValidationReason
        ? { safety_validation_reason: input.safetyValidationReason }
        : {}),
      coverage_status: 'failed',
      total_page_count: input.partial.totalPageCount,
      available_page_numbers: input.partial.pages.map(
        (page) => page.pageNumber,
      ),
      missing_page_numbers: input.partial.missingPageNumbers,
      immediate_review_required: input.safetyValidationReason !== undefined,
      ...governedExtractionSafetyFields({
        carePathway: 'routine_outpatient',
        safetyTriageSessionId: null,
      }),
    },
    { status: invalidReason ? 400 : 422 },
  )
}

async function handlePartialPdfOcrRequired(input: {
  parseError: FileParseError
  partial: PartialParsedFile
  tenantId: string
  patientAge: number | null
  patientSex: PatientSex | null
  invalidDemographicReason?: InvalidDemographicReason
}) {
  const screen = screenPartialPdfEmergencyGateway(input.partial)
  if (screen.kind === 'invalid') {
    return partialPdfManualHoldResponse({
      parseError: input.parseError,
      partial: input.partial,
      ...(input.invalidDemographicReason
        ? { invalidDemographicReason: input.invalidDemographicReason }
        : {}),
      safetyValidationReason: screen.reason,
    })
  }
  if (!screen.gateway) {
    return partialPdfManualHoldResponse({
      parseError: input.parseError,
      partial: input.partial,
      ...(input.invalidDemographicReason
        ? { invalidDemographicReason: input.invalidDemographicReason }
        : {}),
    })
  }
  const gateway = screen.gateway

  const packetSafety = boundedSafetyPacket(gateway)
  const availablePageNumbers = input.partial.pages.map(
    (page) => page.pageNumber,
  )
  const coverageReport = {
    status: 'failed',
    reason: 'ocr_required',
    totalPageCount: input.partial.totalPageCount,
    availablePageNumbers,
    missingPageNumbers: input.partial.missingPageNumbers,
    nativeTextCharacterCount: input.partial.text.length,
  }
  const sourcePages = input.partial.pages.map((page) => ({
    documentId: 'document-1',
    ...page,
  }))

  let extractionId: string | null = null
  try {
    const { data: inserted, error: insertError } = await from(
      'triage_extractions',
    )
      .insert({
        tenant_id: input.tenantId,
        text_input: input.partial.text,
        source_filename: screen.sourceFilename,
        patient_age: input.invalidDemographicReason ? null : input.patientAge,
        patient_sex: input.invalidDemographicReason ? null : input.patientSex,
        original_text_length: input.partial.text.length,
        ingestion_mode: 'legacy_unknown',
        source_pages: JSON.stringify(sourcePages),
        source_sha256: null,
        packet_plan: null,
        coverage_status: 'failed',
        coverage_report: coverageReport,
        packet_emergency_result: gateway,
        safety_prompt_versions: {
          deterministicEmergency: gateway.version,
        },
        safety_screened_at: new Date(),
        ai_model_used: gateway.version,
        status: 'error',
        error_message: input.parseError.message,
        completed_at: new Date(),
      })
      .select('id')
      .single()
    if (!insertError && inserted?.id) extractionId = inserted.id as string
  } catch {
    extractionId = null
  }

  const commonResponse = {
    coverage_status: 'failed',
    total_page_count: input.partial.totalPageCount,
    available_page_numbers: availablePageNumbers,
    missing_page_numbers: input.partial.missingPageNumbers,
    immediate_review_required: true,
    packet_safety: packetSafety,
  }

  if (!extractionId) {
    console.error(
      '[triage/extract] partial-PDF emergency extraction persistence failed',
    )
    return NextResponse.json(
      {
        error:
          'Time-critical native text was detected, but the incomplete-source safety record could not be persisted. Escalate manually now and complete OCR.',
        reason: 'extraction_persistence_unavailable',
        source_hold_reason: 'ocr_required',
        ...commonResponse,
        ...governedExtractionSafetyFields({
          carePathway: gateway.carePathway,
          safetyTriageSessionId: null,
        }),
      },
      { status: 503 },
    )
  }

  let workflow: Awaited<ReturnType<typeof createIngressSafetyWorkflow>>
  try {
    workflow = await createIngressSafetyWorkflow({
      extractionId,
      tenantId: input.tenantId,
      sourceType: input.partial.sourceType,
      gateway,
      modelProfile: gateway.version,
      coverageStatus: 'failed',
    })
  } catch {
    workflow = { ok: false, reason: 'persistence_failed' }
  }
  if (!workflow.ok) {
    console.error(
      '[triage/extract] partial-PDF ingress safety workflow failed',
    )
    return NextResponse.json(
      {
        error:
          'Time-critical native text was detected, but its mandatory safety workflow is unavailable. Escalate manually now and complete OCR.',
        reason: 'ingress_safety_workflow_unavailable',
        source_hold_reason: 'ocr_required',
        extraction_id: extractionId,
        ...commonResponse,
        ...governedExtractionSafetyFields({
          carePathway: gateway.carePathway,
          safetyTriageSessionId: null,
        }),
      },
      { status: 503 },
    )
  }

  try {
    await notifyTriageUrgent(
      workflow.triageSessionId,
      gateway.carePathway === 'emergency_now' ? 'emergent' : 'urgent',
      gateway.carePathway === 'emergency_now'
        ? 'EMERGENT — immediate action required'
        : 'SAME-DAY CLINICIAN REVIEW',
      'Incomplete-PDF native-text screening created a mandatory safety workflow; OCR and human review remain required.',
      null,
      input.tenantId,
    )
  } catch {
    console.error(
      '[triage/extract] partial-PDF ingress safety notification failed',
    )
  }

  return NextResponse.json(
    {
      error: input.invalidDemographicReason
        ? invalidDemographicMessage(input.invalidDemographicReason)
        : input.parseError.message,
      reason: input.invalidDemographicReason ?? 'ocr_required',
      source_hold_reason: 'ocr_required',
      extraction_id: extractionId,
      ...commonResponse,
      ...governedExtractionSafetyFields({
        carePathway: gateway.carePathway,
        safetyTriageSessionId: workflow.triageSessionId,
      }),
    },
    { status: input.invalidDemographicReason ? 400 : 422 },
  )
}

export const maxDuration = 900

export async function POST(request: Request) {
  const access = await authorizeClinicalAccess({
    action: 'triage.extract',
    allowedRoles: ['clinician', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: clinicalAccessDeniedMessage(access.reason), reason: access.reason },
      { status: access.status },
    )
  }

  const contentType = request.headers.get('content-type') || ''

  let text = ''
  let sourceFilename: string | null = null
  let sourcePages: ParsedFilePage[] | undefined
  let sourceType: SourceType = 'paste'
  let uploadedFile: File | null = null
  let patientAgeInput: unknown = null
  let patientSexInput: unknown = null
  let duplicatePatientAgeField = false
  let duplicatePatientSexField = false

  try {
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const fileParts = formData.getAll('file')
      const canonicalFile = fileParts[0]
      const binaryEntries = Array.from(formData.entries()).filter(
        (entry): entry is [string, File] =>
          isBinaryFormDataValue(entry[1]),
      )
      if (
        fileParts.length !== 1 ||
        !isBinaryFormDataValue(canonicalFile) ||
        binaryEntries.length !== 1 ||
        binaryEntries[0][0] !== 'file'
      ) {
        return exactlyOneReferralFileResponse()
      }
      uploadedFile = canonicalFile

      const ageFields = formData.getAll('patient_age')
      duplicatePatientAgeField = ageFields.length > 1
      const sexFields = formData.getAll('patient_sex')
      duplicatePatientSexField = sexFields.length > 1
      patientAgeInput = ageFields[0] ?? null
      patientSexInput = sexFields[0] ?? null
    } else {
      const body: unknown = await request.json()
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return NextResponse.json({ error: 'text is required' }, { status: 400 })
      }
      const record = body as Record<string, unknown>
      if (!record.text || typeof record.text !== 'string') {
        return NextResponse.json({ error: 'text is required' }, { status: 400 })
      }
      text = record.text
      patientAgeInput = record.patient_age
      patientSexInput = record.patient_sex
    }
  } catch (parseErr) {
    return requestParseErrorResponse(parseErr)
  }

  const patientAgeValidation = duplicatePatientAgeField
    ? ({ ok: false } as const)
    : validateOptionalPatientAge(patientAgeInput)
  const patientSexValidation = duplicatePatientSexField
    ? ({ ok: false } as const)
    : validateOptionalPatientSex(patientSexInput)
  const invalidDemographicReason: InvalidDemographicReason | undefined =
    !patientAgeValidation.ok
      ? 'invalid_patient_age'
      : !patientSexValidation.ok
        ? 'invalid_patient_sex'
        : undefined

  if (uploadedFile) {
    try {
      const parsed = await parseUploadedFile(uploadedFile)
      text = parsed.text
      sourcePages = parsed.pages
      sourceFilename = parsed.filename ?? null
      sourceType = parsed.sourceType
    } catch (parseErr) {
      if (
        isFileParseError(parseErr) &&
        parseErr.code === 'OCR_REQUIRED' &&
        parseErr.partialResult
      ) {
        return handlePartialPdfOcrRequired({
          parseError: parseErr,
          partial: parseErr.partialResult,
          tenantId: access.context.tenantId,
          patientAge: patientAgeValidation.ok
            ? patientAgeValidation.value
            : null,
          patientSex: patientSexValidation.ok
            ? patientSexValidation.value
            : null,
          ...(invalidDemographicReason
            ? { invalidDemographicReason }
            : {}),
        })
      }
      return requestParseErrorResponse(parseErr)
    }
  }

  if (invalidDemographicReason) {
    const artifacts = positiveCompleteSourceSafetyArtifacts({
      text,
      pages: sourcePages,
    })
    return artifacts
      ? handleInvalidDemographicPositiveCompleteSource({
          reason: invalidDemographicReason,
          artifacts,
          text,
          sourceFilename,
          sourceType,
          tenantId: access.context.tenantId,
        })
      : invalidDemographicResponse(invalidDemographicReason)
  }

  // The branch above returns for every invalid validation result; repeat the
  // discriminant checks so TypeScript preserves the governed value types.
  if (!patientAgeValidation.ok) return invalidPatientAgeResponse()
  if (!patientSexValidation.ok) return invalidPatientSexResponse()
  const patientAge = patientAgeValidation.value
  const patientSex = patientSexValidation.value

  if (text.length > FILE_CONSTRAINTS.MAX_PACKET_TEXT_LENGTH) {
    return NextResponse.json(
      {
        error:
          'This source exceeds the maximum verified packet size and requires manual ingestion review.',
        reason: 'packet_size_limit_exceeded',
        source_character_count: text.length,
        verified_packet_limit: FILE_CONSTRAINTS.MAX_PACKET_TEXT_LENGTH,
      },
      { status: 413 },
    )
  }

  const belowMinimum = text.trim().length < 50
  const shortGateway = belowMinimum ? runEmergencyGateway(text) : undefined
  const shortTimeCritical = Boolean(
    shortGateway?.status === 'completed' &&
      (shortGateway.carePathway === 'emergency_now' ||
        shortGateway.carePathway === 'same_day_clinician_review'),
  )
  if (belowMinimum && !shortTimeCritical) {
    return NextResponse.json(
      { error: 'Text must be at least 50 characters for meaningful extraction.' },
      { status: 400 },
    )
  }

  const originalTextLength = text.length
  let artifacts: LongPacketIngestionArtifacts
  try {
    artifacts = buildLongPacketIngestionArtifacts({
      packetId: randomUUID(),
      documentId: 'document-1',
      text,
      pages: sourcePages,
      singlePassCharacterLimit: FILE_CONSTRAINTS.MAX_TEXT_LENGTH,
    })
  } catch {
    return NextResponse.json(
      {
        error:
          'Complete source-page coverage could not be proven. Manual review is required.',
        reason: 'source_coverage_unverified',
      },
      { status: 422 },
    )
  }

  const safetyPromptVersions = {
    planner: LONG_PACKET_PLANNER_VERSION,
    deterministicEmergency: LONG_PACKET_EMERGENCY_VERSION,
    clinicalMapper: LONG_PACKET_CLINICAL_MAPPER_PROMPT_VERSION,
    safetyExtractor: MODEL_SAFETY_EXTRACTION_PROMPT_VERSION,
    narrativeReducer: LONG_PACKET_NARRATIVE_REDUCER_PROMPT_VERSION,
    clinicalMapperModel: TRIAGE_MODELS.longPacketMapper,
    safetyExtractorModel: TRIAGE_MODELS.safetyExtractor,
    narrativeReducerModel: LONG_PACKET_NARRATIVE_REDUCER_MODEL,
  }

  // Insert pending extraction row.
  const { data: inserted, error: insertError } = await from('triage_extractions')
    .insert({
      tenant_id: access.context.tenantId,
      text_input: text,
      source_filename: sourceFilename,
      patient_age: patientAge,
      patient_sex: patientSex,
      original_text_length: originalTextLength,
      ingestion_mode: artifacts.ingestionMode,
      // db-query intentionally preserves JS arrays for PostgreSQL array
      // columns. source_pages is JSONB, so serialize it explicitly rather than
      // letting pg encode the page objects as a PostgreSQL array literal.
      source_pages: JSON.stringify(artifacts.sourcePages),
      source_sha256: artifacts.sourceSha256,
      packet_plan: artifacts.plan,
      coverage_status: artifacts.plan.coverage.status,
      coverage_report: artifacts.plan.coverage,
      packet_emergency_result: artifacts.emergency,
      safety_prompt_versions: safetyPromptVersions,
      safety_screened_at: new Date(),
      ai_model_used:
        artifacts.ingestionMode === 'long_packet'
          ? LONG_PACKET_MODEL_PIPELINE_VERSION
          : EXTRACTION_MODEL,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertError || !inserted?.id) {
    console.error('Extract init insert failed:', insertError)
    return NextResponse.json(
      {
        error:
          'The source was safety-screened, but extraction persistence is unavailable. Keep this referral on manual review and retry ingestion.',
        reason: 'extraction_persistence_unavailable',
        ...(artifacts.emergency.carePathway !== 'routine_outpatient'
          ? { packet_safety: extractionPacketSafety(artifacts.emergency) }
          : {}),
        ...governedExtractionSafetyFields({
          carePathway: artifacts.emergency.carePathway,
          safetyTriageSessionId: null,
        }),
      },
      { status: 503 },
    )
  }

  const extractionId = inserted.id as string
  let safetyTriageSessionId: string | null = null
  let durableRunId: string | null = null

  if (artifacts.emergency.carePathway !== 'routine_outpatient') {
    let workflow: Awaited<ReturnType<typeof createIngressSafetyWorkflow>>
    try {
      workflow = await createIngressSafetyWorkflow({
        extractionId,
        tenantId: access.context.tenantId,
        sourceType,
        gateway: artifacts.emergency,
        modelProfile:
          artifacts.ingestionMode === 'long_packet'
            ? LONG_PACKET_MODEL_PIPELINE_VERSION
            : EXTRACTION_MODEL,
      })
    } catch {
      console.error('[triage/extract] ingress safety workflow failed')
      workflow = { ok: false, reason: 'persistence_failed' }
    }
    if (!workflow.ok) {
      try {
        await from('triage_extractions')
          .update({
            status: 'error',
            error_message:
              'A time-critical source signal was detected, but its mandatory safety workflow could not be persisted. Immediate manual escalation is required.',
            completed_at: new Date(),
          })
          .eq('id', extractionId)
          .eq('tenant_id', access.context.tenantId)
      } catch {
        console.error('[triage/extract] failed to mark ingress safety error')
      }
      return NextResponse.json(
        {
          error:
            'Time-critical source signal detected; mandatory safety workflow unavailable. Escalate manually now.',
          reason: 'ingress_safety_workflow_unavailable',
          extraction_id: extractionId,
          packet_safety: extractionPacketSafety(artifacts.emergency),
          ...governedExtractionSafetyFields({
            carePathway: artifacts.emergency.carePathway,
            safetyTriageSessionId: null,
          }),
        },
        { status: 503 },
      )
    }
    safetyTriageSessionId = workflow.triageSessionId
    try {
      await notifyTriageUrgent(
        workflow.triageSessionId,
        artifacts.emergency.carePathway === 'emergency_now'
          ? 'emergent'
          : 'urgent',
        artifacts.emergency.carePathway === 'emergency_now'
          ? 'EMERGENT — immediate action required'
          : 'SAME-DAY CLINICIAN REVIEW',
        'Complete-source screening created a mandatory triage safety workflow before model extraction.',
        null,
        access.context.tenantId,
      )
    } catch {
      console.error('[triage/extract] ingress safety notification failed')
    }
  }

  if (belowMinimum) {
    const extractionBlockPersisted = await markError(
      extractionId,
      access.context.tenantId,
      'The referral is too short for outpatient extraction or scoring. Its time-critical safety pathway remains active for mandatory clinician action.',
    )
    if (!extractionBlockPersisted) {
      return NextResponse.json(
        {
          error:
            'The time-critical safety workflow is active, but the extraction scoring block could not be confirmed. Escalate manually now; do not poll or schedule from this response.',
          reason: 'short_referral_extraction_block_unavailable',
          packet_safety: extractionPacketSafety(artifacts.emergency),
          ...governedExtractionSafetyFields({
            carePathway: artifacts.emergency.carePathway,
            safetyTriageSessionId,
          }),
        },
        { status: 503 },
      )
    }
    return NextResponse.json(
      {
        error:
          'This short referral contains time-critical neurologic language. Complete the mandatory safety action now; outpatient scoring remains blocked.',
        reason: 'referral_text_below_minimum_time_critical',
        extraction_id: extractionId,
        packet_safety: extractionPacketSafety(artifacts.emergency),
        ...governedExtractionSafetyFields({
          carePathway: artifacts.emergency.carePathway,
          safetyTriageSessionId,
        }),
      },
      { status: 409 },
    )
  }

  if (
    artifacts.ingestionMode === 'long_packet' &&
    durableLongPacketEnabled()
  ) {
    try {
      const durable = createPostgresLongPacketDurableWorkService(await getPool())
      const run = await durable.initializeOrGetRun({
        extractionId,
        tenantId: access.context.tenantId,
        runPurpose: 'primary',
        sourceSha256: artifacts.sourceSha256,
        plan: artifacts.plan,
        configuration: {
          plannerVersion: LONG_PACKET_PLANNER_VERSION,
          pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
          mapperModelId: TRIAGE_MODELS.longPacketMapper,
          mapperPromptVersion: LONG_PACKET_CLINICAL_MAPPER_PROMPT_VERSION,
          safetyModelId: TRIAGE_MODELS.safetyExtractor,
          safetyPromptVersion: MODEL_SAFETY_EXTRACTION_PROMPT_VERSION,
          reducerModelId: LONG_PACKET_NARRATIVE_REDUCER_MODEL,
          reducerPromptVersion:
            LONG_PACKET_NARRATIVE_REDUCER_PROMPT_VERSION,
          maxAttempts: durableMaxAttempts(),
        },
      })
      durableRunId = run.runId
    } catch {
      console.error('[triage/extract] durable long-packet initialization failed')
      try {
        await from('triage_extractions')
          .update({
            status: 'error',
            error_message:
              'The durable complete-packet workflow could not be initialized. Keep this referral on manual review and retry ingestion.',
            completed_at: new Date(),
          })
          .eq('id', extractionId)
          .eq('tenant_id', access.context.tenantId)
      } catch {
        console.error('[triage/extract] durable initialization error was not persisted')
      }
      return NextResponse.json(
        {
          error:
            'The durable complete-packet workflow is unavailable. Keep this referral on manual review and retry ingestion.',
          reason: 'durable_long_packet_unavailable',
          extraction_id: extractionId,
          ...(artifacts.emergency.carePathway !== 'routine_outpatient'
            ? { packet_safety: extractionPacketSafety(artifacts.emergency) }
            : {}),
          ...governedExtractionSafetyFields({
            carePathway: artifacts.emergency.carePathway,
            safetyTriageSessionId,
          }),
        },
        { status: 503 },
      )
    }
  } else {
    runInBackground(() =>
      processExtractionInBackground(
        extractionId,
        text,
        {
          patientAge: patientAge ?? undefined,
          patientSex: patientSex ?? undefined,
          sourceFilename: sourceFilename ?? undefined,
        },
        access.context.tenantId,
        artifacts,
        safetyPromptVersions,
      ),
    )
  }

  return NextResponse.json(
    {
      extraction_id: extractionId,
      status: 'pending',
      ingestion_mode: artifacts.ingestionMode,
      safety_pathway: artifacts.emergency.carePathway,
      immediate_review_required:
        artifacts.emergency.carePathway !== 'routine_outpatient',
      safety_triage_session_id: safetyTriageSessionId,
      ...(durableRunId
        ? { processing_mode: 'durable_distributed', durable_run_id: durableRunId }
        : {}),
    },
    { status: 202 },
  )
}

async function processExtractionInBackground(
  extractionId: string,
  text: string,
  meta: { patientAge?: number; patientSex?: string; sourceFilename?: string },
  tenantId: string,
  artifacts: LongPacketIngestionArtifacts,
  safetyPromptVersions: Record<string, string>,
): Promise<void> {
  try {
    if (artifacts.ingestionMode === 'long_packet') {
      if (artifacts.plan.chunks.length > MAX_INLINE_LONG_PACKET_CHUNKS) {
        await from('triage_extractions')
          .update({
            status: 'error',
            error_message:
              'The complete packet was preserved and emergency-screened, but it exceeds the verified inline model-worker capacity. Keep this referral on immediate human review until the durable distributed worker is configured.',
            completed_at: new Date(),
          })
          .eq('id', extractionId)
          .eq('tenant_id', tenantId)
        return
      }

      const pipeline = await runClinicalModelWithTimeout({
        label: 'long_packet_model_pipeline',
        timeoutMs: LONG_PACKET_DEADLINE_MS,
        operation: (signal) =>
          runLongPacketModelPipeline(artifacts.plan, {
            signal,
            onSafetyOutcome: async (outcome) => {
              if (
                !outcome.result ||
                outcome.result.carePathway === 'no_time_critical_signal'
              ) {
                return
              }
              const escalation = {
                extractionId,
                tenantId,
                jobId: `inline-safety:${extractionId}:${outcome.chunkProvenanceSha256}`,
                chunkId: outcome.chunkId,
                safetyResult: outcome.result,
                modelProfile: TRIAGE_MODELS.safetyExtractor,
                promptVersion: MODEL_SAFETY_EXTRACTION_PROMPT_VERSION,
                pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
              }
              if (outcome.result.carePathway === 'undetermined') {
                const escalated =
                  await persistLongPacketSafetyEscalationFailClosed(escalation)
                if (!escalated.ok) {
                  throw new Error(
                    'Undetermined inline safety hold could not be persisted.',
                  )
                }
                return
              }
              await checkpointThenEscalateLongPacketSafety({
                extractionId,
                tenantId,
                plan: artifacts.plan,
                sourceSha256: artifacts.sourceSha256,
                projection: {
                    outcome,
                    modelProfile: TRIAGE_MODELS.safetyExtractor,
                    promptVersion: MODEL_SAFETY_EXTRACTION_PROMPT_VERSION,
                    pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
                },
                escalation,
              })
            },
            onMapperOutcome: async (mapper) => {
              if (!mapper.result) return
              let mapperSafety
              try {
                mapperSafety = deriveLongPacketMapperSafetyFloor(mapper)
              } catch {
                return
              }
              await checkpointThenEscalateLongPacketSafety({
                extractionId,
                tenantId,
                plan: artifacts.plan,
                sourceSha256: artifacts.sourceSha256,
                projection: {
                    outcome: mapper,
                    modelProfile: TRIAGE_MODELS.longPacketMapper,
                    promptVersion: LONG_PACKET_CLINICAL_MAPPER_PROMPT_VERSION,
                    pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
                },
                escalation: {
                  extractionId,
                  tenantId,
                  jobId: `inline-mapper:${extractionId}:${mapper.chunkProvenanceSha256}`,
                  chunkId: mapper.chunkId,
                  safetyResult: mapperSafety,
                  modelProfile: TRIAGE_MODELS.longPacketMapper,
                  promptVersion: LONG_PACKET_CLINICAL_MAPPER_PROMPT_VERSION,
                  pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
                },
              })
            },
          }),
      })

      const pipelineComplete =
        pipeline.status === 'completed' &&
        pipeline.coverageStatus === 'complete'
      const clinical = pipelineComplete
        ? longPacketPipelineToPersistedClinicalExtraction({
            pipeline,
            deterministicGateway: artifacts.emergency,
          })
        : null
      const extractedSummary = clinical?.extractedSummary ?? null
      const keyFindings = clinical?.keyFindings ?? null

      const aggregateSafety = deriveLongPacketPipelineSafetyResult(pipeline)
      const escalated = await persistLongPacketSafetyEscalationFailClosed({
        extractionId,
        tenantId,
        jobId: `inline-finalize:${extractionId}`,
        chunkId: 'inline-finalization',
        safetyResult: aggregateSafety,
        modelProfile: TRIAGE_MODELS.safetyExtractor,
        promptVersion: MODEL_SAFETY_EXTRACTION_PROMPT_VERSION,
        pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
        ...((aggregateSafety.carePathway === 'emergency_now' ||
          aggregateSafety.carePathway === 'same_day_clinician_review')
          ? {
              checkpoint: {
                kind: 'validated_pipeline' as const,
                plan: artifacts.plan,
                sourceSha256: artifacts.sourceSha256,
                safetyPromptVersions,
                modelMapResult: pipeline.mapperCoverage,
                modelReduceResult: pipeline,
              },
            }
          : {}),
      })
      if (!escalated.ok) {
        const errorMessage =
          'Validated long-packet model safety could not be persisted to its mandatory workflow. Keep this referral on immediate human review.'
        if (clinical && extractedSummary && keyFindings) {
          const held = await persistSafetyArtifactWithBoundedRetry(() =>
            persistValidatedLongPacketCompletion({
              extractionId,
              tenantId,
              plan: artifacts.plan,
              sourceSha256: artifacts.sourceSha256,
              safetyPromptVersions,
              modelMapResult: pipeline.mapperCoverage,
              modelReduceResult: pipeline,
              noteTypeDetected: clinical.noteTypeDetected,
              extractionConfidence: clinical.extractionConfidence,
              extractedSummary,
              keyFindings,
              terminalErrorMessage: errorMessage,
            }),
          )
          if (!held) {
            const carePathway =
              aggregateSafety.carePathway as ActionableLongPacketSafetyPathway
            const floorPersisted =
              await persistSafetyArtifactWithBoundedRetry(() =>
                persistLongPacketSafetyPersistenceFailureFloor({
                  extractionId,
                  tenantId,
                  carePathway,
                }),
              )
            if (!floorPersisted) {
              await markError(
                extractionId,
                tenantId,
                longPacketSafetyPersistenceFailureMessage(carePathway),
              )
            }
          }
        } else if (
          pipeline.status === 'partial' &&
          pipeline.coverageStatus === 'partial' &&
          (aggregateSafety.carePathway === 'emergency_now' ||
            aggregateSafety.carePathway === 'same_day_clinician_review')
        ) {
          const held = await persistSafetyArtifactWithBoundedRetry(() =>
            persistValidatedLongPacketAggregateFailure({
              extractionId,
              tenantId,
              plan: artifacts.plan,
              sourceSha256: artifacts.sourceSha256,
              safetyPromptVersions,
              modelMapResult: pipeline.mapperCoverage,
              modelReduceResult: pipeline,
              terminalErrorMessage: errorMessage,
            }),
          )
          if (!held) {
            const carePathway =
              aggregateSafety.carePathway as ActionableLongPacketSafetyPathway
            const floorPersisted =
              await persistSafetyArtifactWithBoundedRetry(() =>
                persistLongPacketSafetyPersistenceFailureFloor({
                  extractionId,
                  tenantId,
                  carePathway,
                }),
              )
            if (!floorPersisted) {
              await markError(
                extractionId,
                tenantId,
                longPacketSafetyPersistenceFailureMessage(
                  carePathway,
                ),
              )
            }
          }
        } else {
          await markError(extractionId, tenantId, errorMessage)
        }
        return
      }

      if (!pipelineComplete || !clinical || !extractedSummary || !keyFindings) {
        await markError(
          extractionId,
          tenantId,
          'Long-packet model coverage was incomplete. Source-bound safety evidence was preserved; do not use a generated summary for scheduling or routine triage.',
        )
        return
      }

      const completed = await persistValidatedLongPacketCompletion({
        extractionId,
        tenantId,
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        safetyPromptVersions,
        modelMapResult: pipeline.mapperCoverage,
        modelReduceResult: pipeline,
        noteTypeDetected: clinical.noteTypeDetected,
        extractionConfidence: clinical.extractionConfidence,
        extractedSummary,
        keyFindings,
      })
      if (!completed.ok) {
        await markError(
          extractionId,
          tenantId,
          'Validated long-packet completion could not safely replace its source-bound safety checkpoint. Human review is required.',
        )
      }
      return
    }

    const userPrompt = buildExtractionUserPrompt(text, meta)

    const result = await runClinicalModelWithTimeout({
      label: 'single_pass_extraction',
      timeoutMs: SINGLE_PASS_EXTRACTION_DEADLINE_MS,
      operation: (signal) =>
        invokeBedrockClinicalJSON<{
          note_type_detected: string
          extraction_confidence: string
          extracted_summary: string
          key_findings: ExtractionKeyFindings
        }>({
          system: EXTRACTION_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
          maxTokens: 4096,
          temperature: 0.2,
          model: EXTRACTION_MODEL,
          signal,
        }),
    })

    const aiResponse = validateClinicalExtractionOutput(result.parsed)
    const toJSON = (v: unknown) => (v != null ? JSON.stringify(v) : null)

    await from('triage_extractions')
      .update({
        note_type_detected: aiResponse.note_type_detected,
        extraction_confidence: aiResponse.extraction_confidence,
        extracted_summary: aiResponse.extracted_summary,
        key_findings: toJSON(aiResponse.key_findings),
        ai_input_tokens: result.inputTokens ?? null,
        ai_output_tokens: result.outputTokens ?? null,
        status: 'complete',
        completed_at: new Date(),
      })
      .eq('id', extractionId)
      .eq('tenant_id', tenantId)
  } catch (error: unknown) {
    const unpersistedSafetyPathway =
      unpersistedInlineSafetyPathway(error)
    if (unpersistedSafetyPathway) {
      const floorPersisted = await persistSafetyArtifactWithBoundedRetry(() =>
        persistLongPacketSafetyPersistenceFailureFloor({
          extractionId,
          tenantId,
          carePathway: unpersistedSafetyPathway,
        }),
      )
      if (!floorPersisted) {
        await markError(
          extractionId,
          tenantId,
          longPacketSafetyPersistenceFailureMessage(
            unpersistedSafetyPathway,
          ),
        )
      }
      return
    }
    if (isPersistedInlinePartialSafetyHoldError(error)) {
      return
    }
    console.error('Background extraction failed:', error)
    let message = 'Extraction failed'
    if (error instanceof Error) {
      const raw = error.message
      if (
        raw.includes('credential') ||
        raw.includes('Could not load') ||
        raw.includes('AWS') ||
        raw.includes('Bedrock')
      ) {
        message =
          'The extraction service is temporarily unavailable. Please try again shortly.'
      } else {
        message = raw
      }
    }
    await markError(extractionId, tenantId, message)
  }
}

async function markError(
  extractionId: string,
  tenantId: string,
  message: string,
): Promise<boolean> {
  try {
    const result = await from('triage_extractions')
      .update({
        status: 'error',
        error_message: message,
        completed_at: new Date(),
      })
      .eq('id', extractionId)
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .select('id')
      .single()
    if (result.error || !result.data || result.data.id !== extractionId) {
      console.error('Failed to mark triage_extractions row as error')
      return false
    }
    return true
  } catch (e) {
    console.error('Failed to mark triage_extractions row as error:', e)
    return false
  }
}
