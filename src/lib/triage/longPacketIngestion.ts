import { createHash } from 'node:crypto'

import { canonicalLongPacketJSONStringify } from './longPacketCanonicalHash'
import type {
  ExtractionKeyFindings,
  TriageConfidence,
} from './types'
import {
  LONG_PACKET_EMERGENCY_VERSION,
  scanLongPacketEmergency,
} from './longPacketEmergency'
import {
  LONG_PACKET_CLINICAL_MAPPER_PROMPT_VERSION,
  type LongPacketClinicalFact,
  type LongPacketFactCategory,
} from './longPacketClinicalMapper'
import {
  LONG_PACKET_NARRATIVE_REDUCER_MODEL,
  LONG_PACKET_NARRATIVE_REDUCER_PROMPT_VERSION,
  validatePersistedLongPacketModelPipeline,
  type LongPacketModelPipelineResult,
} from './longPacketModelPipeline'
import {
  LONG_PACKET_PLANNER_VERSION,
  assertCompleteLongPacketCoverage,
  planLongPacketChunks,
  type LongPacketPlan,
  type LongPacketSourceDocument,
  type LongPacketSourcePage,
} from './longPacketPlanner'
import { MODEL_SAFETY_EXTRACTION_PROMPT_VERSION } from './modelSafetyExtractor'
import type { ValidatedModelSafetyExtraction } from './modelSafetyExtraction'
import type { PersistableEmergencyGatewayResult } from './gatewayPersistence'
import {
  selectDominantBoundedSafetyEvidence,
  type SafetyEvidenceSignalInput,
} from './safetyEvidenceSelection'

export const LONG_PACKET_SOURCE_MANIFEST_VERSION =
  'neurology-long-packet-source-manifest-v1'

export interface LongPacketFullPipelinePromptBindings {
  planner: string
  deterministicEmergency: string
  clinicalMapper: string
  safetyExtractor: string
  narrativeReducer: string
  clinicalMapperModel: string
  safetyExtractorModel: string
  narrativeReducerModel: string
}

/**
 * Immutable full-pipeline provenance registry. An evaluated model is not
 * interchangeable with another evaluated model: each approved prompt/model
 * tuple is listed as one exact, schema-versioned binding.
 */
export const LONG_PACKET_FULL_PIPELINE_PROMPT_BINDING_ALLOWLIST: readonly LongPacketFullPipelinePromptBindings[] =
  Object.freeze([
    Object.freeze({
      planner: LONG_PACKET_PLANNER_VERSION,
      deterministicEmergency: LONG_PACKET_EMERGENCY_VERSION,
      clinicalMapper: LONG_PACKET_CLINICAL_MAPPER_PROMPT_VERSION,
      safetyExtractor: MODEL_SAFETY_EXTRACTION_PROMPT_VERSION,
      narrativeReducer: LONG_PACKET_NARRATIVE_REDUCER_PROMPT_VERSION,
      clinicalMapperModel:
        'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      safetyExtractorModel: 'us.anthropic.claude-sonnet-5',
      narrativeReducerModel: LONG_PACKET_NARRATIVE_REDUCER_MODEL,
    }),
  ])

export const LONG_PACKET_FULL_PIPELINE_DEFAULT_BINDINGS =
  LONG_PACKET_FULL_PIPELINE_PROMPT_BINDING_ALLOWLIST[0]

const FULL_PIPELINE_BINDING_KEYS = [
  'planner',
  'deterministicEmergency',
  'clinicalMapper',
  'safetyExtractor',
  'narrativeReducer',
  'clinicalMapperModel',
  'safetyExtractorModel',
  'narrativeReducerModel',
] as const

export interface PersistedLongPacketSourcePage extends LongPacketSourcePage {
  documentId: string
}

export interface LongPacketIngestionArtifacts {
  ingestionMode: 'single_pass' | 'long_packet'
  sourcePages: PersistedLongPacketSourcePage[]
  sourceSha256: string
  documents: LongPacketSourceDocument[]
  plan: ReturnType<typeof planLongPacketChunks>
  emergency: ReturnType<typeof scanLongPacketEmergency>
}

export interface LongPacketClinicalExtraction {
  noteTypeDetected: 'unknown'
  extractionConfidence: TriageConfidence
  extractedSummary: string
  keyFindings: ExtractionKeyFindings
}

