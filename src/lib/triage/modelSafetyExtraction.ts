import type {
  EmergencySyndrome,
  GatewayEvidence,
} from './emergencyGateway'
import type { DataQuality } from './types'

export type SafetyModelCarePathway =
  | 'emergency_now'
  | 'same_day_clinician_review'
  | 'no_time_critical_signal'
  | 'undetermined'

export interface SafetyModelSignal {
  code: string
  syndrome: EmergencySyndrome
  source: 'safety_model'
  action: 'emergency_now' | 'immediate_clinician_review'
  assertion: 'present' | 'uncertain' | 'conditional'
  temporality: 'current' | 'recent' | 'unknown'
  experiencer: 'patient' | 'unknown'
  evidence: GatewayEvidence[]
}

export interface ValidatedModelSafetyExtraction {
  carePathway: SafetyModelCarePathway
  dataQuality: DataQuality
  criticalUnknowns: string[]
  signals: SafetyModelSignal[]
}

export interface SafetyExtractionSourceContext {
  packetId?: string
  documentId?: string
  pageNumber?: number
  baseOffset?: number
  extractionMethod?: 'native_text' | 'ocr'
  extractionConfidence?: number | null
}

const CARE_PATHWAYS = new Set<SafetyModelCarePathway>([
  'emergency_now',
  'same_day_clinician_review',
  'no_time_critical_signal',
  'undetermined',
])
const DATA_QUALITIES = new Set<DataQuality>([
  'sufficient',
  'partial',
  'insufficient',
  'conflicting',
])
const SYNDROMES = new Set<EmergencySyndrome>([
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
])
const ACTIONS = new Set<SafetyModelSignal['action']>([
  'emergency_now',
  'immediate_clinician_review',
])
const ASSERTIONS = new Set<SafetyModelSignal['assertion']>([
  'present',
  'uncertain',
  'conditional',
])
const TEMPORALITIES = new Set<SafetyModelSignal['temporality']>([
  'current',
  'recent',
  'unknown',
])
const EXPERIENCERS = new Set<SafetyModelSignal['experiencer']>([
  'patient',
  'unknown',
])

