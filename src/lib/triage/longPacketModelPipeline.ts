import { createHash } from 'node:crypto'

import { invokeBedrockClinicalTool } from '@/lib/bedrock'
import { canonicalLongPacketJSONStringify } from './longPacketCanonicalHash'
import type { GatewayEvidence } from './emergencyGateway'
import {
  LONG_PACKET_FACT_CATEGORIES,
  runLongPacketClinicalMapper,
  type LongPacketChunkClinicalMap,
  type LongPacketClinicalFact,
  type LongPacketEvidenceConflict,
  type LongPacketFactCategory,
} from './longPacketClinicalMapper'
import {
  longPacketChunkProvenanceDigest,
  type LongPacketChunk,
  type LongPacketPlan,
} from './longPacketPlanner'
import type {
  SafetyModelSignal,
  ValidatedModelSafetyExtraction,
} from './modelSafetyExtraction'
import { runModelSafetyExtractor } from './modelSafetyExtractor'
import { CLINICAL_SOURCE_TRUST_BOUNDARY } from './promptSafety'
import type { CarePathway, CoverageStatus, ReviewRequirement } from './types'

export const LONG_PACKET_MODEL_PIPELINE_VERSION =
  'neurology-long-packet-model-pipeline-v1'
export const LONG_PACKET_NARRATIVE_REDUCER_PROMPT_VERSION =
  'neurology-long-packet-narrative-reducer-v1'
export const LONG_PACKET_NARRATIVE_REDUCER_MODEL =
  'us.anthropic.claude-sonnet-4-6'

const DEFAULT_MAX_CONCURRENT_CHUNKS = 6
const DEFAULT_MAX_REDUCER_INPUT_CHARACTERS = 60_000
const MAX_NARRATIVE_FRAGMENT_CHARACTERS = 12_000

type BranchStatus = 'completed' | 'partial' | 'failed'

export type LongPacketChunkBranch = 'mapper' | 'safety'

export interface LongPacketChunkBranchRunOptions {
  signal?: AbortSignal
  model: string
}

export interface LongPacketMapperBranchOutcome {
  branch: 'clinical_mapper'
  chunkId: string
  chunkProvenanceSha256: string
  status: BranchStatus
  result: LongPacketChunkClinicalMap | null
  failureCode: string | null
}

export interface LongPacketSafetyBranchOutcome {
  branch: 'safety_extractor'
  chunkId: string
  chunkProvenanceSha256: string
  status: BranchStatus
  result: ValidatedModelSafetyExtraction | null
  failureCode: string | null
}

export type LongPacketChunkBranchOutcome =
  | LongPacketMapperBranchOutcome
  | LongPacketSafetyBranchOutcome

export class LongPacketChunkBranchError extends Error {
  readonly name = 'LongPacketChunkBranchError'

  constructor(
    public readonly code:
      | 'invalid_branch'
      | 'invalid_options'
      | 'invalid_model'
      | 'invalid_signal',
    value: unknown,
  ) {
    super(`Invalid long-packet chunk branch ${code}: ${String(value)}`)
  }
}

export class LongPacketOutcomeCallbackError extends Error {
  readonly name = 'LongPacketOutcomeCallbackError'

  constructor(public readonly cause: unknown) {
    super(
      cause instanceof Error
        ? cause.message
        : 'Long-packet outcome callback failed.',
    )
  }
}

export interface LongPacketBranchCoverage {
  status: 'complete' | 'partial' | 'failed'
  expectedChunkCount: number
  receivedOutcomeCount: number
  acceptedChunkCount: number
  completedChunkCount: number
  partialChunkCount: number
  failedChunkCount: number
  missingChunkCount: number
  duplicateChunkCount: number
  unexpectedChunkCount: number
  tamperedChunkCount: number
}

export interface LongPacketCriticalUnknown {
  text: string
  source: 'clinical_mapper' | 'safety_extractor'
  chunkIds: string[]
  evidence: GatewayEvidence[]
}

export interface LongPacketNarrativeUnit {
  id: string
  kind:
    | 'clinical_fact'
    | 'evidence_conflict'
    | 'safety_signal'
    | 'critical_unknown'
  payload: Record<string, unknown>
  safetyEvidenceIds: string[]
}

export interface LongPacketNarrativeFragmentReference {
  fragmentId: string
  narrative: string
  timelineNarrative: string
  medicationNarrative: string
  testNarrative: string
  functionalNarrative: string
  conflictNarrative: string
  safetyManifestId: string | null
  safetyEvidenceCount: number
}

export interface LongPacketNarrativeReductionInput {
  stage: number
  units: LongPacketNarrativeUnit[]
  fragments: LongPacketNarrativeFragmentReference[]
  requiredSafetyEvidenceIds: string[]
}

export interface LongPacketNarrativeFragment {
  narrative: string
  timelineNarrative: string
  medicationNarrative: string
  testNarrative: string
  functionalNarrative: string
  conflictNarrative: string
  preservedSafetyEvidenceIds: string[]
}

export interface LongPacketModelPipelineResult {
  version: typeof LONG_PACKET_MODEL_PIPELINE_VERSION
  status: BranchStatus
  coverageStatus: Extract<CoverageStatus, 'complete' | 'partial' | 'failed'>
  clinicianHold: boolean
  carePathway: CarePathway
  reviewRequirement: ReviewRequirement
  schedulingLocked: true
  mapperCoverage: LongPacketBranchCoverage
  safetyCoverage: LongPacketBranchCoverage
  mapperOutcomes: LongPacketMapperBranchOutcome[]
  safetyOutcomes: LongPacketSafetyBranchOutcome[]
  factsByCategory: Record<LongPacketFactCategory, LongPacketClinicalFact[]>
  conflicts: LongPacketEvidenceConflict[]
  criticalUnknowns: LongPacketCriticalUnknown[]
  safetySignals: SafetyModelSignal[]
  requiredSafetyEvidenceIds: string[]
  narrativeSafetyManifestId: string | null
  narrative: LongPacketNarrativeFragment | null
  failureCodes: string[]
}

export interface LongPacketModelPipelineOptions {
  mapChunk?: (
    chunk: LongPacketChunk,
    signal?: AbortSignal,
  ) => Promise<LongPacketChunkClinicalMap>
  extractSafety?: (
    chunk: LongPacketChunk,
    signal?: AbortSignal,
  ) => Promise<ValidatedModelSafetyExtraction>
  reduceNarrative?: (
    input: LongPacketNarrativeReductionInput,
  ) => Promise<LongPacketNarrativeFragment>
  maxConcurrentChunks?: number
  maxReducerInputCharacters?: number
  onSafetyOutcome?: (
    outcome: Readonly<LongPacketSafetyBranchOutcome>,
  ) => Promise<void>
  onMapperOutcome?: (
    outcome: Readonly<LongPacketMapperBranchOutcome>,
  ) => Promise<void>
  signal?: AbortSignal
}

interface AnalyzedBranch<T> {
  coverage: LongPacketBranchCoverage
  accepted: T[]
  failureCodes: string[]
  integrityFailed: boolean
}

interface NarrativeReductionNode {
  fragment: LongPacketNarrativeFragment
  reference: LongPacketNarrativeFragmentReference
  originalSafetyEvidenceIds: string[]
}

interface LongPacketChunkBranchExecutors {
  mapChunk: (
    chunk: LongPacketChunk,
    signal?: AbortSignal,
    model?: string,
  ) => Promise<LongPacketChunkClinicalMap>
  extractSafety: (
    chunk: LongPacketChunk,
    signal?: AbortSignal,
    model?: string,
  ) => Promise<ValidatedModelSafetyExtraction>
}

const NARRATIVE_REDUCER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    narrative: { type: 'string', maxLength: 4_000 },
    timelineNarrative: { type: 'string', maxLength: 4_000 },
    medicationNarrative: { type: 'string', maxLength: 4_000 },
    testNarrative: { type: 'string', maxLength: 4_000 },
    functionalNarrative: { type: 'string', maxLength: 4_000 },
    conflictNarrative: { type: 'string', maxLength: 4_000 },
    preservedSafetyEvidenceIds: {
      type: 'array',
      maxItems: 5_000,
      items: { type: 'string', minLength: 1, maxLength: 160 },
    },
  },
  required: [
    'narrative',
    'timelineNarrative',
    'medicationNarrative',
    'testNarrative',
    'functionalNarrative',
    'conflictNarrative',
    'preservedSafetyEvidenceIds',
  ],
}

export const LONG_PACKET_NARRATIVE_REDUCER_SYSTEM_PROMPT = `You are the narrative-only reducer for a neurology referral packet. You may organize and fuse the supplied facts, but you may not diagnose, score urgency, clear safety, recommend scheduling, omit a conflict, or resolve contradictory evidence. The deterministic facts and evidence outside your narrative remain authoritative.

${CLINICAL_SOURCE_TRUST_BOUNDARY}

Return concise narrative fields for the overall packet, chronology, medications/failed therapies, tests, function, and conflicts. Preserve every supplied detail; if input is already a narrative fragment, fuse without changing its meaning. Never discard content merely to fit. Every requiredSafetyEvidenceId is a protected evidence reference or a cryptographic child manifest. Echo each one exactly once in preservedSafetyEvidenceIds. Omitting, adding, or changing a protected ID invalidates the entire reduction. Output only the forced tool result.`

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  )
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

function stableDigest(value: unknown): string {
  return createHash('sha256')
    .update(canonicalLongPacketJSONStringify(value), 'utf8')
    .digest('hex')
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort()
}