export function longPacketSourceDigest(
  packetId: string,
  pages: PersistedLongPacketSourcePage[],
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: LONG_PACKET_SOURCE_MANIFEST_VERSION,
        packetId,
        pages,
      }),
      'utf8',
    )
    .digest('hex')
}

export function buildLongPacketIngestionArtifacts(input: {
  packetId: string
  documentId: string
  text: string
  pages?: LongPacketSourcePage[]
  singlePassCharacterLimit: number
}): LongPacketIngestionArtifacts {
  const pages =
    input.pages ??
    [
      {
        pageNumber: 1,
        text: input.text,
        extractionMethod: 'native_text' as const,
        extractionConfidence: null,
      },
    ]
  const reconstructedText = pages.map((page) => page.text).join('\n\n')
  if (reconstructedText !== input.text) {
    throw new Error(
      'Source pages must reconstruct the complete immutable source text.',
    )
  }
  if (
    !Number.isSafeInteger(input.singlePassCharacterLimit) ||
    input.singlePassCharacterLimit < 1
  ) {
    throw new Error('Single-pass character limit is invalid.')
  }

  const sourcePages = pages.map((page) => ({
    documentId: input.documentId,
    ...page,
  }))
  const documents: LongPacketSourceDocument[] = [
    {
      packetId: input.packetId,
      expectedDocumentCount: 1,
      documentId: input.documentId,
      documentOrder: 1,
      expectedPageCount: pages.length,
      pages,
    },
  ]
  const plan = planLongPacketChunks(documents)

  return {
    ingestionMode:
      input.text.length > input.singlePassCharacterLimit
        ? 'long_packet'
        : 'single_pass',
    sourcePages,
    sourceSha256: longPacketSourceDigest(input.packetId, sourcePages),
    documents,
    plan,
    emergency: scanLongPacketEmergency(plan),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function canonicalJson(value: unknown): string {
  const canonicalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonicalize)
    if (isRecord(item)) {
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, canonicalize(item[key])]),
      )
    }
    return item
  }
  return JSON.stringify(canonicalize(value))
}

export function validateLongPacketFullPipelinePromptBindings(
  value: unknown,
): LongPacketFullPipelinePromptBindings {
  if (!isRecord(value)) {
    throw new Error('Persisted long-packet full-pipeline bindings are invalid.')
  }
  const actualKeys = Object.keys(value).sort()
  const expectedKeys = [...FULL_PIPELINE_BINDING_KEYS].sort()
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error('Persisted long-packet full-pipeline bindings are invalid.')
  }
  const allowed = LONG_PACKET_FULL_PIPELINE_PROMPT_BINDING_ALLOWLIST.find(
    (candidate) => canonicalJson(candidate) === canonicalJson(value),
  )
  if (!allowed) {
    throw new Error('Persisted long-packet full-pipeline bindings are invalid.')
  }
  return allowed
}

function validatedSourcePages(
  value: unknown,
): PersistedLongPacketSourcePage[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Persisted long-packet source pages are invalid.')
  }
  return value.map((page, index) => {
    if (
      isRecord(page) &&
      Number.isSafeInteger(page.pageNumber) &&
      page.pageNumber !== index + 1
    ) {
      throw new Error('Persisted long-packet source page order is invalid.')
    }
    if (
      !isRecord(page) ||
      typeof page.documentId !== 'string' ||
      !page.documentId.trim() ||
      !Number.isSafeInteger(page.pageNumber) ||
      (page.pageNumber as number) < 1 ||
      typeof page.text !== 'string' ||
      !page.text ||
      (page.extractionMethod !== 'native_text' &&
        page.extractionMethod !== 'ocr') ||
      (page.extractionConfidence !== null &&
        (typeof page.extractionConfidence !== 'number' ||
          !Number.isFinite(page.extractionConfidence)))
    ) {
      throw new Error(`Persisted long-packet source page ${index} is invalid.`)
    }
    return page as unknown as PersistedLongPacketSourcePage
  })
}

function evidenceMatchesPage(
  evidence: Record<string, unknown>,
  pages: PersistedLongPacketSourcePage[],
): boolean {
  const page = pages.find(
    (candidate) =>
      candidate.documentId === evidence.documentId &&
      candidate.pageNumber === evidence.pageNumber,
  )
  return Boolean(
    page &&
      typeof evidence.quote === 'string' &&
      Number.isSafeInteger(evidence.startOffset) &&
      Number.isSafeInteger(evidence.endOffset) &&
      (evidence.startOffset as number) >= 0 &&
      (evidence.endOffset as number) > (evidence.startOffset as number) &&
      page.text.slice(
        evidence.startOffset as number,
        evidence.endOffset as number,
      ) === evidence.quote,
  )
}

