import {
  canonicalLongPacketJSONStringify,
  hashLongPacketEmergency,
  hashLongPacketPlan,
} from './longPacketCanonicalHash'
import {
  longPacketSourceDigest,
  longPacketPipelineToPersistedClinicalExtraction,
  type PersistedLongPacketSourcePage,
  type ValidatedLongPacketSafetyArtifacts,
  validateLongPacketFullPipelinePromptBindings,
  validatePersistedLongPacketModelSafetyArtifacts,
} from './longPacketIngestion'
import {
  runEmergencyGateway,
  type EmergencyGatewayResult,
} from './emergencyGateway'
import {
  scanLongPacketEmergency,
  type LongPacketEmergencyResult,
} from './longPacketEmergency'
import {
  assertCompleteLongPacketCoverage,
  DEFAULT_LONG_PACKET_PLANNER_OPTIONS,
  planLongPacketChunks,
  type LongPacketPlan,
  type LongPacketSourceDocument,
} from './longPacketPlanner'
import {
  validatePersistedLongPacketAggregateSafety,
  validatePersistedLongPacketSafetyBranch,
} from './longPacketModelPipeline'
import { validateLongPacketPartialSafetyHold } from './longPacketPartialSafetyHold'
import {
  FILE_CONSTRAINTS,
  type NoteType,
  type SourceType,
  type TriageConfidence,
} from './types'
import { SCANNED_PACKET_MAX_PAGES } from './scannedPacketIngestion'

export type SourceExtractionAuthorityRow = Record<string, unknown>

export type GovernedSourceSafetyPathway =
  | 'emergency_now'
  | 'same_day_clinician_review'

export type SourceFailureEmergencyGateway =
  | LongPacketEmergencyResult
  | EmergencyGatewayResult

export type SourceExtractionAuthorityFailureReason =
  | 'source_extraction_not_found'
  | 'source_extraction_not_complete'
  | 'source_extraction_coverage_incomplete'
  | 'source_extraction_manifest_invalid'
  | 'source_extraction_digest_invalid'
  | 'source_extraction_packet_plan_invalid'
  | 'source_extraction_packet_safety_invalid'
  | 'source_extraction_source_type_invalid'
  | 'source_extraction_ingestion_mode_invalid'
  | 'source_extraction_summary_missing'
  | 'source_extraction_metadata_invalid'
  | 'source_extraction_size_limit_exceeded'

export interface ValidatedSourceExtractionAuthority {
  rawText: string
  sourceType: SourceType
  sourceFilename: string | undefined
  extractedSummary: string | undefined
  patientAge: number | undefined
  patientSex: 'Male' | 'Female' | 'Other' | undefined
  extractionConfidence: TriageConfidence | undefined
  noteTypeDetected: NoteType | undefined
  ingestionMode: 'single_pass' | 'long_packet'
  coverageStatus: 'complete'
  sourcePages: PersistedLongPacketSourcePage[]
  sourceSha256: string
  packetPlan: LongPacketPlan
  modelMapResult: unknown
  modelReduceResult: unknown
  deterministicGateway: LongPacketEmergencyResult
  longPacketSafety?: ValidatedLongPacketSafetyArtifacts
}

export interface SourceExtractionAuthorityValidationDependencies {
  planLongPacketChunks: typeof planLongPacketChunks
  scanLongPacketEmergency: typeof scanLongPacketEmergency
  hashLongPacketPlan: typeof hashLongPacketPlan
  hashLongPacketEmergency: typeof hashLongPacketEmergency
  longPacketSourceDigest: typeof longPacketSourceDigest
  assertCompleteLongPacketCoverage: typeof assertCompleteLongPacketCoverage
}

const DEFAULT_VALIDATION_DEPENDENCIES: SourceExtractionAuthorityValidationDependencies = {
  planLongPacketChunks,
  scanLongPacketEmergency,
  hashLongPacketPlan,
  hashLongPacketEmergency,
  longPacketSourceDigest,
  assertCompleteLongPacketCoverage,
}

export type SourceExtractionAuthorityDecision =
  | { ok: true; authority: ValidatedSourceExtractionAuthority }
  | {
      ok: false
      reason: SourceExtractionAuthorityFailureReason
      outpatientScoringBlocked: true
      humanReviewRequired: true
      immediateActionRequired: boolean
      safetyPathway?: GovernedSourceSafetyPathway
      deterministicGateway?: SourceFailureEmergencyGateway
    }

export interface ValidatedSourceSafetyAuthority {
  rawText: string
  ingestionMode: 'single_pass' | 'long_packet'
  sourcePages: PersistedLongPacketSourcePage[]
  sourceSha256: string
  packetPlan: LongPacketPlan
  modelMapResult: unknown
  modelReduceResult: unknown
  deterministicGateway: LongPacketEmergencyResult
  longPacketSafety?: ValidatedLongPacketSafetyArtifacts
}

