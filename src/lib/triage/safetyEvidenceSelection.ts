import {
  runEmergencyGateway,
  type GatewayEvidence,
} from './emergencyGateway'

export interface SafetyEvidenceSignalInput {
  syndrome: string
  action: 'emergency_now' | 'immediate_clinician_review'
  evidence: GatewayEvidence[]
}

export interface BoundedSafetyEvidence {
  quote: string
  documentId: string | null
  pageNumber: number | null
  startOffset: number
  endOffset: number
}

const EVIDENCE_ANCHOR =
  /\b(?:sudden|abrupt|acute|aphasia|facial droop|weakness|numbness|vision loss|blindness|thunderclap|worst headache|status epilepticus|seiz|cauda equina|saddle anesthesia|urinary retention|unresponsive|confusion|meningitis|encephalitis|papilledema|shunt|dysphagia|breathing|suicidal|homicidal)\b/i

function boundedEvidence(
  evidence: GatewayEvidence,
  maximumQuoteCharacters: number,
): BoundedSafetyEvidence {
  const matchOffset = evidence.quote.search(EVIDENCE_ANCHOR)
  const excerptOffset =
    evidence.quote.length <= maximumQuoteCharacters
      ? 0
      : Math.max(0, matchOffset >= 0 ? matchOffset - 500 : 0)
  const quote = evidence.quote.slice(
    excerptOffset,
    excerptOffset + maximumQuoteCharacters,
  )
  const startOffset = evidence.startOffset + excerptOffset
  return {
    quote,
    documentId: evidence.documentId,
    pageNumber: evidence.pageNumber,
    startOffset,
    endOffset: startOffset + quote.length,
  }
}

function dominantEvidenceLikelihood(
  action: SafetyEvidenceSignalInput['action'],
  quote: string,
): number {
  const uncertain =
    /\b(?:possible|possibly|may have|might have|suspected|unclear|unknown|cannot determine|could represent|rule out|r\/o)\b/i.test(
      quote,
    )
  const current =
    /\b(?:now|currently|today|this morning|just started|began|started|ongoing|continuous|active|\d+\s*(?:minutes?|hours?)\s+ago)\b/i.test(
      quote,
    )
  return action === 'emergency_now'
    ? (uncertain ? 0 : 4) + (current ? 2 : 0)
    : (uncertain ? 4 : 0) + (current ? 1 : 0)
}

/**
 * Ranks exact evidence by an independent bounded deterministic re-check so a
 * merged emergency signal cannot be projected with only earlier uncertain
 * quotes. Cheap likelihood ranking scans all already-bounded source evidence;
 * expensive gateway re-evaluation is capped.
 */
export function selectDominantBoundedSafetyEvidence(
  signal: SafetyEvidenceSignalInput,
  options: {
    maximumEvidence: number
    maximumQuoteCharacters: number
    maximumReevaluations: number
  },
): BoundedSafetyEvidence[] {
  const candidates = signal.evidence
    .map((evidence, index) => ({
      evidence,
      index,
      likelihood: dominantEvidenceLikelihood(signal.action, evidence.quote),
    }))
    .sort(
      (left, right) =>
        right.likelihood - left.likelihood || left.index - right.index,
    )
    .slice(0, options.maximumReevaluations)
  const supportingIndices = new Set<number>()
  for (const candidate of candidates) {
    const projected = boundedEvidence(
      candidate.evidence,
      options.maximumQuoteCharacters,
    )
    const independentlyClassified = runEmergencyGateway(projected.quote)
    if (
      independentlyClassified.signals.some(
        (classified) =>
          classified.syndrome === signal.syndrome &&
          classified.action === signal.action &&
          (signal.action !== 'emergency_now' ||
            classified.assertion === 'present'),
      )
    ) {
      supportingIndices.add(candidate.index)
    }
  }
  return [
    ...signal.evidence.filter((_, index) => supportingIndices.has(index)),
    ...signal.evidence.filter((_, index) => !supportingIndices.has(index)),
  ]
    .slice(0, options.maximumEvidence)
    .map((evidence) =>
      boundedEvidence(evidence, options.maximumQuoteCharacters),
    )
}
