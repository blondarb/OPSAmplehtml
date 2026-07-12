import { invokeBedrockClinicalTool } from '@/lib/bedrock'
import type { GatewayEvidence } from './emergencyGateway'
import {
  longPacketChunkProvenanceDigest,
  type LongPacketChunk,
} from './longPacketPlanner'
import { resolveTriageModelRegistry } from './modelRegistry'
import { CLINICAL_SOURCE_TRUST_BOUNDARY } from './promptSafety'

export const LONG_PACKET_CLINICAL_MAPPER_PROMPT_VERSION =
  'neurology-long-packet-clinical-mapper-v1'

export const LONG_PACKET_FACT_CATEGORIES = [
  'chief_complaint',
  'neurologic_symptom',
  'timeline_event',
  'medication',
  'failed_therapy',
  'test_result',
  'functional_finding',
  'red_flag',
  'critical_unknown',
  'relevant_history',
] as const

export type LongPacketFactCategory =
  (typeof LONG_PACKET_FACT_CATEGORIES)[number]

export type LongPacketFactAssertion =
  | 'present'
  | 'negated'
  | 'uncertain'
  | 'conditional'

export type LongPacketFactTemporality =
  | 'current'
  | 'recent'
  | 'historical'
  | 'unknown'

export interface LongPacketClinicalFact {
  category: LongPacketFactCategory
  key: string
  statement: string
  assertion: LongPacketFactAssertion
  temporality: LongPacketFactTemporality
  eventDateText: string | null
  evidence: GatewayEvidence[]
}

export interface LongPacketEvidenceConflict {
  topic: string
  description: string
  evidence: GatewayEvidence[]
}

export interface LongPacketChunkClinicalMap {
  chunkId: string
  chunkProvenanceSha256: string
  sourceCharacterCount: number
  coverageStatus: 'complete' | 'partial' | 'failed'
  facts: LongPacketClinicalFact[]
  conflicts: LongPacketEvidenceConflict[]
}

export class LongPacketClinicalMapError extends Error {
  readonly name = 'LongPacketClinicalMapError'

  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(`Invalid long-packet clinical map at ${field}: ${message}`)
  }
}

const ASSERTIONS = new Set<LongPacketFactAssertion>([
  'present',
  'negated',
  'uncertain',
  'conditional',
])
const TEMPORALITIES = new Set<LongPacketFactTemporality>([
  'current',
  'recent',
  'historical',
  'unknown',
])
const CATEGORIES = new Set<LongPacketFactCategory>(
  LONG_PACKET_FACT_CATEGORIES,
)
const COVERAGE_STATUSES = new Set(['complete', 'partial', 'failed'] as const)

const CLINICAL_MAP_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    chunk_id: { type: 'string', minLength: 1, maxLength: 1_000 },
    provenance_sha256: {
      type: 'string',
      pattern: '^[a-f0-9]{64}$',
    },
    source_character_count: { type: 'integer', minimum: 1, maximum: 2_000_000 },
    coverage_status: {
      type: 'string',
      enum: ['complete', 'partial', 'failed'],
    },
    facts: {
      type: 'array',
      maxItems: 300,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string', enum: LONG_PACKET_FACT_CATEGORIES },
          key: { type: 'string', minLength: 1, maxLength: 240 },
          statement: { type: 'string', minLength: 1, maxLength: 5_000 },
          assertion: {
            type: 'string',
            enum: ['present', 'negated', 'uncertain', 'conditional'],
          },
          temporality: {
            type: 'string',
            enum: ['current', 'recent', 'historical', 'unknown'],
          },
          event_date_text: {
            anyOf: [
              { type: 'string', maxLength: 240 },
              { type: 'null' },
            ],
          },
          evidence: {
            type: 'array',
            minItems: 1,
            maxItems: 10,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                quote: { type: 'string', minLength: 1, maxLength: 4_000 },
                occurrence_index: { type: 'integer', minimum: 0 },
              },
              required: ['quote', 'occurrence_index'],
            },
          },
        },
        required: [
          'category',
          'key',
          'statement',
          'assertion',
          'temporality',
          'event_date_text',
          'evidence',
        ],
      },
    },
    conflicts: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          topic: { type: 'string', minLength: 1, maxLength: 240 },
          description: { type: 'string', minLength: 1, maxLength: 5_000 },
          evidence: {
            type: 'array',
            minItems: 2,
            maxItems: 20,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                quote: { type: 'string', minLength: 1, maxLength: 4_000 },
                occurrence_index: { type: 'integer', minimum: 0 },
              },
              required: ['quote', 'occurrence_index'],
            },
          },
        },
        required: ['topic', 'description', 'evidence'],
      },
    },
  },
  required: [
    'chunk_id',
    'provenance_sha256',
    'source_character_count',
    'coverage_status',
    'facts',
    'conflicts',
  ],
}