export type SourceSafetyAuthorityDecision =
  | { ok: true; authority: ValidatedSourceSafetyAuthority }
  | Extract<SourceExtractionAuthorityDecision, { ok: false }>

const NOTE_TYPES = new Set<NoteType>([
  'ed_note',
  'pcp_note',
  'discharge_summary',
  'specialist_consult',
  'imaging_report',
  'referral',
  'unknown',
])
const EXTRACTION_CONFIDENCES = new Set<TriageConfidence>([
  'high',
  'moderate',
  'low',
])
const PATIENT_SEXES = new Set(['Male', 'Female', 'Other'] as const)
const SOURCE_PAGE_KEYS = [
  'documentId',
  'extractionConfidence',
  'extractionMethod',
  'pageNumber',
  'text',
] as const
const MAX_AUTHORITY_IDENTIFIER_LENGTH = 200
const MAX_PERSISTED_ARTIFACT_CHARACTERS =
  FILE_CONSTRAINTS.MAX_FILE_SIZE_BYTES
const MAX_PERSISTED_ARTIFACT_NODES = 250_000
const MIN_DEFAULT_CHUNK_ADVANCE =
  Math.floor(DEFAULT_LONG_PACKET_PLANNER_OPTIONS.maxChunkCharacters * 0.6) -
  DEFAULT_LONG_PACKET_PLANNER_OPTIONS.overlapCharacters
const MAX_AUTHORITY_CHUNK_COUNT =
  Math.ceil(
    FILE_CONSTRAINTS.MAX_PACKET_TEXT_LENGTH / MIN_DEFAULT_CHUNK_ADVANCE,
  ) + 1

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsePersistedJSON(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function shallowArrayLength(
  value: unknown,
  field: string,
): number | undefined {
  const parsed = parsePersistedJSON(value)
  if (!isRecord(parsed) || !Array.isArray(parsed[field])) return undefined
  return parsed[field].length
}

function boundedArtifactShape(value: unknown): boolean {
  const stack: Array<{ value: unknown; depth: number }> = [
    { value, depth: 0 },
  ]
  const visited = new WeakSet<object>()
  let nodes = 0
  let stringCharacters = 0
  while (stack.length > 0) {
    const current = stack.pop()!
    nodes += 1
    if (
      nodes > MAX_PERSISTED_ARTIFACT_NODES ||
      current.depth > 100
    ) {
      return false
    }
    if (typeof current.value === 'string') {
      stringCharacters += current.value.length
      if (stringCharacters > MAX_PERSISTED_ARTIFACT_CHARACTERS) return false
      continue
    }
    if (
      typeof current.value !== 'object' ||
      current.value === null
    ) {
      continue
    }
    if (visited.has(current.value)) continue
    visited.add(current.value)
    const entries = Array.isArray(current.value)
      ? current.value.map((item) => ['', item] as const)
      : Object.entries(current.value)
    for (const [key, item] of entries) {
      stringCharacters += key.length
      if (stringCharacters > MAX_PERSISTED_ARTIFACT_CHARACTERS) return false
      stack.push({ value: item, depth: current.depth + 1 })
    }
  }
  return true
}

function passesSourceAuthorityPreflight(
  row: SourceExtractionAuthorityRow,
): boolean {
  if (
    typeof row.text_input !== 'string' ||
    row.text_input.length > FILE_CONSTRAINTS.MAX_PACKET_TEXT_LENGTH ||
    !row.text_input.trim()
  ) {
    return false
  }
  for (const value of [row.source_pages]) {
    if (
      typeof value === 'string' &&
      value.length > MAX_PERSISTED_ARTIFACT_CHARACTERS
    ) {
      return false
    }
    if (!boundedArtifactShape(parsePersistedJSON(value))) {
      return false
    }
  }
  if (
    Array.isArray(row.source_pages) &&
    row.source_pages.length > SCANNED_PACKET_MAX_PAGES
  ) {
    return false
  }
  return true
}

function passesAuxiliaryArtifactPreflight(
  row: SourceExtractionAuthorityRow,
): boolean {
  for (const value of [
    row.coverage_report,
    row.packet_plan,
    row.packet_emergency_result,
  ]) {
    if (
      typeof value === 'string' &&
      value.length > MAX_PERSISTED_ARTIFACT_CHARACTERS
    ) {
      return false
    }
    if (!boundedArtifactShape(parsePersistedJSON(value))) return false
  }
  return (
    (shallowArrayLength(row.packet_plan, 'chunks') ?? 0) <=
    MAX_AUTHORITY_CHUNK_COUNT
  )
}

type ModelArtifactPreflightDecision =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'source_extraction_size_limit_exceeded'
        | 'source_extraction_packet_safety_invalid'
    }