function evidenceKey(evidence: GatewayEvidence): string {
  return [
    evidence.packetId,
    evidence.documentId,
    evidence.pageNumber,
    evidence.startOffset,
    evidence.endOffset,
    evidence.quote,
    evidence.extractionMethod,
    evidence.extractionConfidence,
  ].join('\u0000')
}

function unionEvidence(evidence: GatewayEvidence[]): GatewayEvidence[] {
  const unique = new Map<string, GatewayEvidence>()
  for (const item of evidence) unique.set(evidenceKey(item), item)
  return [...unique.values()].sort(
    (left, right) =>
      (left.documentId ?? '').localeCompare(right.documentId ?? '') ||
      (left.pageNumber ?? 0) - (right.pageNumber ?? 0) ||
      left.startOffset - right.startOffset ||
      left.endOffset - right.endOffset,
  )
}

function evidenceBelongsToChunk(
  evidence: GatewayEvidence,
  chunk: LongPacketChunk,
): boolean {
  if (
    !isRecord(evidence) ||
    !hasExactKeys(evidence, [
      'packetId',
      'documentId',
      'pageNumber',
      'startOffset',
      'endOffset',
      'quote',
      'extractionMethod',
      'extractionConfidence',
    ]) ||
    evidence.packetId !== chunk.packetId ||
    evidence.documentId !== chunk.documentId ||
    !Number.isSafeInteger(evidence.pageNumber) ||
    !Number.isSafeInteger(evidence.startOffset) ||
    !Number.isSafeInteger(evidence.endOffset) ||
    evidence.startOffset < 0 ||
    evidence.endOffset <= evidence.startOffset ||
    typeof evidence.quote !== 'string' ||
    !evidence.quote ||
    evidence.quote.length > 4_000 ||
    (evidence.extractionMethod !== 'native_text' &&
      evidence.extractionMethod !== 'ocr') ||
    (evidence.extractionConfidence !== null &&
      (typeof evidence.extractionConfidence !== 'number' ||
        !Number.isFinite(evidence.extractionConfidence) ||
        evidence.extractionConfidence < 0 ||
        evidence.extractionConfidence > 1))
  ) {
    return false
  }
  return chunk.sourceSpans.some((span) => {
    if (
      span.pageNumber !== evidence.pageNumber ||
      evidence.startOffset < span.pageStartOffset ||
      evidence.endOffset > span.pageEndOffset
    ) {
      return false
    }
    const chunkStart =
      span.chunkStartOffset + (evidence.startOffset - span.pageStartOffset)
    const chunkEnd =
      span.chunkStartOffset + (evidence.endOffset - span.pageStartOffset)
    return (
      chunk.text.substring(chunkStart, chunkEnd) === evidence.quote &&
      span.extractionMethod === evidence.extractionMethod &&
      span.extractionConfidence === evidence.extractionConfidence
    )
  })
}

function mapperResultMatchesChunk(
  result: LongPacketChunkClinicalMap,
  chunk: LongPacketChunk,
): boolean {
  const categories = new Set<string>(LONG_PACKET_FACT_CATEGORIES)
  const assertions = new Set([
    'present',
    'negated',
    'uncertain',
    'conditional',
  ])
  const temporalities = new Set([
    'current',
    'recent',
    'historical',
    'unknown',
  ])
  if (
    !isRecord(result) ||
    !hasExactKeys(result, [
      'chunkId',
      'chunkProvenanceSha256',
      'sourceCharacterCount',
      'coverageStatus',
      'facts',
      'conflicts',
    ]) ||
    !['complete', 'partial', 'failed'].includes(
      result.coverageStatus as string,
    ) ||
    !Array.isArray(result.facts) ||
    result.facts.length > 300 ||
    !Array.isArray(result.conflicts) ||
    result.conflicts.length > 100
  ) {
    return false
  }
  const factsAreValid = result.facts.every(
      (fact) =>
        isRecord(fact) &&
        hasExactKeys(fact, [
          'category',
          'key',
          'statement',
          'assertion',
          'temporality',
          'eventDateText',
          'evidence',
        ]) &&
      typeof fact.category === 'string' &&
      categories.has(fact.category) &&
      typeof fact.key === 'string' &&
      /^[a-z0-9][a-z0-9 _./:+-]{0,239}$/.test(fact.key) &&
      typeof fact.statement === 'string' &&
      Boolean(fact.statement.trim()) &&
      fact.statement.length <= 5_000 &&
      typeof fact.assertion === 'string' &&
      assertions.has(fact.assertion) &&
      typeof fact.temporality === 'string' &&
      temporalities.has(fact.temporality) &&
      (fact.eventDateText === null ||
        (typeof fact.eventDateText === 'string' &&
          Boolean(fact.eventDateText.trim()) &&
          fact.eventDateText.length <= 240)) &&
      Array.isArray(fact.evidence) &&
      fact.evidence.length >= 1 &&
      fact.evidence.length <= 20 &&
      fact.evidence.every((evidence) =>
        evidenceBelongsToChunk(evidence, chunk),
      ),
  )
  const conflictsAreValid = result.conflicts.every(
      (conflict) =>
        isRecord(conflict) &&
        hasExactKeys(conflict, ['topic', 'description', 'evidence']) &&
      typeof conflict.topic === 'string' &&
      Boolean(conflict.topic.trim()) &&
      conflict.topic.length <= 240 &&
      typeof conflict.description === 'string' &&
      Boolean(conflict.description.trim()) &&
      conflict.description.length <= 5_000 &&
      Array.isArray(conflict.evidence) &&
      conflict.evidence.length >= 2 &&
      conflict.evidence.length <= 40 &&
      conflict.evidence.every((evidence) =>
        evidenceBelongsToChunk(evidence, chunk),
      ),
  )
  return (
    result.chunkId === chunk.id &&
    result.chunkProvenanceSha256 === chunk.provenanceSha256 &&
    result.sourceCharacterCount === chunk.text.length &&
    factsAreValid &&
    conflictsAreValid
  )
}

function safetyResultMatchesChunk(
  result: ValidatedModelSafetyExtraction,
  chunk: LongPacketChunk,
): boolean {
  if (
    !isRecord(result) ||
    !hasExactKeys(result, [
      'carePathway',
      'dataQuality',
      'criticalUnknowns',
      'signals',
    ]) ||
    ![
      'emergency_now',
      'same_day_clinician_review',
      'no_time_critical_signal',
      'undetermined',
    ].includes(result.carePathway as string) ||
    !['sufficient', 'partial', 'insufficient', 'conflicting'].includes(
      result.dataQuality as string,
    ) ||
    !Array.isArray(result.criticalUnknowns) ||
    result.criticalUnknowns.length > 50 ||
    result.criticalUnknowns.some(
      (value) =>
        typeof value !== 'string' || !value.trim() || value.length > 2_000,
    ) ||
    !Array.isArray(result.signals) ||
    result.signals.length > 50
  ) {
    return false
  }

  const signalsAreValid = result.signals.every(
    (signal) =>
      isRecord(signal) &&
      hasExactKeys(signal, [
        'code',
        'syndrome',
        'source',
        'action',
        'assertion',
        'temporality',
        'experiencer',
        'evidence',
      ]) &&
      typeof signal.code === 'string' &&
      /^[a-z][a-z0-9_]{0,79}$/.test(signal.code) &&
      typeof signal.syndrome === 'string' &&
      [
        'acute_cerebrovascular',
        'intracranial_hemorrhage_or_sah',
        'status_or_recurrent_seizure',
        'acute_spinal_cord_or_cauda_equina',
        'autonomic_dysreflexia',
        'acute_cns_infection',
        'raised_intracranial_pressure',
        'neuromuscular_respiratory_or_bulbar_failure',
        'acute_vision_threat',
        'altered_mental_status_or_coma',
        'traumatic_neurologic_deterioration',
        'suicide_or_violence_risk',
        'other_time_critical',
      ].includes(signal.syndrome) &&
      typeof signal.action === 'string' &&
      ['emergency_now', 'immediate_clinician_review'].includes(signal.action) &&
      signal.source === 'safety_model' &&
      typeof signal.assertion === 'string' &&
      ['present', 'uncertain', 'conditional'].includes(signal.assertion) &&
      typeof signal.temporality === 'string' &&
      ['current', 'recent', 'unknown'].includes(signal.temporality) &&
      typeof signal.experiencer === 'string' &&
      ['patient', 'unknown'].includes(signal.experiencer) &&
      Array.isArray(signal.evidence) &&
      signal.evidence.length >= 1 &&
      signal.evidence.length <= 10 &&
      signal.evidence.every(
        (evidence) =>
          isRecord(evidence) &&
          evidenceBelongsToChunk(evidence as unknown as GatewayEvidence, chunk),
      ) &&
      (signal.action !== 'emergency_now' ||
        (signal.assertion === 'present' &&
          ['current', 'recent'].includes(signal.temporality) &&
          signal.experiencer === 'patient')),
  )
  if (!signalsAreValid) return false

  const hasEmergency = result.signals.some(
    (signal) => signal.action === 'emergency_now',
  )
  const hasImmediateReview = result.signals.some(
    (signal) => signal.action === 'immediate_clinician_review',
  )
  const expectedCarePathway = hasEmergency
    ? 'emergency_now'
    : hasImmediateReview || result.criticalUnknowns.length > 0
      ? 'same_day_clinician_review'
      : result.dataQuality === 'sufficient'
        ? 'no_time_critical_signal'
        : 'undetermined'
  return result.carePathway === expectedCarePathway
}