export interface ValidatedLongPacketSafetyArtifacts {
  gateway: PersistableEmergencyGatewayResult
  safetyResult: ValidatedModelSafetyExtraction
  evidenceLines: string[]
  pipelineComplete: boolean
  validatedPipeline?: LongPacketModelPipelineResult
}

function safetyArtifactsFromValidatedPipeline(input: {
  pages: PersistedLongPacketSourcePage[]
  gateway: PersistableEmergencyGatewayResult
  pipeline: LongPacketModelPipelineResult
}): ValidatedLongPacketSafetyArtifacts {
  const { pages, gateway, pipeline } = input
  const redFlagFacts = pipeline.factsByCategory?.red_flag ?? []
  const actionableRedFlag = redFlagFacts.some(
    (fact) =>
      fact.assertion !== 'negated' &&
      fact.temporality !== 'historical' &&
      fact.evidence.length > 0 &&
      fact.evidence.every((evidence) =>
        evidenceMatchesPage(evidence as unknown as Record<string, unknown>, pages),
      ),
  )
  const emergencySignal = pipeline.safetySignals.some(
    (signal) => signal.action === 'emergency_now',
  )
  const immediateSignal = pipeline.safetySignals.some(
    (signal) => signal.action === 'immediate_clinician_review',
  )
  const criticalUnknowns = pipeline.criticalUnknowns.map((unknown) => unknown.text)
  const safetyResult: ValidatedModelSafetyExtraction = {
    carePathway: emergencySignal
      ? 'emergency_now'
      : immediateSignal ||
          actionableRedFlag ||
          criticalUnknowns.length > 0 ||
          pipeline.conflicts.length > 0
        ? 'same_day_clinician_review'
        : 'no_time_critical_signal',
    dataQuality:
      pipeline.conflicts.length > 0
        ? 'conflicting'
        : criticalUnknowns.length > 0
          ? 'partial'
          : 'sufficient',
    criticalUnknowns,
    signals: pipeline.safetySignals,
  }

  const evidenceLines = [
    ...gateway.signals.flatMap((signal) =>
      signal.evidence.map((evidence) => `${signal.code}: ${evidence.quote}`),
    ),
    ...pipeline.safetySignals.flatMap((signal) =>
      signal.evidence.map((evidence) => `${signal.code}: ${evidence.quote}`),
    ),
    ...criticalUnknowns.map((unknown) => `critical_unknown: ${unknown}`),
    ...pipeline.conflicts.map(
      (conflict) => `source_conflict: ${conflict.description}`,
    ),
  ]

  return {
    gateway,
    safetyResult,
    evidenceLines: [...new Set(evidenceLines)],
    pipelineComplete: true,
    validatedPipeline: pipeline,
  }
}

/**
 * Validates a complete persisted model pipeline against a caller-provided
 * deterministic plan that has been independently rebuilt from source pages.
 * This deliberately does not trust redundant persisted plan, digest, status,
 * or ingestion-label columns.
 */
export function validatePersistedLongPacketModelSafetyArtifacts(input: {
  sourcePages: unknown
  packetPlan: LongPacketPlan
  modelMapResult: unknown
  modelReduceResult: unknown
  safetyPromptVersions: unknown
}): ValidatedLongPacketSafetyArtifacts {
  validateLongPacketFullPipelinePromptBindings(input.safetyPromptVersions)
  const pages = validatedSourcePages(input.sourcePages)
  if (!isRecord(input.packetPlan)) {
    throw new Error('Persisted long-packet plan is invalid.')
  }
  const documentIds = [...new Set(pages.map((page) => page.documentId))]
  if (documentIds.length !== 1) {
    throw new Error('Persisted long-packet v1 requires exactly one document.')
  }
  const documentPages = pages.map((page) => ({
    pageNumber: page.pageNumber,
    text: page.text,
    extractionMethod: page.extractionMethod,
    extractionConfidence: page.extractionConfidence,
  }))
  const documents: LongPacketSourceDocument[] = [
    {
      packetId: input.packetPlan.packetId,
      expectedDocumentCount: 1,
      documentId: documentIds[0],
      documentOrder: 1,
      expectedPageCount: documentPages.length,
      pages: documentPages,
    },
  ]
  assertCompleteLongPacketCoverage(input.packetPlan, documents)
  const gateway = scanLongPacketEmergency(input.packetPlan)
  const pipeline = validatePersistedLongPacketModelPipeline(
    input.packetPlan,
    input.modelMapResult,
    input.modelReduceResult,
  )
  return safetyArtifactsFromValidatedPipeline({ pages, gateway, pipeline })
}