function validateModelArtifactPreflight(
  row: SourceExtractionAuthorityRow,
): ModelArtifactPreflightDecision {
  const parsed: Partial<
    Record<
      | 'model_map_result'
      | 'model_reduce_result'
      | 'safety_prompt_versions',
      unknown
    >
  > = {}
  for (const field of [
    'model_map_result',
    'model_reduce_result',
    'safety_prompt_versions',
  ] as const) {
    const value = row[field]
    if (value === null || value === undefined) continue
    if (
      typeof value === 'string' &&
      value.length > MAX_PERSISTED_ARTIFACT_CHARACTERS
    ) {
      return { ok: false, reason: 'source_extraction_size_limit_exceeded' }
    }
    try {
      parsed[field] =
        typeof value === 'string' ? JSON.parse(value) : value
    } catch {
      return {
        ok: false,
        reason: 'source_extraction_packet_safety_invalid',
      }
    }
    if (!boundedArtifactShape(parsed[field])) {
      return { ok: false, reason: 'source_extraction_size_limit_exceeded' }
    }
    if (!isRecord(parsed[field])) {
      return {
        ok: false,
        reason: 'source_extraction_packet_safety_invalid',
      }
    }
    try {
      canonicalLongPacketJSONStringify(parsed[field])
    } catch {
      return {
        ok: false,
        reason: 'source_extraction_packet_safety_invalid',
      }
    }
  }

  const reduce = parsed.model_reduce_result
  if (
    (shallowArrayLength(reduce, 'mapperOutcomes') ?? 0) >
      MAX_AUTHORITY_CHUNK_COUNT ||
    (shallowArrayLength(reduce, 'safetyOutcomes') ?? 0) >
      MAX_AUTHORITY_CHUNK_COUNT ||
    (shallowArrayLength(reduce, 'projections') ?? 0) >
      MAX_AUTHORITY_CHUNK_COUNT * 2 + 1
  ) {
    return { ok: false, reason: 'source_extraction_size_limit_exceeded' }
  }
  return { ok: true }
}

function canonicalEquals(left: unknown, right: unknown): boolean {
  try {
    return (
      canonicalLongPacketJSONStringify(left) ===
      canonicalLongPacketJSONStringify(right)
    )
  } catch {
    return false
  }
}

function emergencyHashesMatch(
  left: unknown,
  right: unknown,
  dependencies: SourceExtractionAuthorityValidationDependencies,
): boolean {
  try {
    return (
      dependencies.hashLongPacketEmergency(left) ===
      dependencies.hashLongPacketEmergency(right)
    )
  } catch {
    return false
  }
}

function governedSafetyPathway(
  gateway: SourceFailureEmergencyGateway | undefined,
  modelCarePathway?: string,
): GovernedSourceSafetyPathway | undefined {
  if (
    gateway?.carePathway === 'emergency_now' ||
    modelCarePathway === 'emergency_now'
  ) {
    return 'emergency_now'
  }
  if (
    gateway?.carePathway === 'same_day_clinician_review' ||
    modelCarePathway === 'same_day_clinician_review'
  ) {
    return 'same_day_clinician_review'
  }
  return undefined
}

function blocked(
  reason: SourceExtractionAuthorityFailureReason,
  deterministicGateway?: SourceFailureEmergencyGateway,
  modelCarePathway?: string,
): SourceExtractionAuthorityDecision {
  const safetyPathway = governedSafetyPathway(
    deterministicGateway,
    modelCarePathway,
  )
  return {
    ok: false,
    reason,
    outpatientScoringBlocked: true,
    humanReviewRequired: true,
    immediateActionRequired: safetyPathway !== undefined,
    ...(safetyPathway ? { safetyPathway } : {}),
    ...(deterministicGateway ? { deterministicGateway } : {}),
  }
}

function positiveRawTextEmergencyGateway(
  rawText: unknown,
): EmergencyGatewayResult | undefined {
  if (
    typeof rawText !== 'string' ||
    !rawText.trim() ||
    rawText.length > FILE_CONSTRAINTS.MAX_PACKET_TEXT_LENGTH
  ) {
    return undefined
  }
  const gateway = runEmergencyGateway(rawText)
  if (
    gateway.status !== 'completed' ||
    (gateway.carePathway !== 'emergency_now' &&
      gateway.carePathway !== 'same_day_clinician_review')
  ) {
    // This preflight is additive only. A negative or failed scan cannot
    // authorize routine care when the source manifest itself is invalid.
    return undefined
  }
  return gateway
}