function persistedOutcomeChunk(
  plan: LongPacketPlan,
  value: unknown,
  branch: 'clinical_mapper' | 'safety_extractor',
): LongPacketChunk {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, PERSISTED_OUTCOME_KEYS) ||
    value.branch !== branch ||
    typeof value.chunkId !== 'string' ||
    !value.chunkId ||
    value.chunkId.length > 1_000 ||
    typeof value.chunkProvenanceSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.chunkProvenanceSha256)
  ) {
    invalidPersistedPipeline()
  }
  const chunk = plan.chunks.find((candidate) => candidate.id === value.chunkId)
  if (
    !chunk ||
    chunk.provenanceSha256 !== longPacketChunkProvenanceDigest(chunk) ||
    value.chunkProvenanceSha256 !== chunk.provenanceSha256
  ) {
    invalidPersistedPipeline()
  }
  return chunk
}

export function validatePersistedLongPacketMapperBranchOutcome(
  plan: LongPacketPlan,
  value: unknown,
): LongPacketMapperBranchOutcome {
  const chunk = persistedOutcomeChunk(plan, value, 'clinical_mapper')
  const outcome = value as unknown as LongPacketMapperBranchOutcome
  if (!outcome.result || !mapperResultMatchesChunk(outcome.result, chunk)) {
    invalidPersistedPipeline()
  }
  const expectedStatus: BranchStatus =
    outcome.result.coverageStatus === 'complete'
      ? 'completed'
      : outcome.result.coverageStatus === 'partial'
        ? 'partial'
        : 'failed'
  const expectedFailureCode =
    outcome.result.coverageStatus === 'complete'
      ? null
      : `mapper_reported_${outcome.result.coverageStatus}`
  if (
    outcome.status !== expectedStatus ||
    outcome.failureCode !== expectedFailureCode
  ) {
    invalidPersistedPipeline()
  }
  return outcome
}

export function validatePersistedLongPacketSafetyBranchOutcome(
  plan: LongPacketPlan,
  value: unknown,
): LongPacketSafetyBranchOutcome {
  const chunk = persistedOutcomeChunk(plan, value, 'safety_extractor')
  const outcome = value as unknown as LongPacketSafetyBranchOutcome
  if (!outcome.result || !safetyResultMatchesChunk(outcome.result, chunk)) {
    invalidPersistedPipeline()
  }
  const expectedStatus: BranchStatus =
    outcome.result.dataQuality === 'sufficient' ? 'completed' : 'partial'
  const expectedFailureCode =
    outcome.result.dataQuality === 'sufficient'
      ? null
      : `safety_reported_${outcome.result.dataQuality}`
  if (
    outcome.status !== expectedStatus ||
    outcome.failureCode !== expectedFailureCode
  ) {
    invalidPersistedPipeline()
  }
  return outcome
}

function mapEvidenceToPages(
  evidence: GatewayEvidence,
  chunk: LongPacketChunk,
): GatewayEvidence[] {
  if (
    !Number.isSafeInteger(evidence.startOffset) ||
    !Number.isSafeInteger(evidence.endOffset) ||
    evidence.startOffset < 0 ||
    evidence.endOffset <= evidence.startOffset ||
    evidence.endOffset > chunk.text.length ||
    chunk.text.substring(evidence.startOffset, evidence.endOffset) !==
      evidence.quote
  ) {
    throw new Error('Safety evidence is outside its immutable chunk.')
  }

  const mapped = chunk.sourceSpans.flatMap((span): GatewayEvidence[] => {
    const intersectionStart = Math.max(
      evidence.startOffset,
      span.chunkStartOffset,
    )
    const intersectionEnd = Math.min(evidence.endOffset, span.chunkEndOffset)
    if (intersectionEnd <= intersectionStart) return []

    const pageStartOffset =
      span.pageStartOffset + (intersectionStart - span.chunkStartOffset)
    const pageEndOffset =
      span.pageStartOffset + (intersectionEnd - span.chunkStartOffset)
    return [
      {
        packetId: span.packetId,
        documentId: span.documentId,
        pageNumber: span.pageNumber,
        startOffset: pageStartOffset,
        endOffset: pageEndOffset,
        quote: chunk.text.substring(intersectionStart, intersectionEnd),
        extractionMethod: span.extractionMethod,
        extractionConfidence: span.extractionConfidence,
      },
    ]
  })
  if (mapped.length === 0) {
    throw new Error('Safety evidence does not intersect a source page.')
  }
  return mapped
}

function mapSafetyResultToPages(
  result: ValidatedModelSafetyExtraction,
  chunk: LongPacketChunk,
): ValidatedModelSafetyExtraction {
  return {
    ...result,
    signals: result.signals.map((signal) => ({
      ...signal,
      evidence: signal.evidence.flatMap((evidence) =>
        mapEvidenceToPages(evidence, chunk),
      ),
    })),
  }
}

const DEFAULT_CHUNK_BRANCH_EXECUTORS: LongPacketChunkBranchExecutors = {
  mapChunk: (chunk, signal, model) =>
    runLongPacketClinicalMapper(chunk, {
      signal,
      ...(model === undefined ? {} : { model }),
    }),
  extractSafety: (chunk, signal, model) =>
    runModelSafetyExtractor(chunk.text, {
      signal,
      ...(model === undefined ? {} : { model }),
    }),
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return (
    isRecord(value) &&
    typeof value.aborted === 'boolean' &&
    typeof value.addEventListener === 'function' &&
    typeof value.removeEventListener === 'function'
  )
}

function normalizeChunkBranchRunOptions(
  input: AbortSignal | LongPacketChunkBranchRunOptions | undefined,
): { signal?: AbortSignal; model?: string } {
  if (input === undefined) return {}
  if (isAbortSignal(input)) return { signal: input }
  if (!isRecord(input)) {
    throw new LongPacketChunkBranchError('invalid_options', input)
  }
  const keys = Object.keys(input)
  if (keys.some((key) => key !== 'signal' && key !== 'model')) {
    throw new LongPacketChunkBranchError('invalid_options', keys.join(','))
  }
  if (
    typeof input.model !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/.test(input.model)
  ) {
    throw new LongPacketChunkBranchError('invalid_model', input.model)
  }
  if (input.signal !== undefined && !isAbortSignal(input.signal)) {
    throw new LongPacketChunkBranchError('invalid_signal', input.signal)
  }
  return {
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    model: input.model,
  }
}

function failedChunkBranchOutcome(
  chunk: LongPacketChunk,
  branch: LongPacketChunkBranch,
  failureCode: string,
): LongPacketChunkBranchOutcome {
  if (branch === 'mapper') {
    return {
      branch: 'clinical_mapper',
      chunkId: chunk.id,
      chunkProvenanceSha256: chunk.provenanceSha256,
      status: 'failed',
      result: null,
      failureCode,
    }
  }
  return {
    branch: 'safety_extractor',
    chunkId: chunk.id,
    chunkProvenanceSha256: chunk.provenanceSha256,
    status: 'failed',
    result: null,
    failureCode,
  }
}

async function executeLongPacketChunkBranch(
  chunk: LongPacketChunk,
  branch: LongPacketChunkBranch,
  signal: AbortSignal | undefined,
  model: string | undefined,
  executors: LongPacketChunkBranchExecutors,
): Promise<LongPacketChunkBranchOutcome> {
  if (branch !== 'mapper' && branch !== 'safety') {
    throw new LongPacketChunkBranchError('invalid_branch', branch)
  }
  signal?.throwIfAborted()
  if (chunk.provenanceSha256 !== longPacketChunkProvenanceDigest(chunk)) {
    return failedChunkBranchOutcome(
      chunk,
      branch,
      'invalid_chunk_provenance',
    )
  }

  if (branch === 'mapper') {
    const result = await executors.mapChunk(chunk, signal, model)
    signal?.throwIfAborted()
    return {
      branch: 'clinical_mapper',
      chunkId: chunk.id,
      chunkProvenanceSha256: chunk.provenanceSha256,
      status:
        result.coverageStatus === 'complete'
          ? 'completed'
          : result.coverageStatus === 'partial'
            ? 'partial'
            : 'failed',
      result,
      failureCode:
        result.coverageStatus === 'complete'
          ? null
          : `mapper_reported_${result.coverageStatus}`,
    }
  }

  const extracted = await executors.extractSafety(chunk, signal, model)
  signal?.throwIfAborted()
  try {
    const result = mapSafetyResultToPages(extracted, chunk)
    return {
      branch: 'safety_extractor',
      chunkId: chunk.id,
      chunkProvenanceSha256: chunk.provenanceSha256,
      status: result.dataQuality === 'sufficient' ? 'completed' : 'partial',
      result,
      failureCode:
        result.dataQuality === 'sufficient'
          ? null
          : `safety_reported_${result.dataQuality}`,
    }
  } catch {
    return failedChunkBranchOutcome(
      chunk,
      branch,
      'invalid_safety_evidence_provenance',
    )
  }
}

/**
 * Executes exactly one durable mapper or safety job. Successful model output
 * is normalized into the existing canonical branch outcome. Immutable chunk
 * or safety-evidence provenance failures become failed outcomes; abort,
 * timeout, schema, model, and transport errors intentionally propagate so the
 * queue worker can apply its lease and retry policy. Durable callers must pass
 * the persisted model binding through the options form; the direct signal form
 * remains for compatibility. The inline pipeline wraps propagated errors to
 * retain its existing fail-closed coverage result.
 */