export const LONG_PACKET_CLINICAL_MAPPER_SYSTEM_PROMPT = `You are a bounded, source-grounded neurology referral fact mapper. Process the entire supplied chunk; never sample, skip the end, or silently truncate. Do not diagnose, set urgency, clear safety, or write a referral summary.

${CLINICAL_SOURCE_TRUST_BOUNDARY}

Extract every clinically relevant atomic fact into one of these categories: chief_complaint, neurologic_symptom, timeline_event, medication, failed_therapy, test_result, functional_finding, red_flag, critical_unknown, relevant_history. Preserve medication doses and status, failed therapies and reasons, test names/results/dates, onset and progression, functional changes, and explicit uncertainty. Emit explicit conflicts whenever the source itself contains incompatible claims; do not choose a winner.

For each fact, provide a stable lower-case clinical key, a concise statement, assertion, temporality, optional source date text, and one or more exact source quotes. Quotes must be copied character-for-character. For repeated quotes, occurrence_index is zero-based in source order. Do not calculate offsets. Every fact and conflict must be source-grounded. Do not convert absence of text into a fact.

Echo chunk_id, provenance_sha256, and source_character_count exactly. coverage_status is complete only if the entire chunk was reviewed and every in-scope fact fit in the response. If anything could not be processed or represented, return partial or failed; never claim complete by omitting content. Output only the forced tool result.`

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedSet = new Set(allowed)
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key))
  if (unknown) {
    throw new LongPacketClinicalMapError(
      `${path}.${unknown}`,
      'is not allowed by the clinical schema',
    )
  }
}

function requireBoundedString(
  value: unknown,
  path: string,
  maxLength: number,
): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new LongPacketClinicalMapError(
      path,
      `must be a non-empty string of at most ${maxLength} characters`,
    )
  }
  return value
}

function exactOccurrences(source: string, quote: string): number[] {
  const offsets: number[] = []
  let cursor = 0
  while (cursor <= source.length - quote.length) {
    const found = source.indexOf(quote, cursor)
    if (found < 0) break
    offsets.push(found)
    cursor = found + Math.max(1, quote.length)
  }
  return offsets
}