function positiveFailureGateway(
  gateway: SourceFailureEmergencyGateway,
): SourceFailureEmergencyGateway | undefined {
  const hasSupportingSignal = gateway.signals.some((signal) =>
    gateway.carePathway === 'emergency_now'
      ? signal.action === 'emergency_now' && signal.assertion === 'present'
      : gateway.carePathway === 'same_day_clinician_review'
        ? signal.action === 'immediate_clinician_review' &&
          signal.assertion === 'uncertain'
        : false,
  )
  return hasSupportingSignal ? gateway : undefined
}

function validateManifest(input: {
  sourcePages: unknown
  rawText: unknown
}):
  | {
      ok: true
      pages: PersistedLongPacketSourcePage[]
      rawText: string
      documentId: string
    }
  | { ok: false } {
  const parsedPages = parsePersistedJSON(input.sourcePages)
  if (
    !Array.isArray(parsedPages) ||
    parsedPages.length === 0 ||
    parsedPages.length > SCANNED_PACKET_MAX_PAGES ||
    typeof input.rawText !== 'string' ||
    !input.rawText.trim()
  ) {
    return { ok: false }
  }

  let documentId: string | undefined
  const pages: PersistedLongPacketSourcePage[] = []
  for (const [index, value] of parsedPages.entries()) {
    if (!isRecord(value)) return { ok: false }
    const pageKeys = Object.keys(value).sort()
    if (
      pageKeys.length !== SOURCE_PAGE_KEYS.length ||
      pageKeys.some((key, keyIndex) => key !== SOURCE_PAGE_KEYS[keyIndex]) ||
      typeof value.documentId !== 'string' ||
      !value.documentId.trim() ||
      value.documentId.length > MAX_AUTHORITY_IDENTIFIER_LENGTH ||
      !Number.isSafeInteger(value.pageNumber) ||
      value.pageNumber !== index + 1 ||
      typeof value.text !== 'string' ||
      !value.text.trim() ||
      (value.extractionMethod !== 'native_text' &&
        value.extractionMethod !== 'ocr') ||
      (value.extractionConfidence !== null &&
        (typeof value.extractionConfidence !== 'number' ||
          !Number.isFinite(value.extractionConfidence) ||
          value.extractionConfidence < 0 ||
          value.extractionConfidence > 1))
    ) {
      return { ok: false }
    }
    if (documentId === undefined) documentId = value.documentId
    if (value.documentId !== documentId) return { ok: false }
    // Rebuild the recognized manifest shape in its versioned field order so a
    // JSONB round trip cannot change the existing source digest identity.
    pages.push({
      documentId: value.documentId,
      pageNumber: value.pageNumber as number,
      text: value.text,
      extractionMethod: value.extractionMethod,
      extractionConfidence: value.extractionConfidence as number | null,
    })
  }

  if (pages.map((page) => page.text).join('\n\n') !== input.rawText) {
    return { ok: false }
  }

  return {
    ok: true,
    pages,
    rawText: input.rawText,
    documentId: documentId!,
  }
}

type RecomputedEnvelope =
  | {
      ok: true
      pages: PersistedLongPacketSourcePage[]
      rawText: string
      sourceSha256: string
      packetPlan: LongPacketPlan
      deterministicGateway: LongPacketEmergencyResult
      persistedPlanMatches: boolean
      sourceDigestMatches: boolean
      packetPlanDigestMatches: boolean
      coverageReportMatches: boolean
      persistedSafetyMatches: boolean
    }
  | {
      ok: false
      reason:
        | 'source_extraction_manifest_invalid'
        | 'source_extraction_packet_plan_invalid'
        | 'source_extraction_size_limit_exceeded'
      deterministicGateway?: SourceFailureEmergencyGateway
    }