export function runLongPacketChunkBranch(
  chunk: LongPacketChunk,
  branch: 'mapper',
  signal?: AbortSignal,
): Promise<LongPacketMapperBranchOutcome>
export function runLongPacketChunkBranch(
  chunk: LongPacketChunk,
  branch: 'mapper',
  options: LongPacketChunkBranchRunOptions,
): Promise<LongPacketMapperBranchOutcome>
export function runLongPacketChunkBranch(
  chunk: LongPacketChunk,
  branch: 'safety',
  signal?: AbortSignal,
): Promise<LongPacketSafetyBranchOutcome>
export function runLongPacketChunkBranch(
  chunk: LongPacketChunk,
  branch: 'safety',
  options: LongPacketChunkBranchRunOptions,
): Promise<LongPacketSafetyBranchOutcome>
export function runLongPacketChunkBranch(
  chunk: LongPacketChunk,
  branch: LongPacketChunkBranch,
  signalOrOptions?: AbortSignal | LongPacketChunkBranchRunOptions,
): Promise<LongPacketChunkBranchOutcome>
export async function runLongPacketChunkBranch(
  chunk: LongPacketChunk,
  branch: LongPacketChunkBranch,
  signalOrOptions?: AbortSignal | LongPacketChunkBranchRunOptions,
): Promise<LongPacketChunkBranchOutcome> {
  if (branch !== 'mapper' && branch !== 'safety') {
    throw new LongPacketChunkBranchError('invalid_branch', branch)
  }
  const { signal, model } = normalizeChunkBranchRunOptions(signalOrOptions)
  return executeLongPacketChunkBranch(
    chunk,
    branch,
    signal,
    model,
    DEFAULT_CHUNK_BRANCH_EXECUTORS,
  )
}

function analyzeBranch<
  T extends
    | LongPacketMapperBranchOutcome
    | LongPacketSafetyBranchOutcome,
>(
  plan: LongPacketPlan,
  outcomes: T[],
  branch: T['branch'],
): AnalyzedBranch<T> {
  const expected = new Map(plan.chunks.map((chunk) => [chunk.id, chunk]))
  const grouped = new Map<string, T[]>()
  let unexpectedChunkCount = 0
  for (const outcome of outcomes) {
    if (!expected.has(outcome.chunkId)) unexpectedChunkCount += 1
    const group = grouped.get(outcome.chunkId) ?? []
    group.push(outcome)
    grouped.set(outcome.chunkId, group)
  }

  const accepted: T[] = []
  let missingChunkCount = 0
  let duplicateChunkCount = 0
  let tamperedChunkCount = 0
  let completedChunkCount = 0
  let partialChunkCount = 0
  let failedChunkCount = 0

  for (const chunk of plan.chunks) {
    const group = grouped.get(chunk.id) ?? []
    if (group.length === 0) {
      missingChunkCount += 1
      continue
    }
    if (group.length !== 1) {
      duplicateChunkCount += 1
      continue
    }
    const outcome = group[0]
    const planDigestIsValid =
      chunk.provenanceSha256 === longPacketChunkProvenanceDigest(chunk)
    const resultMatches =
      outcome.result === null
        ? outcome.status === 'failed'
        : branch === 'clinical_mapper'
          ? mapperResultMatchesChunk(
              outcome.result as LongPacketChunkClinicalMap,
              chunk,
            )
          : safetyResultMatchesChunk(
              outcome.result as ValidatedModelSafetyExtraction,
              chunk,
            )
    if (
      !planDigestIsValid ||
      outcome.chunkProvenanceSha256 !== chunk.provenanceSha256 ||
      !resultMatches
    ) {
      tamperedChunkCount += 1
      continue
    }
    accepted.push(outcome)
    if (outcome.status === 'completed') completedChunkCount += 1
    else if (outcome.status === 'partial') partialChunkCount += 1
    else failedChunkCount += 1
  }

  const integrityFailed =
    missingChunkCount > 0 ||
    duplicateChunkCount > 0 ||
    unexpectedChunkCount > 0 ||
    tamperedChunkCount > 0
  const allComplete =
    !integrityFailed &&
    completedChunkCount === plan.chunks.length &&
    partialChunkCount === 0 &&
    failedChunkCount === 0
  const status: LongPacketBranchCoverage['status'] = allComplete
    ? 'complete'
    : integrityFailed || accepted.length === 0
      ? 'failed'
      : 'partial'
  const prefix = branch
  const failureCodes: string[] = []
  if (missingChunkCount > 0) failureCodes.push(`${prefix}_missing_chunk`)
  if (duplicateChunkCount > 0) failureCodes.push(`${prefix}_duplicate_chunk`)
  if (unexpectedChunkCount > 0) failureCodes.push(`${prefix}_unexpected_chunk`)
  if (tamperedChunkCount > 0) failureCodes.push(`${prefix}_tampered_chunk`)
  if (partialChunkCount > 0) failureCodes.push(`${prefix}_partial_chunk`)
  if (failedChunkCount > 0) failureCodes.push(`${prefix}_chunk_failed`)

  return {
    coverage: {
      status,
      expectedChunkCount: plan.chunks.length,
      receivedOutcomeCount: outcomes.length,
      acceptedChunkCount: accepted.length,
      completedChunkCount,
      partialChunkCount,
      failedChunkCount,
      missingChunkCount,
      duplicateChunkCount,
      unexpectedChunkCount,
      tamperedChunkCount,
    },
    accepted,
    failureCodes,
    integrityFailed,
  }
}

function mergeFacts(
  outcomes: LongPacketMapperBranchOutcome[],
): Record<LongPacketFactCategory, LongPacketClinicalFact[]> {
  const maps = new Map<LongPacketFactCategory, Map<string, LongPacketClinicalFact>>()
  for (const category of LONG_PACKET_FACT_CATEGORIES) {
    maps.set(category, new Map())
  }
  for (const outcome of outcomes) {
    for (const fact of outcome.result?.facts ?? []) {
      const key = JSON.stringify({
        category: fact.category,
        key: fact.key,
        statement: fact.statement,
        assertion: fact.assertion,
        temporality: fact.temporality,
        eventDateText: fact.eventDateText,
      })
      const categoryMap = maps.get(fact.category)!
      const existing = categoryMap.get(key)
      categoryMap.set(
        key,
        existing
          ? {
              ...existing,
              evidence: unionEvidence([...existing.evidence, ...fact.evidence]),
            }
          : { ...fact, evidence: unionEvidence(fact.evidence) },
      )
    }
  }
  return Object.fromEntries(
    LONG_PACKET_FACT_CATEGORIES.map((category) => [
      category,
      [...maps.get(category)!.values()],
    ]),
  ) as Record<LongPacketFactCategory, LongPacketClinicalFact[]>
}

function mergeConflicts(
  outcomes: LongPacketMapperBranchOutcome[],
): LongPacketEvidenceConflict[] {
  const merged = new Map<string, LongPacketEvidenceConflict>()
  for (const outcome of outcomes) {
    for (const conflict of outcome.result?.conflicts ?? []) {
      const key = JSON.stringify({
        topic: conflict.topic,
        description: conflict.description,
      })
      const existing = merged.get(key)
      merged.set(
        key,
        existing
          ? {
              ...existing,
              evidence: unionEvidence([
                ...existing.evidence,
                ...conflict.evidence,
              ]),
            }
          : { ...conflict, evidence: unionEvidence(conflict.evidence) },
      )
    }
  }
  return [...merged.values()]
}

function deriveCrossChunkConflicts(
  factsByCategory: Record<LongPacketFactCategory, LongPacketClinicalFact[]>,
): LongPacketEvidenceConflict[] {
  const groups = new Map<string, LongPacketClinicalFact[]>()
  for (const category of LONG_PACKET_FACT_CATEGORIES) {
    for (const fact of factsByCategory[category]) {
      const groupKey = JSON.stringify({
        category,
        key: fact.key,
        temporality: fact.temporality,
        eventDateText: fact.eventDateText,
      })
      const group = groups.get(groupKey) ?? []
      group.push(fact)
      groups.set(groupKey, group)
    }
  }

  const conflicts: LongPacketEvidenceConflict[] = []
  for (const facts of groups.values()) {
    if (facts.length < 2) continue
    const first = facts[0]
    const statements = new Set(facts.map((fact) => fact.statement))
    const assertions = new Set(facts.map((fact) => fact.assertion))
    const contradictoryAssertion =
      assertions.has('present') && assertions.has('negated')
    const materiallyDifferentCurrentClaim =
      ['medication', 'test_result', 'functional_finding'].includes(
        first.category,
      ) &&
      first.temporality !== 'historical' &&
      facts.every((fact) => fact.assertion !== 'negated') &&
      statements.size > 1
    if (!contradictoryAssertion && !materiallyDifferentCurrentClaim) continue

    conflicts.push({
      topic: `${first.category}:${first.key}`,
      description:
        `Incompatible ${first.temporality} ${first.category.replaceAll('_', ' ')} ` +
        `claims for ${first.key} were preserved without selecting a winner.`,
      evidence: unionEvidence(facts.flatMap((fact) => fact.evidence)),
    })
  }
  return conflicts
}

