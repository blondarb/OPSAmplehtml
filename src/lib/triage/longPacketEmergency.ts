import {
  EMERGENCY_GATEWAY_VERSION,
  runEmergencyGateway,
  type EmergencyGatewayResult,
  type GatewayEvidence,
  type GatewayLexicalHit,
  type GatewaySignal,
} from './emergencyGateway'
import type { CarePathway, ReviewRequirement } from './types'
import type {
  LongPacketChunk,
  LongPacketPlan,
} from './longPacketPlanner'
import { longPacketChunkProvenanceDigest } from './longPacketPlanner'

export const LONG_PACKET_EMERGENCY_VERSION =
  'neurology-long-packet-emergency-map-reduce-v3'

export interface LongPacketChunkEmergencyEvaluation {
  chunkId: string
  gateway: EmergencyGatewayResult
}

export interface LongPacketEmergencyResult {
  status: 'completed' | 'failed'
  failureCode:
    | 'incomplete_chunk_scan'
    | 'chunk_gateway_failed'
    | 'invalid_chunk_provenance'
    | null
  carePathway: CarePathway
  reviewRequirement: ReviewRequirement
  schedulingLocked: true
  signals: GatewaySignal[]
  lexicalHits: GatewayLexicalHit[]
  expectedChunkCount: number
  scannedChunkCount: number
  chunkEvaluations: LongPacketChunkEmergencyEvaluation[]
  plannerVersion: LongPacketPlan['version']
  version: typeof LONG_PACKET_EMERGENCY_VERSION
}

export interface DownstreamSafetyCandidate {
  carePathway: CarePathway
  reviewRequirement: ReviewRequirement
  schedulingLocked: boolean
}

export interface LongPacketEmergencyFloorResult
  extends DownstreamSafetyCandidate {
  packetEmergencySignals: GatewaySignal[]
  packetEmergencyFloorApplied: boolean
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
    chunk.text.slice(evidence.startOffset, evidence.endOffset) !== evidence.quote
  ) {
    throw new Error('Gateway evidence is outside the chunk source window.')
  }

  const mapped = chunk.sourceSpans.flatMap((span): GatewayEvidence[] => {
    const chunkStart = Math.max(evidence.startOffset, span.chunkStartOffset)
    const chunkEnd = Math.min(evidence.endOffset, span.chunkEndOffset)
    if (chunkEnd <= chunkStart) return []

    const pageStartOffset =
      span.pageStartOffset + (chunkStart - span.chunkStartOffset)
    const pageEndOffset =
      span.pageStartOffset + (chunkEnd - span.chunkStartOffset)
    return [
      {
        packetId: span.packetId,
        documentId: span.documentId,
        pageNumber: span.pageNumber,
        startOffset: pageStartOffset,
        endOffset: pageEndOffset,
        quote: chunk.text.slice(chunkStart, chunkEnd),
        extractionMethod: span.extractionMethod,
        extractionConfidence: span.extractionConfidence,
      },
    ]
  })

  if (mapped.length === 0) {
    throw new Error('Gateway evidence does not intersect source page text.')
  }
  return mapped
}

function mapSignalToPages(
  signal: GatewaySignal,
  chunk: LongPacketChunk,
): GatewaySignal {
  return {
    ...signal,
    evidence: signal.evidence.flatMap((evidence) =>
      mapEvidenceToPages(evidence, chunk),
    ),
  }
}

function mapLexicalHitToPages(
  hit: GatewayLexicalHit,
  chunk: LongPacketChunk,
): GatewayLexicalHit {
  return {
    ...hit,
    evidence: hit.evidence.flatMap((evidence) =>
      mapEvidenceToPages(evidence, chunk),
    ),
  }
}