function recomputeEnvelope(
  row: SourceExtractionAuthorityRow,
  dependencies: SourceExtractionAuthorityValidationDependencies,
): RecomputedEnvelope {
  const manifest = validateManifest({
    sourcePages: row.source_pages,
    rawText: row.text_input,
  })
  if (!manifest.ok) {
    const rawTextEmergency = positiveRawTextEmergencyGateway(row.text_input)
    return {
      ok: false,
      reason: 'source_extraction_manifest_invalid',
      ...(rawTextEmergency
        ? { deterministicGateway: rawTextEmergency }
        : {}),
    }
  }

  const packetPlanValue =
    typeof row.packet_plan === 'string' &&
    row.packet_plan.length > MAX_PERSISTED_ARTIFACT_CHARACTERS
      ? null
      : parsePersistedJSON(row.packet_plan)
  const packetIdIsValid =
    isRecord(packetPlanValue) &&
    typeof packetPlanValue.packetId === 'string' &&
    Boolean(packetPlanValue.packetId.trim()) &&
    packetPlanValue.packetId.length <= MAX_AUTHORITY_IDENTIFIER_LENGTH
  const packetId = packetIdIsValid
    ? (packetPlanValue.packetId as string)
    : `untrusted-source-safety:${manifest.documentId.slice(0, 120)}`
  const pages = manifest.pages.map((page) => ({
    pageNumber: page.pageNumber,
    text: page.text,
    extractionMethod: page.extractionMethod,
    extractionConfidence: page.extractionConfidence,
  }))
  const documents: LongPacketSourceDocument[] = [
    {
      packetId,
      expectedDocumentCount: 1,
      documentId: manifest.documentId,
      documentOrder: 1,
      expectedPageCount: pages.length,
      pages,
    },
  ]

  let expectedPacketPlan: LongPacketPlan
  let deterministicGateway: LongPacketEmergencyResult
  try {
    expectedPacketPlan = dependencies.planLongPacketChunks(documents)
    deterministicGateway =
      dependencies.scanLongPacketEmergency(expectedPacketPlan)
  } catch {
    const rawTextEmergency = positiveRawTextEmergencyGateway(manifest.rawText)
    return {
      ok: false,
      reason: 'source_extraction_packet_plan_invalid',
      ...(rawTextEmergency
        ? { deterministicGateway: rawTextEmergency }
        : {}),
    }
  }
  if (deterministicGateway.status !== 'completed') {
    const positiveGateway =
      positiveFailureGateway(deterministicGateway) ??
      positiveRawTextEmergencyGateway(manifest.rawText)
    return {
      ok: false,
      reason: 'source_extraction_packet_plan_invalid',
      ...(positiveGateway ? { deterministicGateway: positiveGateway } : {}),
    }
  }
  if (!passesAuxiliaryArtifactPreflight(row)) {
    return {
      ok: false,
      reason: 'source_extraction_size_limit_exceeded',
      deterministicGateway,
    }
  }
  if (!packetIdIsValid || !isRecord(packetPlanValue)) {
    return {
      ok: false,
      reason: 'source_extraction_packet_plan_invalid',
      deterministicGateway,
    }
  }
  let expectedCoverage
  try {
    expectedCoverage = dependencies.assertCompleteLongPacketCoverage(
      expectedPacketPlan,
      documents,
    )
  } catch {
    return {
      ok: false,
      reason: 'source_extraction_packet_plan_invalid',
      deterministicGateway,
    }
  }

  let persistedPlanMatches = false
  try {
    const packetPlan = packetPlanValue as unknown as LongPacketPlan
    canonicalLongPacketJSONStringify(packetPlan)
    persistedPlanMatches =
      canonicalEquals(packetPlan.coverage, expectedCoverage) &&
      dependencies.hashLongPacketPlan(packetPlan) ===
        dependencies.hashLongPacketPlan(expectedPacketPlan)
  } catch {
    persistedPlanMatches = false
  }

  let sourceSha256 = ''
  let sourceDigestMatches = false
  try {
    sourceSha256 = dependencies.longPacketSourceDigest(
      expectedPacketPlan.packetId,
      manifest.pages,
    )
    sourceDigestMatches =
      typeof row.source_sha256 === 'string' &&
      row.source_sha256 === sourceSha256
  } catch {
    sourceDigestMatches = false
  }

  return {
    ok: true,
    pages: manifest.pages,
    rawText: manifest.rawText,
    sourceSha256,
    packetPlan: expectedPacketPlan,
    deterministicGateway,
    persistedPlanMatches,
    sourceDigestMatches,
    packetPlanDigestMatches: (() => {
      if (
        row.packet_plan_sha256 === null ||
        row.packet_plan_sha256 === undefined
      ) {
        return true
      }
      try {
        return (
          typeof row.packet_plan_sha256 === 'string' &&
          row.packet_plan_sha256 ===
            dependencies.hashLongPacketPlan(expectedPacketPlan)
        )
      } catch {
        return false
      }
    })(),
    coverageReportMatches: canonicalEquals(
      parsePersistedJSON(row.coverage_report),
      expectedCoverage,
    ),
    persistedSafetyMatches: emergencyHashesMatch(
      parsePersistedJSON(row.packet_emergency_result),
      deterministicGateway,
      dependencies,
    ),
  }
}