export function validatePersistedLongPacketSafetyArtifacts(input: {
  text: string
  sourcePages: unknown
  sourceSha256: unknown
  packetPlan: unknown
  packetEmergencyResult: unknown
  modelMapResult: unknown
  modelReduceResult: unknown
  safetyPromptVersions: unknown
}): ValidatedLongPacketSafetyArtifacts {
  validateLongPacketFullPipelinePromptBindings(input.safetyPromptVersions)
  const pages = validatedSourcePages(input.sourcePages)
  if (!isRecord(input.packetPlan)) {
    throw new Error('Persisted long-packet plan is invalid.')
  }
  const plan = input.packetPlan as unknown as ReturnType<
    typeof planLongPacketChunks
  >
  const documentIds = [...new Set(pages.map((page) => page.documentId))]
  if (documentIds.length !== 1) {
    throw new Error('Persisted long-packet v1 requires exactly one document.')
  }
  const documentPages = [...pages]
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text,
      extractionMethod: page.extractionMethod,
      extractionConfidence: page.extractionConfidence,
    }))
  const documents: LongPacketSourceDocument[] = [
    {
      packetId: plan.packetId,
      expectedDocumentCount: 1,
      documentId: documentIds[0],
      documentOrder: 1,
      expectedPageCount: documentPages.length,
      pages: documentPages,
    },
  ]
  assertCompleteLongPacketCoverage(plan, documents)
  if (documentPages.map((page) => page.text).join('\n\n') !== input.text) {
    throw new Error('Persisted source pages do not reconstruct source text.')
  }
  if (
    typeof input.sourceSha256 !== 'string' ||
    input.sourceSha256 !== longPacketSourceDigest(plan.packetId, pages)
  ) {
    throw new Error('Persisted long-packet source digest is invalid.')
  }

  const recomputedEmergency = scanLongPacketEmergency(plan)
  if (
    canonicalJson(input.packetEmergencyResult) !==
    canonicalJson(recomputedEmergency)
  ) {
    throw new Error('Persisted long-packet emergency scan is invalid.')
  }

  const pipeline = validatePersistedLongPacketModelPipeline(
    plan,
    input.modelMapResult,
    input.modelReduceResult,
  )
  return safetyArtifactsFromValidatedPipeline({
    pages,
    gateway: recomputedEmergency,
    pipeline,
  })
}