function unionConflicts(
  conflicts: LongPacketEvidenceConflict[],
): LongPacketEvidenceConflict[] {
  const merged = new Map<string, LongPacketEvidenceConflict>()
  for (const conflict of conflicts) {
    const key = JSON.stringify({
      topic: conflict.topic,
      description: conflict.description,
    })
    const existing = merged.get(key)
    merged.set(
      key,
      existing
        ? {
            ...existing,
            evidence: unionEvidence([
              ...existing.evidence,
              ...conflict.evidence,
            ]),
          }
        : { ...conflict, evidence: unionEvidence(conflict.evidence) },
    )
  }
  return [...merged.values()]
}

function mergeSafetySignals(
  outcomes: LongPacketSafetyBranchOutcome[],
): SafetyModelSignal[] {
  const merged = new Map<string, SafetyModelSignal>()
  for (const outcome of outcomes) {
    for (const signal of outcome.result?.signals ?? []) {
      const key = JSON.stringify({
        code: signal.code,
        syndrome: signal.syndrome,
        action: signal.action,
        assertion: signal.assertion,
        temporality: signal.temporality,
        experiencer: signal.experiencer,
      })
      const existing = merged.get(key)
      merged.set(
        key,
        existing
          ? {
              ...existing,
              evidence: unionEvidence([...existing.evidence, ...signal.evidence]),
            }
          : { ...signal, evidence: unionEvidence(signal.evidence) },
      )
    }
  }
  return [...merged.values()]
}

function mergeCriticalUnknowns(
  mapperOutcomes: LongPacketMapperBranchOutcome[],
  safetyOutcomes: LongPacketSafetyBranchOutcome[],
): LongPacketCriticalUnknown[] {
  const merged = new Map<string, LongPacketCriticalUnknown>()
  for (const outcome of mapperOutcomes) {
    for (const fact of outcome.result?.facts ?? []) {
      if (fact.category !== 'critical_unknown') continue
      const key = `clinical_mapper\u0000${fact.statement}`
      const existing = merged.get(key)
      merged.set(key, {
        text: fact.statement,
        source: 'clinical_mapper',
        chunkIds: sortedUnique([
          ...(existing?.chunkIds ?? []),
          outcome.chunkId,
        ]),
        evidence: unionEvidence([
          ...(existing?.evidence ?? []),
          ...fact.evidence,
        ]),
      })
    }
  }
  for (const outcome of safetyOutcomes) {
    for (const unknown of outcome.result?.criticalUnknowns ?? []) {
      const key = `safety_extractor\u0000${unknown}`
      const existing = merged.get(key)
      merged.set(key, {
        text: unknown,
        source: 'safety_extractor',
        chunkIds: sortedUnique([
          ...(existing?.chunkIds ?? []),
          outcome.chunkId,
        ]),
        evidence: existing?.evidence ?? [],
      })
    }
  }
  return [...merged.values()]
}

function narrativeUnits(
  factsByCategory: Record<LongPacketFactCategory, LongPacketClinicalFact[]>,
  conflicts: LongPacketEvidenceConflict[],
  safetySignals: SafetyModelSignal[],
  criticalUnknowns: LongPacketCriticalUnknown[],
): LongPacketNarrativeUnit[] {
  const units: LongPacketNarrativeUnit[] = []
  for (const category of LONG_PACKET_FACT_CATEGORIES) {
    for (const fact of factsByCategory[category]) {
      for (const evidence of fact.evidence) {
        const payload = {
          category: fact.category,
          key: fact.key,
          statement: fact.statement,
          assertion: fact.assertion,
          temporality: fact.temporality,
          eventDateText: fact.eventDateText,
          evidence,
        }
        const id = `fact:${stableDigest(payload)}`
        units.push({
          id,
          kind: 'clinical_fact',
          payload,
          safetyEvidenceIds:
            fact.category === 'red_flag' ||
            fact.category === 'critical_unknown'
              ? [id]
              : [],
        })
      }
    }
  }
  for (const conflict of conflicts) {
    for (const evidence of conflict.evidence) {
      const payload = {
        topic: conflict.topic,
        description: conflict.description,
        evidence,
      }
      const id = `conflict:${stableDigest(payload)}`
      units.push({
        id,
        kind: 'evidence_conflict',
        payload,
        safetyEvidenceIds: [id],
      })
    }
  }
  for (const signal of safetySignals) {
    for (const evidence of signal.evidence) {
      const payload = {
        code: signal.code,
        syndrome: signal.syndrome,
        action: signal.action,
        assertion: signal.assertion,
        temporality: signal.temporality,
        experiencer: signal.experiencer,
        evidence,
      }
      const id = `safety:${stableDigest(payload)}`
      units.push({
        id,
        kind: 'safety_signal',
        payload,
        safetyEvidenceIds: [id],
      })
    }
  }
  for (const unknown of criticalUnknowns) {
    if (unknown.source !== 'safety_extractor') continue
    const payload = {
      text: unknown.text,
      source: unknown.source,
      chunkIds: unknown.chunkIds,
    }
    const id = `unknown:${stableDigest(payload)}`
    units.push({
      id,
      kind: 'critical_unknown',
      payload,
      safetyEvidenceIds: [id],
    })
  }
  return units.sort((left, right) => left.id.localeCompare(right.id))
}

function requiredPinsForInput(
  units: LongPacketNarrativeUnit[],
  fragments: NarrativeReductionNode[],
): string[] {
  return sortedUnique([
    ...units.flatMap((unit) => unit.safetyEvidenceIds),
    ...fragments.flatMap((node) =>
      node.reference.safetyManifestId
        ? [node.reference.safetyManifestId]
        : [],
    ),
  ])
}

function reductionInput(
  stage: number,
  units: LongPacketNarrativeUnit[],
  fragments: NarrativeReductionNode[],
): LongPacketNarrativeReductionInput {
  return {
    stage,
    units,
    fragments: fragments.map((node) => node.reference),
    requiredSafetyEvidenceIds: requiredPinsForInput(units, fragments),
  }
}

function packBoundedInputs(
  stage: number,
  units: LongPacketNarrativeUnit[],
  fragments: NarrativeReductionNode[],
  maximumCharacters: number,
): LongPacketNarrativeReductionInput[] {
  const useUnits = units.length > 0
  const items: Array<LongPacketNarrativeUnit | NarrativeReductionNode> =
    useUnits ? units : fragments
  const batches: LongPacketNarrativeReductionInput[] = []
  let current: Array<LongPacketNarrativeUnit | NarrativeReductionNode> = []

  const build = (
    values: Array<LongPacketNarrativeUnit | NarrativeReductionNode>,
  ) =>
    useUnits
      ? reductionInput(
          stage,
          values as LongPacketNarrativeUnit[],
          [],
        )
      : reductionInput(
          stage,
          [],
          values as NarrativeReductionNode[],
        )

  for (const item of items) {
    const candidate = build([...current, item])
    if (JSON.stringify(candidate).length <= maximumCharacters) {
      current.push(item)
      continue
    }
    if (current.length === 0) {
      throw new Error('A single mandatory reducer unit exceeds the context budget.')
    }
    batches.push(build(current))
    current = [item]
    const single = build(current)
    if (JSON.stringify(single).length > maximumCharacters) {
      throw new Error('A single mandatory reducer unit exceeds the context budget.')
    }
  }
  if (current.length > 0) batches.push(build(current))
  return batches
}

function validateNarrativeFragment(
  value: unknown,
  requiredSafetyEvidenceIds: string[],
): LongPacketNarrativeFragment {
  if (!isRecord(value)) throw new Error('Narrative reducer output must be an object.')
  const allowedKeys = new Set([
    'narrative',
    'timelineNarrative',
    'medicationNarrative',
    'testNarrative',
    'functionalNarrative',
    'conflictNarrative',
    'preservedSafetyEvidenceIds',
  ])
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new Error('Narrative reducer output contains an unknown field.')
  }
  const fields = [
    'narrative',
    'timelineNarrative',
    'medicationNarrative',
    'testNarrative',
    'functionalNarrative',
    'conflictNarrative',
  ] as const
  const strings = fields.map((field) => {
    const item = value[field]
    if (typeof item !== 'string' || item.length > 4_000) {
      throw new Error(`Narrative reducer field ${field} is invalid.`)
    }
    return item
  })
  if (strings.reduce((sum, item) => sum + item.length, 0) > MAX_NARRATIVE_FRAGMENT_CHARACTERS) {
    throw new Error('Narrative reducer output exceeds its bounded total size.')
  }
  if (
    !Array.isArray(value.preservedSafetyEvidenceIds) ||
    value.preservedSafetyEvidenceIds.length > 5_000 ||
    value.preservedSafetyEvidenceIds.some(
      (item) => typeof item !== 'string' || !item || item.length > 160,
    )
  ) {
    throw new Error('Narrative reducer safety evidence manifest is invalid.')
  }
  const preserved = value.preservedSafetyEvidenceIds as string[]
  if (
    preserved.length !== new Set(preserved).size ||
    JSON.stringify([...preserved].sort()) !==
      JSON.stringify([...requiredSafetyEvidenceIds].sort())
  ) {
    throw new Error('Narrative reducer did not preserve every required safety ID.')
  }
  return {
    narrative: value.narrative as string,
    timelineNarrative: value.timelineNarrative as string,
    medicationNarrative: value.medicationNarrative as string,
    testNarrative: value.testNarrative as string,
    functionalNarrative: value.functionalNarrative as string,
    conflictNarrative: value.conflictNarrative as string,
    preservedSafetyEvidenceIds: preserved,
  }
}