function sourceKind(
  row: SourceExtractionAuthorityRow,
): { ok: true; sourceType: SourceType; sourceFilename?: string } | { ok: false } {
  if (
    !Object.prototype.hasOwnProperty.call(row, 'source_filename') ||
    row.source_filename === null
  ) {
    return { ok: true, sourceType: 'paste' }
  }
  if (
    typeof row.source_filename !== 'string' ||
    !row.source_filename.trim() ||
    row.source_filename.length > MAX_AUTHORITY_IDENTIFIER_LENGTH
  ) {
    return { ok: false }
  }

  const normalized = row.source_filename.trim().toLowerCase()
  const sourceType = normalized.endsWith('.pdf')
    ? 'pdf'
    : normalized.endsWith('.docx')
      ? 'docx'
      : normalized.endsWith('.txt')
        ? 'txt'
        : undefined
  return sourceType
    ? { ok: true, sourceType, sourceFilename: row.source_filename }
    : { ok: false }
}

function optionalPersistedMetadata(row: SourceExtractionAuthorityRow):
  | {
      ok: true
      extractedSummary?: string
      patientAge?: number
      patientSex?: 'Male' | 'Female' | 'Other'
      extractionConfidence?: TriageConfidence
      noteTypeDetected?: NoteType
    }
  | { ok: false } {
  const summary = row.extracted_summary
  if (
    summary !== null &&
    summary !== undefined &&
    (typeof summary !== 'string' ||
      summary.length > FILE_CONSTRAINTS.MAX_TEXT_LENGTH)
  ) {
    return { ok: false }
  }
  const patientAge = row.patient_age
  if (
    patientAge !== null &&
    patientAge !== undefined &&
    (typeof patientAge !== 'number' ||
      !Number.isSafeInteger(patientAge) ||
      patientAge < 0 ||
      patientAge > 130)
  ) {
    return { ok: false }
  }
  const patientSex = row.patient_sex
  if (
    patientSex !== null &&
    patientSex !== undefined &&
    (typeof patientSex !== 'string' || !PATIENT_SEXES.has(patientSex as never))
  ) {
    return { ok: false }
  }
  const confidence = row.extraction_confidence
  if (
    confidence !== null &&
    confidence !== undefined &&
    (typeof confidence !== 'string' ||
      !EXTRACTION_CONFIDENCES.has(confidence as TriageConfidence))
  ) {
    return { ok: false }
  }
  const noteType = row.note_type_detected
  if (
    noteType !== null &&
    noteType !== undefined &&
    (typeof noteType !== 'string' || !NOTE_TYPES.has(noteType as NoteType))
  ) {
    return { ok: false }
  }

  return {
    ok: true,
    ...(typeof summary === 'string' && summary.trim()
      ? { extractedSummary: summary }
      : {}),
    ...(typeof patientAge === 'number' ? { patientAge } : {}),
    ...(typeof patientSex === 'string'
      ? { patientSex: patientSex as 'Male' | 'Female' | 'Other' }
      : {}),
    ...(typeof confidence === 'string'
      ? { extractionConfidence: confidence as TriageConfidence }
      : {}),
    ...(typeof noteType === 'string'
      ? { noteTypeDetected: noteType as NoteType }
      : {}),
  }
}