export function buildLongPacketAdjudicationText(input: {
  extractedSummary: string
  safetyArtifacts: ValidatedLongPacketSafetyArtifacts
}): string {
  if (!input.extractedSummary.trim()) {
    throw new Error('Persisted long-packet summary is missing.')
  }
  const MAX_ADJUDICATION_CHARACTERS = 40_000
  const MAX_EVIDENCE_QUOTE_CHARACTERS = 700
  const MAX_UNKNOWNS = 4
  const MAX_CONFLICTS = 4
  const pipeline = input.safetyArtifacts.validatedPipeline
  if (!input.safetyArtifacts.pipelineComplete || !pipeline) {
    throw new Error('Complete validated long-packet pipeline is required.')
  }
  const bounded = (value: string, maximum = 1_200) =>
    value.replace(/\s+/g, ' ').trim().slice(0, maximum)
  const actionRank = (action: string) =>
    action === 'emergency_now' ? 0 : 1
  const oneSignalPerSyndrome = <
    T extends SafetyEvidenceSignalInput & { code: string },
  >(
    signals: T[],
  ) => {
    const selected = new Map<string, T>()
    for (const signal of [...signals].sort(
      (left, right) =>
        actionRank(left.action) - actionRank(right.action) ||
        left.code.localeCompare(right.code),
    )) {
      if (!selected.has(signal.syndrome)) {
        selected.set(signal.syndrome, signal)
      }
    }
    return [...selected.values()]
  }
  const signalLines = (
    source: 'deterministic' | 'model',
    signals: Array<
      SafetyEvidenceSignalInput & { code: string; assertion: string }
    >,
  ) =>
    oneSignalPerSyndrome(signals)
      .map((signal) => {
        const evidence = selectDominantBoundedSafetyEvidence(signal, {
          maximumEvidence: 1,
          maximumQuoteCharacters: MAX_EVIDENCE_QUOTE_CHARACTERS,
          maximumReevaluations: 64,
        })[0]
        return `${source}|${signal.action}|${signal.assertion}|${signal.code}: ${
          evidence ? bounded(evidence.quote, MAX_EVIDENCE_QUOTE_CHARACTERS) : '[validated signal without projected quote]'
        }`
      })
  const deterministicLines = signalLines(
    'deterministic',
    input.safetyArtifacts.gateway.signals,
  )
  const modelLines = signalLines(
    'model',
    input.safetyArtifacts.safetyResult.signals,
  )
  const unknownLines = [
    ...new Set(input.safetyArtifacts.safetyResult.criticalUnknowns),
  ]
    .slice(0, MAX_UNKNOWNS)
    .map((unknown) => bounded(unknown))
  const conflictLines = pipeline.conflicts
    .slice(0, MAX_CONFLICTS)
    .map((conflict) => {
      const quote = conflict.evidence[0]?.quote
      return bounded(
        `${conflict.description}${quote ? ` — ${quote}` : ''}`,
      )
    })
  const prefix = [
    'Deterministic safety evidence:',
    ...(deterministicLines.length > 0 ? deterministicLines : ['(none)']),
    'Model safety evidence:',
    ...(modelLines.length > 0 ? modelLines : ['(none)']),
    'Critical unknowns:',
    ...(unknownLines.length > 0 ? unknownLines : ['(none)']),
    'Source conflicts:',
    ...(conflictLines.length > 0 ? conflictLines : ['(none)']),
    'Canonical source-bound extraction summary:',
  ].join('\n')
  const summaryBudget = Math.max(
    0,
    MAX_ADJUDICATION_CHARACTERS - prefix.length - 1,
  )
  return `${prefix}\n${input.extractedSummary.slice(0, summaryBudget)}`.slice(
    0,
    MAX_ADJUDICATION_CHARACTERS,
  )
}

export function validatePersistedLongPacketArtifacts(input: {
  text: string
  sourcePages: unknown
  sourceSha256: unknown
  packetPlan: unknown
  packetEmergencyResult: unknown
  modelMapResult: unknown
  modelReduceResult: unknown
  safetyPromptVersions: unknown
  extractedSummary: string
}): ValidatedLongPacketSafetyArtifacts & { adjudicationText: string } {
  const safetyArtifacts = validatePersistedLongPacketSafetyArtifacts(input)
  return {
    ...safetyArtifacts,
    adjudicationText: buildLongPacketAdjudicationText({
      extractedSummary: input.extractedSummary,
      safetyArtifacts,
    }),
  }
}

function usableFacts(
  result: LongPacketModelPipelineResult,
  category: LongPacketFactCategory,
): LongPacketClinicalFact[] {
  return result.factsByCategory[category].filter(
    (fact) => fact.assertion !== 'negated',
  )
}

function statements(
  result: LongPacketModelPipelineResult,
  category: LongPacketFactCategory,
): string[] {
  return [...new Set(usableFacts(result, category).map((fact) => fact.statement))]
}

function combinedNarrative(
  result: LongPacketModelPipelineResult,
): { text: string; usedFallback: boolean } {
  const narrative = result.narrative
  const sections = narrative
    ? [
        narrative.narrative,
        narrative.timelineNarrative,
        narrative.medicationNarrative,
        narrative.testNarrative,
        narrative.functionalNarrative,
        narrative.conflictNarrative,
      ]
    : []
  const unique = [...new Set(sections.map((item) => item.trim()).filter(Boolean))]
  if (unique.length > 0) {
    return { text: unique.join('\n\n'), usedFallback: false }
  }

  const factStatements = [...new Set(
    Object.values(result.factsByCategory)
      .flat()
      .filter((fact) => fact.assertion !== 'negated')
      .map((fact) => fact.statement),
  )]
  if (factStatements.length > 0) {
    return { text: factStatements.join(' '), usedFallback: false }
  }
  return {
    text:
      'No source-grounded neurology-relevant facts were extracted from the completely processed packet. Clinician review of the original source is required.',
    usedFallback: true,
  }
}