function nodeFromFragment(
  fragment: LongPacketNarrativeFragment,
  input: LongPacketNarrativeReductionInput,
  childNodes: NarrativeReductionNode[],
): NarrativeReductionNode {
  const originalSafetyEvidenceIds = sortedUnique([
    ...input.units.flatMap((unit) => unit.safetyEvidenceIds),
    ...childNodes.flatMap((node) => node.originalSafetyEvidenceIds),
  ])
  const safetyManifestId =
    originalSafetyEvidenceIds.length > 0
      ? `manifest:${stableDigest(originalSafetyEvidenceIds)}`
      : null
  const referenceWithoutId = {
    narrative: fragment.narrative,
    timelineNarrative: fragment.timelineNarrative,
    medicationNarrative: fragment.medicationNarrative,
    testNarrative: fragment.testNarrative,
    functionalNarrative: fragment.functionalNarrative,
    conflictNarrative: fragment.conflictNarrative,
    safetyManifestId,
    safetyEvidenceCount: originalSafetyEvidenceIds.length,
  }
  return {
    fragment,
    reference: {
      fragmentId: `fragment:${stableDigest({
        reference: referenceWithoutId,
        sourceInput: input,
      })}`,
      ...referenceWithoutId,
    },
    originalSafetyEvidenceIds,
  }
}

async function recursivelyReduceNarrative(
  units: LongPacketNarrativeUnit[],
  options: Required<
    Pick<
      LongPacketModelPipelineOptions,
      'reduceNarrative' | 'maxReducerInputCharacters'
    >
  >,
): Promise<NarrativeReductionNode | null> {
  if (units.length === 0) return null
  let stage = 0
  let pendingUnits = units
  let pendingNodes: NarrativeReductionNode[] = []

  while (pendingUnits.length > 0 || pendingNodes.length > 1) {
    const batches = packBoundedInputs(
      stage,
      pendingUnits,
      pendingNodes,
      options.maxReducerInputCharacters,
    )
    if (
      pendingUnits.length === 0 &&
      pendingNodes.length > 1 &&
      batches.length >= pendingNodes.length
    ) {
      throw new Error('Recursive narrative reduction cannot make bounded progress.')
    }
    const nextNodes: NarrativeReductionNode[] = []
    for (const input of batches) {
      if (JSON.stringify(input).length > options.maxReducerInputCharacters) {
        throw new Error('Narrative reducer input exceeded its context budget.')
      }
      const rawFragment = await options.reduceNarrative(input)
      const fragment = validateNarrativeFragment(
        rawFragment,
        input.requiredSafetyEvidenceIds,
      )
      const children = pendingUnits.length > 0
        ? []
        : pendingNodes.filter((node) =>
            input.fragments.some(
              (fragmentReference) =>
                fragmentReference.fragmentId === node.reference.fragmentId,
            ),
          )
      nextNodes.push(nodeFromFragment(fragment, input, children))
    }
    pendingUnits = []
    pendingNodes = nextNodes
    stage += 1
  }
  return pendingNodes[0] ?? null
}

export async function runLongPacketNarrativeReducer(
  input: LongPacketNarrativeReductionInput,
  options: { signal?: AbortSignal } = {},
): Promise<LongPacketNarrativeFragment> {
  const result = await invokeBedrockClinicalTool<unknown>({
    system: LONG_PACKET_NARRATIVE_REDUCER_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: JSON.stringify(input),
      },
    ],
    maxTokens: 5_000,
    temperature: 0,
    model: LONG_PACKET_NARRATIVE_REDUCER_MODEL,
    signal: options.signal,
    toolName: 'emit_long_packet_narrative_fusion',
    toolDescription:
      'Emit a narrative-only fusion while preserving every protected safety evidence ID.',
    inputSchema: NARRATIVE_REDUCER_SCHEMA,
  })
  return validateNarrativeFragment(
    result.parsed,
    input.requiredSafetyEvidenceIds,
  )
}

function statusFromCoverage(
  mapper: LongPacketBranchCoverage,
  safety: LongPacketBranchCoverage,
): BranchStatus {
  if (mapper.status === 'complete' && safety.status === 'complete') {
    return 'completed'
  }
  if (mapper.status === 'failed' || safety.status === 'failed') {
    return 'failed'
  }
  return 'partial'
}

function overallCoverageStatus(
  mapper: LongPacketBranchCoverage,
  safety: LongPacketBranchCoverage,
): Extract<CoverageStatus, 'complete' | 'partial' | 'failed'> {
  if (mapper.status === 'complete' && safety.status === 'complete') {
    return 'complete'
  }
  if (mapper.status === 'failed' || safety.status === 'failed') return 'failed'
  return 'partial'
}

function selectSafetyState(
  safetySignals: SafetyModelSignal[],
  factsByCategory: Record<LongPacketFactCategory, LongPacketClinicalFact[]>,
  criticalUnknowns: LongPacketCriticalUnknown[],
  conflicts: LongPacketEvidenceConflict[],
  hasBranchFailure: boolean,
): { carePathway: CarePathway; reviewRequirement: ReviewRequirement } {
  if (safetySignals.some((signal) => signal.action === 'emergency_now')) {
    return {
      carePathway: 'emergency_now',
      reviewRequirement: 'emergency_action',
    }
  }
  const actionableRedFlag = factsByCategory.red_flag.some(
    (fact) =>
      fact.assertion !== 'negated' &&
      fact.temporality !== 'historical',
  )
  if (
    safetySignals.some(
      (signal) => signal.action === 'immediate_clinician_review',
    ) ||
    actionableRedFlag ||
    criticalUnknowns.length > 0 ||
    conflicts.length > 0
  ) {
    return {
      carePathway: 'same_day_clinician_review',
      reviewRequirement: 'immediate_clinician_review',
    }
  }
  if (hasBranchFailure) {
    return {
      carePathway: 'undetermined',
      reviewRequirement: 'immediate_clinician_review',
    }
  }
  return {
    carePathway: 'routine_outpatient',
    reviewRequirement: 'clinician_confirmation',
  }
}

const PERSISTED_PIPELINE_KEYS = [
  'version',
  'status',
  'coverageStatus',
  'clinicianHold',
  'carePathway',
  'reviewRequirement',
  'schedulingLocked',
  'mapperCoverage',
  'safetyCoverage',
  'mapperOutcomes',
  'safetyOutcomes',
  'factsByCategory',
  'conflicts',
  'criticalUnknowns',
  'safetySignals',
  'requiredSafetyEvidenceIds',
  'narrativeSafetyManifestId',
  'narrative',
  'failureCodes',
] as const

const PERSISTED_OUTCOME_KEYS = [
  'branch',
  'chunkId',
  'chunkProvenanceSha256',
  'status',
  'result',
  'failureCode',
] as const

function invalidPersistedPipeline(): never {
  throw new Error('Persisted long-packet model pipeline is invalid.')
}

function validateCompletedPersistedOutcomes(
  plan: LongPacketPlan,
  value: unknown,
  branch: 'clinical_mapper',
): LongPacketMapperBranchOutcome[]
function validateCompletedPersistedOutcomes(
  plan: LongPacketPlan,
  value: unknown,
  branch: 'safety_extractor',
): LongPacketSafetyBranchOutcome[]
function validateCompletedPersistedOutcomes(
  plan: LongPacketPlan,
  value: unknown,
  branch: 'clinical_mapper' | 'safety_extractor',
): LongPacketMapperBranchOutcome[] | LongPacketSafetyBranchOutcome[] {
  if (!Array.isArray(value) || value.length !== plan.chunks.length) {
    invalidPersistedPipeline()
  }
  const chunks = new Map(plan.chunks.map((chunk) => [chunk.id, chunk]))
  for (const rawOutcome of value) {
    if (
      !isRecord(rawOutcome) ||
      !hasExactKeys(rawOutcome, PERSISTED_OUTCOME_KEYS) ||
      rawOutcome.branch !== branch ||
      typeof rawOutcome.chunkId !== 'string' ||
      !rawOutcome.chunkId ||
      rawOutcome.chunkId.length > 1_000 ||
      typeof rawOutcome.chunkProvenanceSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(rawOutcome.chunkProvenanceSha256) ||
      rawOutcome.status !== 'completed' ||
      rawOutcome.failureCode !== null ||
      !isRecord(rawOutcome.result)
    ) {
      invalidPersistedPipeline()
    }
    const chunk = chunks.get(rawOutcome.chunkId)
    if (
      !chunk ||
      rawOutcome.chunkProvenanceSha256 !== chunk.provenanceSha256
    ) {
      invalidPersistedPipeline()
    }
    if (
      branch === 'clinical_mapper'
        ? rawOutcome.result.coverageStatus !== 'complete' ||
          !mapperResultMatchesChunk(
            rawOutcome.result as unknown as LongPacketChunkClinicalMap,
            chunk,
          )
        : rawOutcome.result.dataQuality !== 'sufficient' ||
          !safetyResultMatchesChunk(
            rawOutcome.result as unknown as ValidatedModelSafetyExtraction,
            chunk,
          )
    ) {
      invalidPersistedPipeline()
    }
  }
  return value as
    | LongPacketMapperBranchOutcome[]
    | LongPacketSafetyBranchOutcome[]
}

/**
 * Revalidates an untrusted persisted pipeline using the same provenance,
 * aggregation, safety selection, and evidence-manifest logic as live reduce.
 */