function mapLocalEvidenceToPages(
  chunk: LongPacketChunk,
  localStart: number,
  localEnd: number,
): GatewayEvidence[] {
  const evidence = chunk.sourceSpans.flatMap((span): GatewayEvidence[] => {
    const intersectionStart = Math.max(localStart, span.chunkStartOffset)
    const intersectionEnd = Math.min(localEnd, span.chunkEndOffset)
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

  if (evidence.length === 0) {
    throw new LongPacketClinicalMapError(
      'evidence',
      'does not intersect an immutable source-page span',
    )
  }
  return evidence
}

function validateEvidenceArray(
  value: unknown,
  chunk: LongPacketChunk,
  path: string,
  limits: { minimum: number; maximum: number },
): GatewayEvidence[] {
  if (
    !Array.isArray(value) ||
    value.length < limits.minimum ||
    value.length > limits.maximum
  ) {
    throw new LongPacketClinicalMapError(
      path,
      `must contain ${limits.minimum} to ${limits.maximum} evidence references`,
    )
  }

  return value.flatMap((rawEvidence, index) => {
    const evidencePath = `${path}[${index}]`
    if (!isRecord(rawEvidence)) {
      throw new LongPacketClinicalMapError(evidencePath, 'must be an object')
    }
    rejectUnknownKeys(
      rawEvidence,
      ['quote', 'occurrence_index'],
      evidencePath,
    )
    const quote = requireBoundedString(
      rawEvidence.quote,
      `${evidencePath}.quote`,
      4_000,
    )
    const occurrenceIndex = rawEvidence.occurrence_index
    if (!Number.isSafeInteger(occurrenceIndex) || (occurrenceIndex as number) < 0) {
      throw new LongPacketClinicalMapError(
        `${evidencePath}.occurrence_index`,
        'must be a non-negative safe integer',
      )
    }
    const localStart = exactOccurrences(chunk.text, quote)[
      occurrenceIndex as number
    ]
    if (localStart === undefined) {
      throw new LongPacketClinicalMapError(
        evidencePath,
        'evidence quote occurrence does not exist in the immutable chunk',
      )
    }
    return mapLocalEvidenceToPages(
      chunk,
      localStart,
      localStart + quote.length,
    )
  })
}

export function validateLongPacketClinicalMapOutput(
  value: unknown,
  chunk: LongPacketChunk,
): LongPacketChunkClinicalMap {
  if (
    chunk.provenanceSha256 !== longPacketChunkProvenanceDigest(chunk)
  ) {
    throw new LongPacketClinicalMapError(
      'chunk.provenanceSha256',
      'does not match the immutable chunk contents',
    )
  }
  if (!isRecord(value)) {
    throw new LongPacketClinicalMapError('$', 'must be an object')
  }
  rejectUnknownKeys(
    value,
    [
      'chunk_id',
      'provenance_sha256',
      'source_character_count',
      'coverage_status',
      'facts',
      'conflicts',
    ],
    '$',
  )
  if (value.chunk_id !== chunk.id) {
    throw new LongPacketClinicalMapError(
      'chunk_id',
      'does not match the planned chunk',
    )
  }
  if (value.provenance_sha256 !== chunk.provenanceSha256) {
    throw new LongPacketClinicalMapError(
      'provenance_sha256',
      'does not match the planned chunk provenance',
    )
  }
  if (value.source_character_count !== chunk.text.length) {
    throw new LongPacketClinicalMapError(
      'source_character_count',
      'does not match the complete chunk length',
    )
  }
  if (
    typeof value.coverage_status !== 'string' ||
    !COVERAGE_STATUSES.has(
      value.coverage_status as 'complete' | 'partial' | 'failed',
    )
  ) {
    throw new LongPacketClinicalMapError(
      'coverage_status',
      'is not an allowed coverage value',
    )
  }
  if (!Array.isArray(value.facts) || value.facts.length > 300) {
    throw new LongPacketClinicalMapError(
      'facts',
      'must contain at most 300 bounded facts',
    )
  }

  const facts = value.facts.map((rawFact, index): LongPacketClinicalFact => {
    const factPath = `facts[${index}]`
    if (!isRecord(rawFact)) {
      throw new LongPacketClinicalMapError(factPath, 'must be an object')
    }
    rejectUnknownKeys(
      rawFact,
      [
        'category',
        'key',
        'statement',
        'assertion',
        'temporality',
        'event_date_text',
        'evidence',
      ],
      factPath,
    )
    if (
      typeof rawFact.category !== 'string' ||
      !CATEGORIES.has(rawFact.category as LongPacketFactCategory)
    ) {
      throw new LongPacketClinicalMapError(
        `${factPath}.category`,
        'is not an allowed fact category',
      )
    }
    if (
      typeof rawFact.assertion !== 'string' ||
      !ASSERTIONS.has(rawFact.assertion as LongPacketFactAssertion)
    ) {
      throw new LongPacketClinicalMapError(
        `${factPath}.assertion`,
        'is not an allowed assertion',
      )
    }
    if (
      typeof rawFact.temporality !== 'string' ||
      !TEMPORALITIES.has(rawFact.temporality as LongPacketFactTemporality)
    ) {
      throw new LongPacketClinicalMapError(
        `${factPath}.temporality`,
        'is not an allowed temporality',
      )
    }
    const eventDateText = rawFact.event_date_text
    if (
      eventDateText !== null &&
      (typeof eventDateText !== 'string' ||
        !eventDateText.trim() ||
        eventDateText.length > 240)
    ) {
      throw new LongPacketClinicalMapError(
        `${factPath}.event_date_text`,
        'must be null or a bounded source date string',
      )
    }
    const key = requireBoundedString(rawFact.key, `${factPath}.key`, 240)
    if (!/^[a-z0-9][a-z0-9 _./:+-]{0,239}$/.test(key)) {
      throw new LongPacketClinicalMapError(
        `${factPath}.key`,
        'must be a stable lower-case clinical key',
      )
    }
    return {
      category: rawFact.category as LongPacketFactCategory,
      key,
      statement: requireBoundedString(
        rawFact.statement,
        `${factPath}.statement`,
        5_000,
      ),
      assertion: rawFact.assertion as LongPacketFactAssertion,
      temporality: rawFact.temporality as LongPacketFactTemporality,
      eventDateText,
      evidence: validateEvidenceArray(
        rawFact.evidence,
        chunk,
        `${factPath}.evidence`,
        { minimum: 1, maximum: 10 },
      ),
    }
  })

  if (!Array.isArray(value.conflicts) || value.conflicts.length > 100) {
    throw new LongPacketClinicalMapError(
      'conflicts',
      'must contain at most 100 bounded conflicts',
    )
  }
  const conflicts = value.conflicts.map(
    (rawConflict, index): LongPacketEvidenceConflict => {
      const conflictPath = `conflicts[${index}]`
      if (!isRecord(rawConflict)) {
        throw new LongPacketClinicalMapError(
          conflictPath,
          'must be an object',
        )
      }
      rejectUnknownKeys(
        rawConflict,
        ['topic', 'description', 'evidence'],
        conflictPath,
      )
      return {
        topic: requireBoundedString(
          rawConflict.topic,
          `${conflictPath}.topic`,
          240,
        ),
        description: requireBoundedString(
          rawConflict.description,
          `${conflictPath}.description`,
          5_000,
        ),
        evidence: validateEvidenceArray(
          rawConflict.evidence,
          chunk,
          `${conflictPath}.evidence`,
          { minimum: 2, maximum: 20 },
        ),
      }
    },
  )

  return {
    chunkId: chunk.id,
    chunkProvenanceSha256: chunk.provenanceSha256,
    sourceCharacterCount: chunk.text.length,
    coverageStatus: value.coverage_status as 'complete' | 'partial' | 'failed',
    facts,
    conflicts,
  }
}

export async function runLongPacketClinicalMapper(
  chunk: LongPacketChunk,
  options: { model?: string; signal?: AbortSignal } = {},
): Promise<LongPacketChunkClinicalMap> {
  const model = options.model ?? resolveTriageModelRegistry().longPacketMapper
  const result = await invokeBedrockClinicalTool<unknown>({
    system: LONG_PACKET_CLINICAL_MAPPER_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          instruction: 'Map the complete immutable chunk.',
          chunk_id: chunk.id,
          provenance_sha256: chunk.provenanceSha256,
          source_character_count: chunk.text.length,
          source_text: chunk.text,
        }),
      },
    ],
    maxTokens: 8_000,
    temperature: 0,
    model,
    signal: options.signal,
    toolName: 'emit_long_packet_clinical_facts',
    toolDescription:
      'Emit the complete source-grounded atomic clinical fact map for one immutable packet chunk.',
    inputSchema: CLINICAL_MAP_SCHEMA,
  })

  return validateLongPacketClinicalMapOutput(result.parsed, chunk)
}