export function validatePersistedSourceSafetyAuthority(
  value: unknown,
  dependencies: SourceExtractionAuthorityValidationDependencies =
    DEFAULT_VALIDATION_DEPENDENCIES,
): SourceSafetyAuthorityDecision {
  if (!isRecord(value)) return blocked('source_extraction_not_found')
  if (!passesSourceAuthorityPreflight(value)) {
    return blocked(
      'source_extraction_size_limit_exceeded',
      positiveRawTextEmergencyGateway(value.text_input),
    )
  }

  const envelope = recomputeEnvelope(value, dependencies)
  if (!envelope.ok) {
    return blocked(envelope.reason, envelope.deterministicGateway)
  }

  const modelArtifactPreflight = validateModelArtifactPreflight(value)
  if (!modelArtifactPreflight.ok) {
    return blocked(
      modelArtifactPreflight.reason,
      envelope.deterministicGateway,
    )
  }

  let authorityHoldReason: SourceExtractionAuthorityFailureReason | undefined
  const recordAuthorityHold = (
    reason: SourceExtractionAuthorityFailureReason,
  ) => {
    authorityHoldReason ??= reason
  }
  if (!envelope.persistedPlanMatches) {
    recordAuthorityHold('source_extraction_packet_plan_invalid')
  }
  if (!envelope.sourceDigestMatches) {
    recordAuthorityHold('source_extraction_digest_invalid')
  }
  if (
    !envelope.coverageReportMatches ||
    !envelope.packetPlanDigestMatches
  ) {
    recordAuthorityHold('source_extraction_packet_plan_invalid')
  }
  const expectedIngestionMode =
    envelope.rawText.length > FILE_CONSTRAINTS.MAX_TEXT_LENGTH
      ? 'long_packet'
      : 'single_pass'
  if (value.ingestion_mode !== expectedIngestionMode) {
    recordAuthorityHold('source_extraction_ingestion_mode_invalid')
  }
  if (!envelope.persistedSafetyMatches) {
    recordAuthorityHold('source_extraction_packet_safety_invalid')
  }

  const modelMapResult = parsePersistedJSON(value.model_map_result)
  const modelReduceResult = parsePersistedJSON(value.model_reduce_result)
  const safetyPromptVersions = parsePersistedJSON(
    value.safety_prompt_versions,
  )
  let longPacketSafety: ValidatedLongPacketSafetyArtifacts | undefined
  const hasPersistedModelArtifacts =
    modelMapResult !== null &&
    modelMapResult !== undefined &&
    modelReduceResult !== null &&
    modelReduceResult !== undefined
  const hasPersistedModelMap =
    modelMapResult !== null && modelMapResult !== undefined
  const hasPersistedModelReduce =
    modelReduceResult !== null && modelReduceResult !== undefined

  if (expectedIngestionMode === 'long_packet') {
    const isPartialSafetyHold =
      isRecord(modelReduceResult) &&
      modelReduceResult.kind === 'partial_safety_hold'
    let fullPipelineBindingsValid = false
    if (!isPartialSafetyHold && hasPersistedModelReduce) {
      try {
        validateLongPacketFullPipelinePromptBindings(safetyPromptVersions)
        fullPipelineBindingsValid = true
      } catch {
        recordAuthorityHold('source_extraction_packet_safety_invalid')
      }
    }
    if (isPartialSafetyHold) {
      try {
        const validated = validateLongPacketPartialSafetyHold({
          plan: envelope.packetPlan,
          sourceSha256: envelope.sourceSha256,
          safetyPromptVersions: parsePersistedJSON(
            value.safety_prompt_versions,
          ),
          value: modelReduceResult,
        })
        longPacketSafety = {
          gateway: envelope.deterministicGateway,
          safetyResult: validated.safetyResult,
          evidenceLines: [
            ...validated.safetyResult.signals.flatMap((signal) =>
              signal.evidence.map(
                (evidence) => `${signal.code}: ${evidence.quote}`,
              ),
            ),
            ...validated.safetyResult.criticalUnknowns.map(
              (unknown) => `critical_unknown: ${unknown}`,
            ),
          ],
          pipelineComplete: false,
        }
      } catch {
        recordAuthorityHold('source_extraction_packet_safety_invalid')
      }
    } else if (hasPersistedModelArtifacts) {
      try {
        longPacketSafety = validatePersistedLongPacketModelSafetyArtifacts({
          sourcePages: envelope.pages,
          packetPlan: envelope.packetPlan,
          modelMapResult,
          modelReduceResult,
          safetyPromptVersions,
        })
      } catch {
        // A terminal mapper or narrative failure may still leave a complete,
        // provenance-bound safety branch. It can preserve an urgent action but
        // can never authorize completion or outpatient scoring.
      }
    }
    if (
      !isPartialSafetyHold &&
      fullPipelineBindingsValid &&
      !longPacketSafety &&
      hasPersistedModelReduce
    ) {
      try {
        const safetyResult = validatePersistedLongPacketAggregateSafety(
          envelope.packetPlan,
          modelMapResult,
          modelReduceResult,
        )
        longPacketSafety = {
          gateway: envelope.deterministicGateway,
          safetyResult,
          evidenceLines: [
            ...safetyResult.signals.flatMap((signal) =>
              signal.evidence.map(
                (evidence) => `${signal.code}: ${evidence.quote}`,
              ),
            ),
            ...safetyResult.criticalUnknowns.map(
              (unknown) => `critical_unknown: ${unknown}`,
            ),
          ],
          pipelineComplete: false,
        }
      } catch {
        try {
          const safetyResult = validatePersistedLongPacketSafetyBranch(
            envelope.packetPlan,
            modelReduceResult,
          )
          longPacketSafety = {
            gateway: envelope.deterministicGateway,
            safetyResult,
            evidenceLines: [
              ...safetyResult.signals.flatMap((signal) =>
                signal.evidence.map(
                  (evidence) => `${signal.code}: ${evidence.quote}`,
                ),
              ),
              ...safetyResult.criticalUnknowns.map(
                (unknown) => `critical_unknown: ${unknown}`,
              ),
            ],
            pipelineComplete: false,
          }
        } catch {
          recordAuthorityHold('source_extraction_packet_safety_invalid')
        }
      }
    }
    if (
      (hasPersistedModelMap && !hasPersistedModelReduce) ||
      (value.status === 'complete' && !longPacketSafety)
    ) {
      recordAuthorityHold('source_extraction_packet_safety_invalid')
    }
  }

  if (authorityHoldReason) {
    return blocked(
      authorityHoldReason,
      envelope.deterministicGateway,
      longPacketSafety?.safetyResult.carePathway,
    )
  }
  return {
    ok: true,
    authority: {
      rawText: envelope.rawText,
      ingestionMode: expectedIngestionMode,
      sourcePages: envelope.pages,
      sourceSha256: envelope.sourceSha256,
      packetPlan: envelope.packetPlan,
      modelMapResult,
      modelReduceResult,
      deterministicGateway: envelope.deterministicGateway,
      ...(longPacketSafety ? { longPacketSafety } : {}),
    },
  }
}