export function validatePersistedLongPacketModelPipeline(
  plan: LongPacketPlan,
  modelMapResult: unknown,
  value: unknown,
): LongPacketModelPipelineResult {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, PERSISTED_PIPELINE_KEYS)
  ) {
    invalidPersistedPipeline()
  }
  const mapperOutcomes = validateCompletedPersistedOutcomes(
    plan,
    value.mapperOutcomes,
    'clinical_mapper',
  )
  const safetyOutcomes = validateCompletedPersistedOutcomes(
    plan,
    value.safetyOutcomes,
    'safety_extractor',
  )
  const mapper = analyzeBranch(plan, mapperOutcomes, 'clinical_mapper')
  const safety = analyzeBranch(plan, safetyOutcomes, 'safety_extractor')
  if (
    mapper.coverage.status !== 'complete' ||
    safety.coverage.status !== 'complete' ||
    mapper.accepted.length !== plan.chunks.length ||
    safety.accepted.length !== plan.chunks.length
  ) {
    invalidPersistedPipeline()
  }

  const acceptedMapper = mapper.accepted as LongPacketMapperBranchOutcome[]
  const acceptedSafety = safety.accepted as LongPacketSafetyBranchOutcome[]
  const factsByCategory = mergeFacts(acceptedMapper)
  const conflicts = unionConflicts([
    ...mergeConflicts(acceptedMapper),
    ...deriveCrossChunkConflicts(factsByCategory),
  ])
  const safetySignals = mergeSafetySignals(acceptedSafety)
  const criticalUnknowns = mergeCriticalUnknowns(
    acceptedMapper,
    acceptedSafety,
  )
  const failureCodes = sortedUnique([
    ...mapper.failureCodes,
    ...safety.failureCodes,
  ])
  const status = statusFromCoverage(mapper.coverage, safety.coverage)
  const coverageStatus = overallCoverageStatus(
    mapper.coverage,
    safety.coverage,
  )
  const units = narrativeUnits(
    factsByCategory,
    conflicts,
    safetySignals,
    criticalUnknowns,
  )
  const requiredSafetyEvidenceIds = sortedUnique(
    units.flatMap((unit) => unit.safetyEvidenceIds),
  )
  if (units.length === 0) {
    if (value.narrative !== null) invalidPersistedPipeline()
  } else {
    validateNarrativeFragment(value.narrative, requiredSafetyEvidenceIds)
  }
  const narrativeSafetyManifestId =
    requiredSafetyEvidenceIds.length > 0
      ? `manifest:${stableDigest(requiredSafetyEvidenceIds)}`
      : null
  const safetyState = selectSafetyState(
    safetySignals,
    factsByCategory,
    criticalUnknowns,
    conflicts,
    failureCodes.length > 0 || status !== 'completed',
  )
  const clinicianHold =
    failureCodes.length > 0 ||
    status !== 'completed' ||
    safetyState.carePathway === 'emergency_now' ||
    safetyState.carePathway === 'same_day_clinician_review' ||
    safetyState.carePathway === 'undetermined'

  if (
    value.version !== LONG_PACKET_MODEL_PIPELINE_VERSION ||
    value.status !== status ||
    value.coverageStatus !== coverageStatus ||
    value.clinicianHold !== clinicianHold ||
    value.carePathway !== safetyState.carePathway ||
    value.reviewRequirement !== safetyState.reviewRequirement ||
    value.schedulingLocked !== true ||
    !canonicalEquals(modelMapResult, mapper.coverage) ||
    !canonicalEquals(value.mapperCoverage, mapper.coverage) ||
    !canonicalEquals(value.safetyCoverage, safety.coverage) ||
    !canonicalEquals(value.factsByCategory, factsByCategory) ||
    !canonicalEquals(value.conflicts, conflicts) ||
    !canonicalEquals(value.criticalUnknowns, criticalUnknowns) ||
    !canonicalEquals(value.safetySignals, safetySignals) ||
    !canonicalEquals(
      value.requiredSafetyEvidenceIds,
      requiredSafetyEvidenceIds,
    ) ||
    value.narrativeSafetyManifestId !== narrativeSafetyManifestId ||
    !canonicalEquals(value.failureCodes, failureCodes)
  ) {
    invalidPersistedPipeline()
  }

  return value as unknown as LongPacketModelPipelineResult
}

function aggregateSafetyExtraction(
  carePathway: CarePathway,
  conflicts: LongPacketEvidenceConflict[],
  criticalUnknowns: LongPacketCriticalUnknown[],
  safetySignals: SafetyModelSignal[],
): ValidatedModelSafetyExtraction {
  return {
    carePathway:
      carePathway === 'routine_outpatient'
        ? 'no_time_critical_signal'
        : carePathway === 'emergency_now' ||
            carePathway === 'same_day_clinician_review' ||
            carePathway === 'undetermined'
          ? carePathway
          : 'undetermined',
    dataQuality:
      conflicts.length > 0
        ? 'conflicting'
        : criticalUnknowns.length > 0
          ? 'partial'
          : 'sufficient',
    criticalUnknowns: criticalUnknowns.map((unknown) => unknown.text),
    signals: safetySignals,
  }
}

/**
 * Rebuilds mapper-plus-safety aggregate authority when both branches are
 * complete but narrative reduction alone failed. This preserves cross-chunk
 * conflicts and mapper red flags without authorizing extraction completion.
 */
export function validatePersistedLongPacketAggregateSafety(
  plan: LongPacketPlan,
  modelMapResult: unknown,
  value: unknown,
): ValidatedModelSafetyExtraction {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, PERSISTED_PIPELINE_KEYS) ||
    value.version !== LONG_PACKET_MODEL_PIPELINE_VERSION
  ) {
    invalidPersistedPipeline()
  }
  if (value.status === 'completed' && value.coverageStatus === 'complete') {
    const pipeline = validatePersistedLongPacketModelPipeline(
      plan,
      modelMapResult,
      value,
    )
    return aggregateSafetyExtraction(
      pipeline.carePathway,
      pipeline.conflicts,
      pipeline.criticalUnknowns,
      pipeline.safetySignals,
    )
  }
  const mapperOutcomes = validateCompletedPersistedOutcomes(
    plan,
    value.mapperOutcomes,
    'clinical_mapper',
  )
  const safetyOutcomes = validateCompletedPersistedOutcomes(
    plan,
    value.safetyOutcomes,
    'safety_extractor',
  )
  const mapper = analyzeBranch(plan, mapperOutcomes, 'clinical_mapper')
  const safety = analyzeBranch(plan, safetyOutcomes, 'safety_extractor')
  if (
    mapper.coverage.status !== 'complete' ||
    safety.coverage.status !== 'complete' ||
    mapper.accepted.length !== plan.chunks.length ||
    safety.accepted.length !== plan.chunks.length
  ) {
    invalidPersistedPipeline()
  }
  const acceptedMapper = mapper.accepted as LongPacketMapperBranchOutcome[]
  const acceptedSafety = safety.accepted as LongPacketSafetyBranchOutcome[]
  const factsByCategory = mergeFacts(acceptedMapper)
  const conflicts = unionConflicts([
    ...mergeConflicts(acceptedMapper),
    ...deriveCrossChunkConflicts(factsByCategory),
  ])
  const safetySignals = mergeSafetySignals(acceptedSafety)
  const criticalUnknowns = mergeCriticalUnknowns(
    acceptedMapper,
    acceptedSafety,
  )
  const units = narrativeUnits(
    factsByCategory,
    conflicts,
    safetySignals,
    criticalUnknowns,
  )
  if (units.length === 0) invalidPersistedPipeline()
  const requiredSafetyEvidenceIds = sortedUnique(
    units.flatMap((unit) => unit.safetyEvidenceIds),
  )
  const safetyState = selectSafetyState(
    safetySignals,
    factsByCategory,
    criticalUnknowns,
    conflicts,
    true,
  )
  if (
    value.status !== 'partial' ||
    value.coverageStatus !== 'partial' ||
    value.clinicianHold !== true ||
    value.carePathway !== safetyState.carePathway ||
    value.reviewRequirement !== safetyState.reviewRequirement ||
    value.schedulingLocked !== true ||
    value.narrative !== null ||
    value.narrativeSafetyManifestId !== null ||
    !canonicalEquals(value.failureCodes, ['narrative_reducer_failed']) ||
    !canonicalEquals(modelMapResult, mapper.coverage) ||
    !canonicalEquals(value.mapperCoverage, mapper.coverage) ||
    !canonicalEquals(value.safetyCoverage, safety.coverage) ||
    !canonicalEquals(value.factsByCategory, factsByCategory) ||
    !canonicalEquals(value.conflicts, conflicts) ||
    !canonicalEquals(value.criticalUnknowns, criticalUnknowns) ||
    !canonicalEquals(value.safetySignals, safetySignals) ||
    !canonicalEquals(
      value.requiredSafetyEvidenceIds,
      requiredSafetyEvidenceIds,
    )
  ) {
    invalidPersistedPipeline()
  }
  return aggregateSafetyExtraction(
    safetyState.carePathway,
    conflicts,
    criticalUnknowns,
    safetySignals,
  )
}

/**
 * Rebuilds only the independently validated safety branch. This is used for
 * terminal error projection when mapper or narrative finalization failed;
 * it never authorizes packet completion or outpatient scoring.
 */