function evaluateChunk(chunk: LongPacketChunk): LongPacketChunkEmergencyEvaluation {
  if (
    chunk.provenanceSha256 !== longPacketChunkProvenanceDigest(chunk)
  ) {
    return {
      chunkId: chunk.id,
      gateway: {
        status: 'failed',
        failureCode: 'invalid_provenance',
        carePathway: 'undetermined',
        reviewRequirement: 'immediate_clinician_review',
        schedulingLocked: true,
        signals: [],
        lexicalHits: [],
        version: EMERGENCY_GATEWAY_VERSION,
      },
    }
  }
  const raw = runEmergencyGateway(chunk.text)
  if (raw.status === 'failed') return { chunkId: chunk.id, gateway: raw }

  try {
    return {
      chunkId: chunk.id,
      gateway: {
        ...raw,
        signals: raw.signals.map((signal) => mapSignalToPages(signal, chunk)),
        lexicalHits: raw.lexicalHits.map((hit) =>
          mapLexicalHitToPages(hit, chunk),
        ),
      },
    }
  } catch {
    return {
      chunkId: chunk.id,
      gateway: {
        status: 'failed',
        failureCode: 'invalid_provenance',
        carePathway: 'undetermined',
        reviewRequirement: 'immediate_clinician_review',
        schedulingLocked: true,
        signals: [],
        lexicalHits: [],
        version: raw.version,
      },
    }
  }
}

function evidenceKey(evidence: GatewayEvidence): string {
  return [
    evidence.packetId,
    evidence.documentId,
    evidence.pageNumber,
    evidence.startOffset,
    evidence.endOffset,
    evidence.extractionMethod,
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

function unionEvidencePreservingPriority(
  evidence: GatewayEvidence[],
): GatewayEvidence[] {
  const unique = new Map<string, GatewayEvidence>()
  for (const item of evidence) {
    const key = evidenceKey(item)
    if (!unique.has(key)) unique.set(key, item)
  }
  return [...unique.values()]
}

const ASSERTION_RANK: Record<GatewaySignal['assertion'], number> = {
  negated: 0,
  conditional: 1,
  uncertain: 2,
  present: 3,
}

const TEMPORALITY_RANK: Record<GatewaySignal['temporality'], number> = {
  historical: 0,
  unknown: 1,
  recent: 2,
  current: 3,
}

function mergeSignals(signals: GatewaySignal[]): GatewaySignal[] {
  const merged = new Map<string, GatewaySignal>()
  for (const signal of signals) {
    const key = `${signal.code}\u0000${signal.syndrome}`
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, {
        ...signal,
        evidence: unionEvidencePreservingPriority(signal.evidence),
      })
      continue
    }

    const dominant =
      ASSERTION_RANK[signal.assertion] > ASSERTION_RANK[existing.assertion]
        ? signal
        : existing
    const weaker = dominant === signal ? existing : signal
    merged.set(key, {
      ...dominant,
      action:
        existing.action === 'emergency_now' || signal.action === 'emergency_now'
          ? 'emergency_now'
          : 'immediate_clinician_review',
      assertion:
        ASSERTION_RANK[signal.assertion] > ASSERTION_RANK[existing.assertion]
          ? signal.assertion
          : existing.assertion,
      temporality:
        TEMPORALITY_RANK[signal.temporality] >
        TEMPORALITY_RANK[existing.temporality]
          ? signal.temporality
          : existing.temporality,
      evidence: unionEvidencePreservingPriority([
        ...dominant.evidence,
        ...weaker.evidence,
      ]),
    })
  }
  return [...merged.values()]
}

function mergeLexicalHits(hits: GatewayLexicalHit[]): GatewayLexicalHit[] {
  const unique = new Map<string, GatewayLexicalHit>()
  for (const hit of hits) {
    const evidence = unionEvidence(hit.evidence)
    const key = [
      hit.code,
      hit.syndrome,
      hit.assertion,
      hit.temporality,
      hit.experiencer,
      hit.matchedRule,
      hit.suppressed,
      evidence.map(evidenceKey).join('|'),
    ].join('\u0000')
    unique.set(key, { ...hit, evidence })
  }
  return [...unique.values()]
}