export function longPacketPipelineToClinicalExtraction(
  result: LongPacketModelPipelineResult,
): LongPacketClinicalExtraction {
  if (
    result.status !== 'completed' ||
    result.coverageStatus !== 'complete' ||
    result.mapperCoverage.status !== 'complete' ||
    result.safetyCoverage.status !== 'complete'
  ) {
    throw new Error(
      'Long-packet model coverage must be complete before clinical extraction completion.',
    )
  }

  const summary = combinedNarrative(result)
  const chiefComplaints = statements(result, 'chief_complaint')
  const failedTherapies = statements(result, 'failed_therapy')
  const redFlags = statements(result, 'red_flag')
  for (const signal of result.safetySignals) {
    const quotes = signal.evidence.map((item) => item.quote).filter(Boolean)
    redFlags.push(
      `${signal.code}${quotes.length > 0 ? ` — ${quotes.join(' / ')}` : ''}`,
    )
  }

  const extractionConfidence: TriageConfidence = summary.usedFallback
    ? 'low'
    : result.conflicts.length > 0 || result.criticalUnknowns.length > 0
      ? 'moderate'
      : 'high'

  return {
    noteTypeDetected: 'unknown',
    extractionConfidence,
    extractedSummary: summary.text,
    keyFindings: {
      chief_complaint: chiefComplaints.join('; '),
      neurological_symptoms: statements(result, 'neurologic_symptom'),
      timeline:
        result.narrative?.timelineNarrative ||
        statements(result, 'timeline_event').join('; '),
      relevant_history: statements(result, 'relevant_history').join('; '),
      medications_and_therapies: statements(result, 'medication'),
      failed_therapies: failedTherapies.map((therapy) => ({
        therapy,
        reason_stopped: '',
      })),
      imaging_results: statements(result, 'test_result'),
      red_flags_noted: [...new Set(redFlags)],
      functional_status:
        result.narrative?.functionalNarrative ||
        statements(result, 'functional_finding').join('; '),
    },
  }
}

export function longPacketPipelineToPersistedClinicalExtraction(input: {
  pipeline: LongPacketModelPipelineResult
  deterministicGateway: PersistableEmergencyGatewayResult
}): LongPacketClinicalExtraction {
  const clinical = longPacketPipelineToClinicalExtraction(input.pipeline)
  const deterministicSafetyLines = [
    ...new Set(
      input.deterministicGateway.signals
        .filter((signal) => signal.assertion !== 'negated')
        .flatMap((signal) =>
          signal.evidence.map((evidence) => evidence.quote),
        )
        .filter((quote) => typeof quote === 'string' && Boolean(quote.trim())),
    ),
  ]
  return {
    ...clinical,
    extractedSummary:
      deterministicSafetyLines.length > 0
        ? `Complete-source safety evidence: ${deterministicSafetyLines.join(' / ')}\n\n${clinical.extractedSummary}`
        : clinical.extractedSummary,
    keyFindings: {
      ...clinical.keyFindings,
      red_flags_noted: [
        ...new Set([
          ...clinical.keyFindings.red_flags_noted,
          ...deterministicSafetyLines,
        ]),
      ],
    },
  }
}

/**
 * Re-derives the only clinical projection that may be persisted for a
 * validated complete long-packet pipeline. Callers cannot substitute a
 * convenient or previously generated summary at a persistence boundary.
 */
export function assertLongPacketPersistedClinicalExtractionMatches(input: {
  pipeline: LongPacketModelPipelineResult
  deterministicGateway: PersistableEmergencyGatewayResult
  actual: {
    noteTypeDetected: string
    extractionConfidence: TriageConfidence
    extractedSummary: string
    keyFindings: ExtractionKeyFindings
  }
}): LongPacketClinicalExtraction {
  const canonical = longPacketPipelineToPersistedClinicalExtraction(input)
  if (
    input.actual.noteTypeDetected !== canonical.noteTypeDetected ||
    input.actual.extractionConfidence !== canonical.extractionConfidence ||
    input.actual.extractedSummary !== canonical.extractedSummary ||
    canonicalLongPacketJSONStringify(input.actual.keyFindings) !==
      canonicalLongPacketJSONStringify(canonical.keyFindings)
  ) {
    throw new Error(
      'Persisted long-packet clinical extraction does not match its validated source-bound pipeline.',
    )
  }
  return canonical
}