export function validatePersistedLongPacketSafetyBranch(
  plan: LongPacketPlan,
  value: unknown,
): ValidatedModelSafetyExtraction {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, PERSISTED_PIPELINE_KEYS) ||
    value.version !== LONG_PACKET_MODEL_PIPELINE_VERSION
  ) {
    invalidPersistedPipeline()
  }
  const safetyOutcomes = validateCompletedPersistedOutcomes(
    plan,
    value.safetyOutcomes,
    'safety_extractor',
  )
  const safety = analyzeBranch(plan, safetyOutcomes, 'safety_extractor')
  if (
    safety.coverage.status !== 'complete' ||
    safety.accepted.length !== plan.chunks.length
  ) {
    invalidPersistedPipeline()
  }
  const accepted = safety.accepted as LongPacketSafetyBranchOutcome[]
  const signals = mergeSafetySignals(accepted)
  const criticalUnknowns = sortedUnique(
    accepted.flatMap((outcome) => outcome.result?.criticalUnknowns ?? []),
  )
  const hasEmergency = signals.some(
    (signal) => signal.action === 'emergency_now',
  )
  const hasImmediateReview = signals.some(
    (signal) => signal.action === 'immediate_clinician_review',
  )
  const hasUndetermined = accepted.some(
    (outcome) => outcome.result?.carePathway === 'undetermined',
  )
  return {
    carePathway: hasEmergency
      ? 'emergency_now'
      : hasImmediateReview || criticalUnknowns.length > 0
        ? 'same_day_clinician_review'
        : hasUndetermined
          ? 'undetermined'
          : 'no_time_critical_signal',
    dataQuality: criticalUnknowns.length > 0 ? 'partial' : 'sufficient',
    criticalUnknowns,
    signals,
  }
}

export async function reduceLongPacketModelOutcomes(
  plan: LongPacketPlan,
  mapperOutcomes: LongPacketMapperBranchOutcome[],
  safetyOutcomes: LongPacketSafetyBranchOutcome[],
  options: Pick<
    LongPacketModelPipelineOptions,
    'reduceNarrative' | 'maxReducerInputCharacters' | 'signal'
  > = {},
): Promise<LongPacketModelPipelineResult> {
  const mapper = analyzeBranch(plan, mapperOutcomes, 'clinical_mapper')
  const safety = analyzeBranch(plan, safetyOutcomes, 'safety_extractor')
  const acceptedMapper = mapper.accepted as LongPacketMapperBranchOutcome[]
  const acceptedSafety = safety.accepted as LongPacketSafetyBranchOutcome[]
  const factsByCategory = mergeFacts(acceptedMapper)
  const conflicts = unionConflicts([
    ...mergeConflicts(acceptedMapper),
    ...deriveCrossChunkConflicts(factsByCategory),
  ])
  const safetySignals = mergeSafetySignals(acceptedSafety)
  const criticalUnknowns = mergeCriticalUnknowns(
    acceptedMapper,
    acceptedSafety,
  )
  const failureCodes = sortedUnique([
    ...mapper.failureCodes,
    ...safety.failureCodes,
  ])
  let status = statusFromCoverage(mapper.coverage, safety.coverage)
  let coverageStatus = overallCoverageStatus(
    mapper.coverage,
    safety.coverage,
  )
  const units = narrativeUnits(
    factsByCategory,
    conflicts,
    safetySignals,
    criticalUnknowns,
  )
  const requiredSafetyEvidenceIds = sortedUnique(
    units.flatMap((unit) => unit.safetyEvidenceIds),
  )
  let narrativeNode: NarrativeReductionNode | null = null
  if (units.length > 0) {
    try {
      narrativeNode = await recursivelyReduceNarrative(units, {
        reduceNarrative:
          options.reduceNarrative ??
          ((input) =>
            runLongPacketNarrativeReducer(input, {
              signal: options.signal,
            })),
        maxReducerInputCharacters:
          options.maxReducerInputCharacters ??
          DEFAULT_MAX_REDUCER_INPUT_CHARACTERS,
      })
      if (
        JSON.stringify(narrativeNode?.originalSafetyEvidenceIds ?? []) !==
        JSON.stringify(requiredSafetyEvidenceIds)
      ) {
        throw new Error('Narrative safety manifest does not cover all evidence.')
      }
    } catch {
      failureCodes.push('narrative_reducer_failed')
      if (status === 'completed') status = 'partial'
      if (coverageStatus === 'complete') coverageStatus = 'partial'
      narrativeNode = null
    }
  }

  const hasFailure = failureCodes.length > 0 || status !== 'completed'
  const safetyState = selectSafetyState(
    safetySignals,
    factsByCategory,
    criticalUnknowns,
    conflicts,
    hasFailure,
  )
  const clinicianHold =
    hasFailure ||
    safetyState.carePathway === 'emergency_now' ||
    safetyState.carePathway === 'same_day_clinician_review' ||
    safetyState.carePathway === 'undetermined'

  return {
    version: LONG_PACKET_MODEL_PIPELINE_VERSION,
    status,
    coverageStatus,
    clinicianHold,
    carePathway: safetyState.carePathway,
    reviewRequirement: safetyState.reviewRequirement,
    schedulingLocked: true,
    mapperCoverage: mapper.coverage,
    safetyCoverage: safety.coverage,
    mapperOutcomes,
    safetyOutcomes,
    factsByCategory,
    conflicts,
    criticalUnknowns,
    safetySignals,
    requiredSafetyEvidenceIds,
    narrativeSafetyManifestId:
      narrativeNode?.reference.safetyManifestId ?? null,
    narrative: narrativeNode?.fragment ?? null,
    failureCodes: sortedUnique(failureCodes),
  }
}

async function boundedMap<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 100) {
    throw new Error('Long-packet model concurrency must be between 1 and 100.')
  }
  const results = new Array<R>(values.length)
  const failures: Array<{ index: number; error: unknown }> = []
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor
        cursor += 1
        try {
          results[index] = await operation(values[index])
        } catch (error) {
          failures.push({ index, error })
        }
      }
    },
  )
  await Promise.all(workers)
  if (failures.length > 0) {
    failures.sort(
      (left, right) =>
        callbackFailureRank(right.error) - callbackFailureRank(left.error) ||
        left.index - right.index,
    )
    throw failures[0].error
  }
  return results
}

function callbackFailureRank(error: unknown): number {
  const cause =
    error instanceof LongPacketOutcomeCallbackError ? error.cause : error
  if (!isRecord(cause)) return 0
  if (cause.carePathway === 'emergency_now') return 2
  if (cause.carePathway === 'same_day_clinician_review') return 1
  return 0
}

export async function runLongPacketModelPipeline(
  plan: LongPacketPlan,
  options: LongPacketModelPipelineOptions = {},
): Promise<LongPacketModelPipelineResult> {
  const executors: LongPacketChunkBranchExecutors = {
    mapChunk:
      options.mapChunk ?? DEFAULT_CHUNK_BRANCH_EXECUTORS.mapChunk,
    extractSafety:
      options.extractSafety ?? DEFAULT_CHUNK_BRANCH_EXECUTORS.extractSafety,
  }

  const pairedOutcomes = await boundedMap(
    plan.chunks,
    options.maxConcurrentChunks ?? DEFAULT_MAX_CONCURRENT_CHUNKS,
    async (chunk) => {
      const [mapperSettled, safetySettled] = await Promise.allSettled([
        executeLongPacketChunkBranch(
          chunk,
          'mapper',
          options.signal,
          undefined,
          executors,
        ).then(async (outcome) => {
          try {
            await options.onMapperOutcome?.(
              outcome as LongPacketMapperBranchOutcome,
            )
          } catch (error) {
            throw new LongPacketOutcomeCallbackError(error)
          }
          return outcome
        }),
        executeLongPacketChunkBranch(
          chunk,
          'safety',
          options.signal,
          undefined,
          executors,
        ).then(async (outcome) => {
          try {
            await options.onSafetyOutcome?.(
              outcome as LongPacketSafetyBranchOutcome,
            )
          } catch (error) {
            throw new LongPacketOutcomeCallbackError(error)
          }
          return outcome
        }),
      ])
      const callbackFailures = [mapperSettled, safetySettled]
        .filter(
          (settled): settled is PromiseRejectedResult =>
            settled.status === 'rejected' &&
            settled.reason instanceof LongPacketOutcomeCallbackError,
        )
        .map((settled) => settled.reason as LongPacketOutcomeCallbackError)
        .sort(
          (left, right) =>
            callbackFailureRank(right) - callbackFailureRank(left),
        )
      if (callbackFailures.length > 0) {
        throw callbackFailures[0]
      }
      const mapper: LongPacketMapperBranchOutcome =
        mapperSettled.status === 'fulfilled'
          ? (mapperSettled.value as LongPacketMapperBranchOutcome)
          : {
          branch: 'clinical_mapper',
          chunkId: chunk.id,
          chunkProvenanceSha256: chunk.provenanceSha256,
          status: 'failed',
          result: null,
          failureCode: 'schema_model_or_transport_failure',
        }
      const safety: LongPacketSafetyBranchOutcome =
        safetySettled.status === 'fulfilled'
          ? (safetySettled.value as LongPacketSafetyBranchOutcome)
          : {
          branch: 'safety_extractor',
          chunkId: chunk.id,
          chunkProvenanceSha256: chunk.provenanceSha256,
          status: 'failed',
          result: null,
          failureCode: 'schema_model_or_transport_failure',
        }
      return { mapper, safety }
    },
  )

  return reduceLongPacketModelOutcomes(
    plan,
    pairedOutcomes.map((pair) => pair.mapper),
    pairedOutcomes.map((pair) => pair.safety),
    options,
  )
}