export function validatePersistedSourceExtractionAuthority(
  value: unknown,
  dependencies: SourceExtractionAuthorityValidationDependencies =
    DEFAULT_VALIDATION_DEPENDENCIES,
): SourceExtractionAuthorityDecision {
  const safetyDecision = validatePersistedSourceSafetyAuthority(
    value,
    dependencies,
  )
  if (!safetyDecision.ok) return safetyDecision
  if (!isRecord(value)) return blocked('source_extraction_not_found')
  const safety = safetyDecision.authority

  if (value.status !== 'complete') {
    return blocked(
      'source_extraction_not_complete',
      safety.deterministicGateway,
      safety.longPacketSafety?.safetyResult.carePathway,
    )
  }
  if (value.coverage_status !== 'complete') {
    return blocked(
      'source_extraction_coverage_incomplete',
      safety.deterministicGateway,
      safety.longPacketSafety?.safetyResult.carePathway,
    )
  }
  const source = sourceKind(value)
  if (!source.ok) {
    return blocked(
      'source_extraction_source_type_invalid',
      safety.deterministicGateway,
      safety.longPacketSafety?.safetyResult.carePathway,
    )
  }
  const metadata = optionalPersistedMetadata(value)
  if (!metadata.ok) {
    return blocked(
      'source_extraction_metadata_invalid',
      safety.deterministicGateway,
      safety.longPacketSafety?.safetyResult.carePathway,
    )
  }
  if (
    safety.ingestionMode === 'long_packet' &&
    (!safety.longPacketSafety || !safety.longPacketSafety.pipelineComplete)
  ) {
    return blocked(
      'source_extraction_packet_safety_invalid',
      safety.deterministicGateway,
      safety.longPacketSafety?.safetyResult.carePathway,
    )
  }
  if (safety.ingestionMode === 'long_packet') {
    const pipeline = safety.longPacketSafety?.validatedPipeline
    if (!pipeline) {
      return blocked(
        'source_extraction_packet_safety_invalid',
        safety.deterministicGateway,
        safety.longPacketSafety?.safetyResult.carePathway,
      )
    }
    const canonicalExtraction =
      longPacketPipelineToPersistedClinicalExtraction({
        pipeline,
        deterministicGateway: safety.deterministicGateway,
      })
    if (!metadata.extractedSummary) {
      return blocked(
        'source_extraction_summary_missing',
        safety.deterministicGateway,
        safety.longPacketSafety?.safetyResult.carePathway,
      )
    }
    const persistedKeyFindings =
      typeof value.key_findings === 'string' &&
      value.key_findings.length > MAX_PERSISTED_ARTIFACT_CHARACTERS
        ? null
        : parsePersistedJSON(value.key_findings)
    if (
      metadata.extractedSummary !== canonicalExtraction.extractedSummary ||
      metadata.noteTypeDetected !== canonicalExtraction.noteTypeDetected ||
      metadata.extractionConfidence !==
        canonicalExtraction.extractionConfidence ||
      !boundedArtifactShape(persistedKeyFindings) ||
      !canonicalEquals(
        persistedKeyFindings,
        canonicalExtraction.keyFindings,
      )
    ) {
      return blocked(
        'source_extraction_metadata_invalid',
        safety.deterministicGateway,
        safety.longPacketSafety?.safetyResult.carePathway,
      )
    }
  }
  return {
    ok: true,
    authority: {
      rawText: safety.rawText,
      sourceType: source.sourceType,
      sourceFilename: source.sourceFilename,
      extractedSummary: metadata.extractedSummary,
      patientAge: metadata.patientAge,
      patientSex: metadata.patientSex,
      extractionConfidence: metadata.extractionConfidence,
      noteTypeDetected: metadata.noteTypeDetected,
      ingestionMode: safety.ingestionMode,
      coverageStatus: 'complete',
      sourcePages: safety.sourcePages,
      sourceSha256: safety.sourceSha256,
      packetPlan: safety.packetPlan,
      modelMapResult: safety.modelMapResult,
      modelReduceResult: safety.modelReduceResult,
      deterministicGateway: safety.deterministicGateway,
      ...(safety.longPacketSafety
        ? { longPacketSafety: safety.longPacketSafety }
        : {}),
    },
  }
}