export function reduceLongPacketEmergency(
  plan: LongPacketPlan,
  chunkEvaluations: LongPacketChunkEmergencyEvaluation[],
): LongPacketEmergencyResult {
  const expectedIds = new Set(plan.chunks.map((chunk) => chunk.id))
  const receivedIds = chunkEvaluations.map((evaluation) => evaluation.chunkId)
  const completeScan =
    receivedIds.length === expectedIds.size &&
    new Set(receivedIds).size === receivedIds.length &&
    receivedIds.every((id) => expectedIds.has(id))
  const signals = mergeSignals(
    chunkEvaluations.flatMap((evaluation) => evaluation.gateway.signals),
  )
  const lexicalHits = mergeLexicalHits(
    chunkEvaluations.flatMap((evaluation) => evaluation.gateway.lexicalHits),
  )
  const hasPresent = signals.some((signal) => signal.assertion === 'present')
  const hasUncertain = signals.some(
    (signal) => signal.assertion === 'uncertain',
  )
  const gatewayFailed = chunkEvaluations.some(
    (evaluation) => evaluation.gateway.status === 'failed',
  )

  let carePathway: CarePathway = 'routine_outpatient'
  let reviewRequirement: ReviewRequirement = 'clinician_confirmation'
  if (hasPresent) {
    carePathway = 'emergency_now'
    reviewRequirement = 'emergency_action'
  } else if (hasUncertain) {
    carePathway = 'same_day_clinician_review'
    reviewRequirement = 'immediate_clinician_review'
  } else if (!completeScan || gatewayFailed) {
    carePathway = 'undetermined'
    reviewRequirement = 'immediate_clinician_review'
  }

  return {
    status: completeScan && !gatewayFailed ? 'completed' : 'failed',
    failureCode: !completeScan
      ? 'incomplete_chunk_scan'
      : gatewayFailed
        ? chunkEvaluations.some(
            (evaluation) =>
              evaluation.gateway.failureCode === 'invalid_provenance',
          )
          ? 'invalid_chunk_provenance'
          : 'chunk_gateway_failed'
        : null,
    carePathway,
    reviewRequirement,
    schedulingLocked: true,
    signals,
    lexicalHits,
    expectedChunkCount: plan.chunks.length,
    scannedChunkCount: chunkEvaluations.length,
    chunkEvaluations,
    plannerVersion: plan.version,
    version: LONG_PACKET_EMERGENCY_VERSION,
  }
}

export function scanLongPacketEmergency(
  plan: LongPacketPlan,
): LongPacketEmergencyResult {
  const chunkEvaluations = plan.chunks.map(evaluateChunk)
  return reduceLongPacketEmergency(plan, chunkEvaluations)
}

const CARE_PATHWAY_SAFETY_RANK: Record<CarePathway, number> = {
  redirect: 0,
  routine_outpatient: 1,
  expedited_outpatient: 2,
  undetermined: 3,
  same_day_clinician_review: 4,
  emergency_now: 5,
}

const REVIEW_REQUIREMENT_SAFETY_RANK: Record<ReviewRequirement, number> = {
  none: 0,
  clinician_confirmation: 1,
  immediate_clinician_review: 2,
  emergency_action: 3,
}

function minimumReviewForCarePathway(
  carePathway: CarePathway,
): ReviewRequirement {
  if (carePathway === 'emergency_now') return 'emergency_action'
  if (
    carePathway === 'same_day_clinician_review' ||
    carePathway === 'undetermined'
  ) {
    return 'immediate_clinician_review'
  }
  return 'clinician_confirmation'
}

/**
 * Applies raw-packet emergency output as an additive-only safety floor.
 * A downstream summary/scorer may escalate, but cannot clear or lower it.
 */
export function enforceLongPacketEmergencyFloor(
  packetResult: LongPacketEmergencyResult,
  downstream: DownstreamSafetyCandidate,
): LongPacketEmergencyFloorResult {
  const packetWins =
    CARE_PATHWAY_SAFETY_RANK[packetResult.carePathway] >=
    CARE_PATHWAY_SAFETY_RANK[downstream.carePathway]
  const carePathway = packetWins
    ? packetResult.carePathway
    : downstream.carePathway
  const additiveReviewRequirement =
    REVIEW_REQUIREMENT_SAFETY_RANK[packetResult.reviewRequirement] >=
    REVIEW_REQUIREMENT_SAFETY_RANK[downstream.reviewRequirement]
      ? packetResult.reviewRequirement
      : downstream.reviewRequirement
  const minimumReview = minimumReviewForCarePathway(carePathway)
  const reviewRequirement =
    REVIEW_REQUIREMENT_SAFETY_RANK[additiveReviewRequirement] >=
    REVIEW_REQUIREMENT_SAFETY_RANK[minimumReview]
      ? additiveReviewRequirement
      : minimumReview

  return {
    carePathway,
    reviewRequirement,
    schedulingLocked:
      packetResult.schedulingLocked || downstream.schedulingLocked,
    packetEmergencySignals: packetResult.signals,
    packetEmergencyFloorApplied:
      carePathway !== downstream.carePathway ||
      reviewRequirement !== downstream.reviewRequirement ||
      (packetResult.schedulingLocked && !downstream.schedulingLocked),
  }
}