export class ModelSafetyExtractionError extends Error {
  constructor(public readonly field: string, message: string) {
    super(`Invalid model safety extraction at ${field}: ${message}`)
    this.name = 'ModelSafetyExtractionError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireEnum<T extends string>(
  record: Record<string, unknown>,
  field: string,
  allowed: ReadonlySet<T>,
  path = field,
): T {
  const value = record[field]
  if (typeof value !== 'string' || !allowed.has(value as T)) {
    throw new ModelSafetyExtractionError(path, 'is not an allowed value')
  }
  return value as T
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

function supportsAutonomicDysreflexiaLabel(
  evidence: GatewayEvidence[],
): boolean {
  const evidenceText = evidence.map((item) => item.quote).join(' ')

  if (/\bautonomic\s+dysreflexia\b/i.test(evidenceText)) return true

  const hasHighSpinalCordLesion =
    /\bhigh\s+(?:spinal\s+)?cord\s+(?:injury|lesion)\b/i.test(
      evidenceText,
    ) ||
    /\b(?:c[1-8]|t[1-6])\b.{0,48}\b(?:spinal\s+cord\s+injury|sci|cord\s+lesion)\b/i.test(
      evidenceText,
    )
  const hasSevereHypertension =
    /\b(?:hypertensive\s+(?:crisis|emergency)|severe\s+hypertension)\b/i.test(
      evidenceText,
    ) ||
    /\b(?:blood\s+pressure|bp)\s*(?:is|of|=|:)?\s*(?:1[89]\d|2\d\d)\s*\/\s*\d{2,3}\b/i.test(
      evidenceText,
    )
  const hasCharacteristicFeatureOrTrigger =
    /\b(?:pounding\s+headache|flushing|sweating\s+above|blocked\s+(?:urinary\s+)?catheter|bladder\s+distension|fecal\s+impaction)\b/i.test(
      evidenceText,
    )

  return (
    hasHighSpinalCordLesion &&
    hasSevereHypertension &&
    hasCharacteristicFeatureOrTrigger
  )
}

function validateCriticalUnknowns(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 50 ||
    value.some(
      (item) =>
        typeof item !== 'string' || !item.trim() || item.length > 2_000,
    )
  ) {
    throw new ModelSafetyExtractionError(
      'critical_unknowns',
      'must be at most 50 bounded non-empty strings',
    )
  }
  return value
}

export function validateModelSafetyExtraction(
  value: unknown,
  sourceText: string,
  context: SafetyExtractionSourceContext = {},
): ValidatedModelSafetyExtraction {
  if (!sourceText || sourceText.length > 2_000_000) {
    throw new ModelSafetyExtractionError(
      'sourceText',
      'must be non-empty and within the validated source limit',
    )
  }
  if (!isRecord(value)) {
    throw new ModelSafetyExtractionError('$', 'must be an object')
  }

  const carePathway = requireEnum(
    value,
    'care_pathway',
    CARE_PATHWAYS,
  )
  const dataQuality = requireEnum(value, 'data_quality', DATA_QUALITIES)
  const criticalUnknowns = validateCriticalUnknowns(value.critical_unknowns)
  if (!Array.isArray(value.signals) || value.signals.length > 50) {
    throw new ModelSafetyExtractionError(
      'signals',
      'must be an array of at most 50 signals',
    )
  }

  const baseOffset = context.baseOffset ?? 0
  if (!Number.isSafeInteger(baseOffset) || baseOffset < 0) {
    throw new ModelSafetyExtractionError(
      'context.baseOffset',
      'must be a non-negative safe integer',
    )
  }

  const signals = value.signals.map((rawSignal, signalIndex) => {
    const signalPath = `signals[${signalIndex}]`
    if (!isRecord(rawSignal)) {
      throw new ModelSafetyExtractionError(signalPath, 'must be an object')
    }
    if (
      typeof rawSignal.code !== 'string' ||
      !/^[a-z][a-z0-9_]{0,79}$/.test(rawSignal.code)
    ) {
      throw new ModelSafetyExtractionError(
        `${signalPath}.code`,
        'must be a bounded snake-case identifier',
      )
    }
    const syndrome = requireEnum(
      rawSignal,
      'syndrome',
      SYNDROMES,
      `${signalPath}.syndrome`,
    )
    const action = requireEnum(
      rawSignal,
      'action',
      ACTIONS,
      `${signalPath}.action`,
    )
    const assertion = requireEnum(
      rawSignal,
      'assertion',
      ASSERTIONS,
      `${signalPath}.assertion`,
    )
    const temporality = requireEnum(
      rawSignal,
      'temporality',
      TEMPORALITIES,
      `${signalPath}.temporality`,
    )
    const experiencer = requireEnum(
      rawSignal,
      'experiencer',
      EXPERIENCERS,
      `${signalPath}.experiencer`,
    )
    if (
      action === 'emergency_now' &&
      (assertion !== 'present' ||
        !['current', 'recent'].includes(temporality) ||
        experiencer !== 'patient')
    ) {
      throw new ModelSafetyExtractionError(
        `${signalPath}.action`,
        'emergency_now requires a present current/recent patient signal',
      )
    }
    if (!Array.isArray(rawSignal.evidence) || rawSignal.evidence.length === 0 || rawSignal.evidence.length > 10) {
      throw new ModelSafetyExtractionError(
        `${signalPath}.evidence`,
        'must contain 1 to 10 exact source references',
      )
    }
    const evidence = rawSignal.evidence.map((rawEvidence, evidenceIndex) => {
      const evidencePath = `${signalPath}.evidence[${evidenceIndex}]`
      if (!isRecord(rawEvidence)) {
        throw new ModelSafetyExtractionError(evidencePath, 'must be an object')
      }
      const quote = rawEvidence.quote
      const occurrenceIndex = rawEvidence.occurrence_index
      if (
        typeof quote !== 'string' ||
        !quote.trim() ||
        quote.length > 2_000
      ) {
        throw new ModelSafetyExtractionError(
          `${evidencePath}.quote`,
          'must be a bounded non-empty exact quote',
        )
      }
      if (
        !Number.isSafeInteger(occurrenceIndex) ||
        (occurrenceIndex as number) < 0
      ) {
        throw new ModelSafetyExtractionError(
          `${evidencePath}.occurrence_index`,
          'must be a non-negative safe integer',
        )
      }
      const occurrences = exactOccurrences(sourceText, quote)
      const localOffset = occurrences[occurrenceIndex as number]
      if (localOffset === undefined) {
        throw new ModelSafetyExtractionError(
          evidencePath,
          'quote occurrence does not exist in the source',
        )
      }
      return {
        packetId: context.packetId ?? null,
        documentId: context.documentId ?? null,
        pageNumber: context.pageNumber ?? null,
        startOffset: baseOffset + localOffset,
        endOffset: baseOffset + localOffset + quote.length,
        quote,
        extractionMethod: context.extractionMethod ?? 'native_text',
        extractionConfidence: context.extractionConfidence ?? null,
      } satisfies GatewayEvidence
    })

    // Autonomic instability is nonspecific (for example NMS or sepsis).
    // Preserve the time-critical action, but do not expose a specific
    // autonomic-dysreflexia label unless the model grounded that label in an
    // explicit diagnosis or the characteristic high-SCI constellation.
    const normalizedSyndrome =
      syndrome === 'autonomic_dysreflexia' &&
      !supportsAutonomicDysreflexiaLabel(evidence)
        ? 'other_time_critical'
        : syndrome

    return {
      code: rawSignal.code,
      syndrome: normalizedSyndrome,
      source: 'safety_model' as const,
      action,
      assertion,
      temporality,
      experiencer,
      evidence,
    }
  })

  const hasEmergency = signals.some(
    (signal) => signal.action === 'emergency_now',
  )
  const hasImmediateReview = signals.some(
    (signal) => signal.action === 'immediate_clinician_review',
  )
  const expectedCarePathway: SafetyModelCarePathway = hasEmergency
    ? 'emergency_now'
    : hasImmediateReview || criticalUnknowns.length > 0
      ? 'same_day_clinician_review'
      : dataQuality === 'sufficient'
        ? 'no_time_critical_signal'
        : 'undetermined'
  if (carePathway !== expectedCarePathway) {
    throw new ModelSafetyExtractionError(
      'care_pathway',
      `must be ${expectedCarePathway} for the validated signals, unknowns, and data quality`,
    )
  }

  return { carePathway, dataQuality, criticalUnknowns, signals }
}
