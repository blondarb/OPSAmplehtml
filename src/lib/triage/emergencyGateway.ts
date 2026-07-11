import type { CarePathway, ReviewRequirement } from './types'

export const EMERGENCY_GATEWAY_VERSION = 'neurology-emergency-gateway-v1'

export interface SourceLocation {
  packetId?: string
  documentId?: string
  pageNumber?: number
}

export type EmergencySyndrome =
  | 'acute_cerebrovascular'
  | 'intracranial_hemorrhage_or_sah'
  | 'status_or_recurrent_seizure'
  | 'acute_spinal_cord_or_cauda_equina'
  | 'acute_cns_infection'
  | 'raised_intracranial_pressure'
  | 'neuromuscular_respiratory_or_bulbar_failure'
  | 'acute_vision_threat'
  | 'altered_mental_status_or_coma'
  | 'traumatic_neurologic_deterioration'
  | 'suicide_or_violence_risk'
  | 'other_time_critical'

export interface GatewayEvidence {
  packetId: string | null
  documentId: string | null
  pageNumber: number | null
  startOffset: number
  endOffset: number
  quote: string
}

export interface GatewaySignal {
  code: string
  syndrome: EmergencySyndrome
  action: 'emergency_now' | 'immediate_clinician_review'
  assertion: 'present' | 'uncertain'
  temporality: 'current' | 'recent' | 'unknown'
  experiencer: 'patient' | 'unknown'
  evidence: GatewayEvidence[]
}

export interface EmergencyGatewayResult {
  carePathway: CarePathway
  reviewRequirement: ReviewRequirement
  schedulingLocked: true
  signals: GatewaySignal[]
  version: typeof EMERGENCY_GATEWAY_VERSION
}

interface TextSpan {
  startOffset: number
  endOffset: number
  text: string
}

interface SyndromeRule {
  syndrome: EmergencySyndrome
  anchor: RegExp
  matches: (text: string) => boolean
}

const ACUTE =
  /\b(?:sudden(?:ly)?|abrupt(?:ly)?|new(?:-onset)?|acute|now|current(?:ly)?|today|this morning|just started|began|started|rapid(?:ly)?|progressive(?:ly)?)\b/i
const UNCERTAIN =
  /\b(?:possible|possibly|may have|might have|concern(?:ed)? for|suspected|rule out|r\/o|unclear|unknown|cannot determine|could represent)\b/i
const NEGATED =
  /\b(?:den(?:y|ies|ied)|negative for|absence of|explicitly no|no evidence of|not experiencing|not currently experiencing)\b/i
const NEGATED_FEATURE =
  /\b(?:no|not|without)\s+(?:new\s+)?(?:sudden\s+)?(?:weakness|numbness|facial droop|aphasia|dysarthria|slurred speech|vision loss|visual loss|urinary retention|bladder symptoms?|saddle (?:anesthesia|numbness|sensory loss)|leg weakness|fever|neck stiffness|confusion|headache|seizures?|suicidal (?:thoughts?|intent)|homicidal (?:thoughts?|intent)|new symptoms?)\b/i
const NEGATED_HEADACHE_ACUITY =
  /\b(?:not|never)\s+(?:a\s+)?(?:sudden|thunderclap|maximal(?:ly)?|the worst|worst)\b/i
const HISTORICAL =
  /\b(?:history of|past history|historical|remote|prior|previous|resolved|at baseline|baseline deficit|stable residual|chronic stable|in 19\d{2}|in 20\d{2}|years? ago)\b/i
const RELATIVE_EXPERIENCER =
  /\b(?:mother|father|sister|brother|daughter|son|child|grandmother|grandfather)\s+(?:had|has|experienced|developed|suffers?|was diagnosed|with)\b/i
const FAMILY_HISTORY_HEADING = /^\s*(?:family history|fhx)\b/i
const REMOTE_HISTORY_HEADING =
  /^\s*(?:remote history|past history|past medical history|prior history|historical)\b/i
const EDUCATION_CONTEXT =
  /\b(?:discharge instructions?|return instructions?|return precautions?|seek emergency care if|patient education|warning signs? reviewed|copied (?:discharge|instructions?))\b/i
const EDUCATION_HEADING =
  /^\s*(?:discharge instructions?|return instructions?|return precautions?|patient education|warning signs?)\b/i
const RULE_OUT = /\b(?:rule out|r\/o|possible|concern(?:ed)? for|suspected)\b/i
const STRONG_CURRENT_ASSERTION =
  /\b(?:now|currently|today|this morning|just started|began|started|\d+\s*(?:minutes?|hours?)\s+ago)\b|\b(?:patient|he|she|they)\b.{0,100}\b(?:has|having|developed|reports?|presented|experiencing|is now)\b/i
const NOT_CURRENT = /\b(?:not current|not currently present|not active|historical only)\b/i
const NONCURRENT_REFERENCE =
  /(?:\b(?:these|those|above|aforementioned|listed|described)\b.{0,100}\b(?:not current|not currently present|not active|historical only)\b)|(?:\b(?:the|these|those) (?:symptoms|findings|features) (?:are|were) (?:not current|not currently present|not active|historical only)\b)/i

const FOCAL_DEFICIT =
  /\b(?:facial (?:droop|asymmetry)|face droop|aphasia|dysarthria|slurred speech|gaze deviation|neglect|hemiparesis|one-sided (?:weakness|numbness)|unilateral (?:weakness|numbness)|right-sided (?:weakness|numbness)|left-sided (?:weakness|numbness)|sudden weakness|acute ataxia|stroke)\b/i
const WORST_HEADACHE = /\b(?:worst headache(?: of (?:her|his|my|their|the) life)?|worst headache of life)\b/i
const SEVERE_HEADACHE = /\bsevere headache\b/i
const MAXIMAL_AT_ONSET =
  /\b(?:thunderclap|maximal(?:ly)? at onset|maximum at onset|peaked immediately|instant(?:aneous)? onset|explosive onset)\b/i
const ANTICOAGULATION =
  /\b(?:anticoagulat(?:ed|ion)|apixaban|eliquis|warfarin|coumadin|rivaroxaban|xarelto|dabigatran|pradaxa|edoxaban|savaysa|heparin)\b/i
const HIGH_RISK_HEADACHE_COMPANION =
  /\b(?:syncope|faint(?:ed|ing)?|pregnan(?:t|cy)|postpartum|loss of consciousness|reduced consciousness|unresponsive|severe hypertension|hypertensive crisis|neck stiffness|meningismus)\b/i
const SEIZURE = /\b(?:seizure|convulsion|status epilepticus)\b/i
const SEIZURE_EMERGENCY =
  /\b(?:continuous|ongoing|active|prolonged|status epilepticus|back-to-back|recurrent)\b|\b(?:without|no) recovery\b|\bnot return(?:ed|ing)? to baseline\b/i
const BLADDER =
  /\b(?:urinary|bladder) (?:retention|incontinence|dysfunction|symptoms?)\b/i
const SADDLE = /\bsaddle (?:anesthesia|anaesthesia|numbness|sensory loss)\b/i
const BILATERAL_LEGS =
  /\b(?:(?:bilateral|both) (?:leg|lower extremit(?:y|ies)) weakness|progressive leg weakness)\b/i
const CAUDA = /\b(?:cauda equina|acute spinal cord compression)\b/i
const CAUDA_ANCHOR =
  /\b(?:cauda equina|acute spinal cord compression|urinary retention|bladder (?:retention|incontinence|dysfunction)|saddle (?:anesthesia|anaesthesia|numbness|sensory loss)|bilateral leg weakness)\b/i
const FEVER = /\b(?:fever|febrile)\b/i
const NEURO_INFECTION =
  /\b(?:severe headache|confusion|altered mental status|neck stiffness|stiff neck|meningismus|encephalitis|meningitis)\b/i
const BULBAR =
  /\b(?:bulbar weakness|dysphagia|difficulty swallowing|weak cough|myasthenic crisis|guillain[- ]barr[eé])\b/i
const RESPIRATORY_WARNING =
  /\b(?:cannot|can't|unable to) (?:handle|manage|clear) (?:his |her |their )?secretions\b|\b(?:respiratory (?:distress|failure|weakness)|shortness of breath|dyspnea|weak cough)\b/i
const VISION_LOSS =
  /\b(?:loss of vision|vision loss|visual loss|blindness|cannot see|can't see)\b/i
const TRAUMA =
  /\b(?:fall|fell|head injury|head trauma|head strike|struck (?:his |her |their )?head|hit (?:his |her |their )?head|trauma|collision|accident)\b/i
const DETERIORATING_MENTAL_STATUS =
  /\b(?:unresponsive|unconscious|coma|comatose|rapidly declining mental status|declining mental status|worsening confusion)\b/i
const ACUTE_MENTAL_STATUS =
  /\b(?:(?:sudden|new|acute) (?:confusion|altered mental status)|not making sense)\b/i
const SUICIDE_OR_VIOLENCE =
  /\b(?:suicidal|homicidal) (?:intent|plan)\b|\b(?:intend|plan|planning|going) to (?:kill|harm) (?:myself|himself|herself|themself|themselves|someone|others?)\b|\b(?:kill|harm) myself\b/i
const RAISED_ICP =
  /\b(?:papilledema|shunt malfunction|rapidly worsening headache)\b/i
const ICP_COMPANION =
  /\b(?:vomiting|confusion|altered mental status|reduced consciousness|shunt malfunction|papilledema)\b/i

function hasSeizureDurationOverFiveMinutes(text: string): boolean {
  const matches = text.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)\b/gi)
  for (const match of matches) {
    if (Number(match[1]) >= 5) return true
  }
  return false
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + Number(pattern.test(text)), 0)
}

const RULES: SyndromeRule[] = [
  {
    syndrome: 'acute_cerebrovascular',
    anchor: FOCAL_DEFICIT,
    matches: (text) => FOCAL_DEFICIT.test(text) && (ACUTE.test(text) || UNCERTAIN.test(text)),
  },
  {
    syndrome: 'intracranial_hemorrhage_or_sah',
    anchor: /\b(?:worst|severe|thunderclap) headache\b/i,
    matches: (text) => {
      const maximalAtOnset =
        MAXIMAL_AT_ONSET.test(text) &&
        (WORST_HEADACHE.test(text) || SEVERE_HEADACHE.test(text))
      const highRiskAcuteHeadache =
        SEVERE_HEADACHE.test(text) &&
        ACUTE.test(text) &&
        (FOCAL_DEFICIT.test(text) ||
          HIGH_RISK_HEADACHE_COMPANION.test(text) ||
          ANTICOAGULATION.test(text))
      return maximalAtOnset || highRiskAcuteHeadache
    },
  },
  {
    syndrome: 'status_or_recurrent_seizure',
    anchor: SEIZURE,
    matches: (text) =>
      SEIZURE.test(text) &&
      (SEIZURE_EMERGENCY.test(text) || hasSeizureDurationOverFiveMinutes(text)),
  },
  {
    syndrome: 'acute_spinal_cord_or_cauda_equina',
    anchor: CAUDA_ANCHOR,
    matches: (text) => {
      const clusterCount = countMatches(text, [BLADDER, SADDLE, BILATERAL_LEGS])
      return (
        (clusterCount >= 2 && (ACUTE.test(text) || UNCERTAIN.test(text))) ||
        (CAUDA.test(text) && (ACUTE.test(text) || UNCERTAIN.test(text) || clusterCount > 0))
      )
    },
  },
  {
    syndrome: 'acute_cns_infection',
    anchor: FEVER,
    matches: (text) =>
      FEVER.test(text) &&
      NEURO_INFECTION.test(text) &&
      (ACUTE.test(text) || UNCERTAIN.test(text)),
  },
  {
    syndrome: 'raised_intracranial_pressure',
    anchor: RAISED_ICP,
    matches: (text) =>
      RAISED_ICP.test(text) && ICP_COMPANION.test(text) && (ACUTE.test(text) || UNCERTAIN.test(text)),
  },
  {
    syndrome: 'neuromuscular_respiratory_or_bulbar_failure',
    anchor: BULBAR,
    matches: (text) =>
      BULBAR.test(text) &&
      RESPIRATORY_WARNING.test(text) &&
      (ACUTE.test(text) || UNCERTAIN.test(text)),
  },
  {
    syndrome: 'acute_vision_threat',
    anchor: VISION_LOSS,
    matches: (text) => VISION_LOSS.test(text) && (ACUTE.test(text) || UNCERTAIN.test(text)),
  },
  {
    syndrome: 'traumatic_neurologic_deterioration',
    anchor: TRAUMA,
    matches: (text) =>
      TRAUMA.test(text) &&
      (DETERIORATING_MENTAL_STATUS.test(text) ||
        (ANTICOAGULATION.test(text) && ACUTE_MENTAL_STATUS.test(text))),
  },
  {
    syndrome: 'suicide_or_violence_risk',
    anchor: SUICIDE_OR_VIOLENCE,
    matches: (text) => SUICIDE_OR_VIOLENCE.test(text),
  },
  {
    syndrome: 'altered_mental_status_or_coma',
    anchor: DETERIORATING_MENTAL_STATUS,
    matches: (text) =>
      !TRAUMA.test(text) &&
      !(FEVER.test(text) && NEURO_INFECTION.test(text)) &&
      (DETERIORATING_MENTAL_STATUS.test(text) || ACUTE_MENTAL_STATUS.test(text)) &&
      (ACUTE.test(text) || UNCERTAIN.test(text)),
  },
]

function sentenceSpans(text: string): TextSpan[] {
  const spans: TextSpan[] = []
  // Semicolons commonly separate assertion scopes in referral prose (for
  // example, "no headache; sudden aphasia now"). Treat them as boundaries so
  // a negation or instruction in one clause cannot erase another clause.
  const sentencePattern = /[^.!?;\n]+(?:[.!?;]+|(?=\n|$))/g

  for (const match of text.matchAll(sentencePattern)) {
    const raw = match[0]
    const rawStart = match.index ?? 0
    const leadingWhitespace = raw.length - raw.trimStart().length
    const trimmed = raw.trim()
    if (!trimmed) continue

    spans.push({
      startOffset: rawStart + leadingWhitespace,
      endOffset: rawStart + leadingWhitespace + trimmed.length,
      text: trimmed,
    })
  }

  return spans
}

function activeContrastClause(text: string): string | null {
  let activeClause: string | null = null
  for (const match of text.matchAll(/\b(?:but|however|yet)\b/gi)) {
    const clause = text.slice((match.index ?? 0) + match[0].length)
    if (ACUTE.test(clause)) activeClause = clause
  }
  return activeClause
}

function hasCurrentFindingAfterHistoricalLanguage(text: string): boolean {
  const historicalIndex = text.search(HISTORICAL)
  if (historicalIndex === -1) return false
  const afterHistorical = text.slice(historicalIndex)
  const currentClause = activeContrastClause(afterHistorical) ?? afterHistorical
  const containsEmergencyFeature = (candidate: string): boolean =>
    FOCAL_DEFICIT.test(candidate) ||
    WORST_HEADACHE.test(candidate) ||
    SEVERE_HEADACHE.test(candidate) ||
    SEIZURE.test(candidate) ||
    BLADDER.test(candidate) ||
    SADDLE.test(candidate) ||
    BILATERAL_LEGS.test(candidate) ||
    NEURO_INFECTION.test(candidate) ||
    BULBAR.test(candidate) ||
    RESPIRATORY_WARNING.test(candidate) ||
    VISION_LOSS.test(candidate) ||
    DETERIORATING_MENTAL_STATUS.test(candidate) ||
    ACUTE_MENTAL_STATUS.test(candidate) ||
    SUICIDE_OR_VIOLENCE.test(candidate)
  const introducesNewSymptom = (candidate: string): boolean =>
    /\b(?:new|sudden|acute|worsening|progressive|developed|began|started)\b|\b(?:now|currently)\s+(?:has|having|with|experiencing)\b/i.test(
      candidate,
    ) && containsEmergencyFeature(candidate)

  const routineEncounter =
    /\b(?:seen|visit|follow-up|follow up|referral|appointment)\b.{0,50}\b(?:now|today)\b|\b(?:now|today)\b.{0,50}\b(?:seen|visit|follow-up|follow up|referral|appointment)\b/i.test(
      currentClause,
    )
  if (routineEncounter) return false

  const stableFinding = currentClause.match(
    /\b(?:stable|unchanged|at baseline|baseline deficit|no change|without change)\b/i,
  )
  if (stableFinding?.index != null) {
    const beforeStableFinding = currentClause.slice(0, stableFinding.index)
    const afterStableFinding = currentClause.slice(stableFinding.index + stableFinding[0].length)
    if (!introducesNewSymptom(beforeStableFinding) && !introducesNewSymptom(afterStableFinding)) {
      return false
    }
  }

  const datedHistory = currentClause.match(/\b(?:in 19\d{2}|in 20\d{2}|years? ago)\b/i)
  if (datedHistory?.index != null) {
    const afterHistoricalDate = currentClause.slice(datedHistory.index + datedHistory[0].length)
    if (!/\b(?:but|however|yet|now|currently|new|sudden|acute|began|started)\b/i.test(afterHistoricalDate)) {
      return false
    }
  }

  const hasCurrentSymptomMarker =
    /\b(?:but|however|yet|now|currently|new|sudden|acute|began|started|just started)\b/i.test(
      currentClause,
    )
  const hasEmergencyFeature = containsEmergencyFeature(currentClause)

  return hasCurrentSymptomMarker && hasEmergencyFeature
}

function hasExplicitCurrentFinding(text: string): boolean {
  if (HISTORICAL.test(text)) return hasCurrentFindingAfterHistoricalLanguage(text)
  return ACUTE.test(text) || STRONG_CURRENT_ASSERTION.test(text)
}

function isSuppressed(
  spans: TextSpan[],
  index: number,
  evaluationText: string,
  nextContextIndex: number,
): boolean {
  const previous = spans[index - 1]?.text ?? ''
  const next = spans[nextContextIndex]?.text ?? ''
  const scopedCurrent = activeContrastClause(evaluationText) ?? evaluationText
  const explicitlyCurrent = hasExplicitCurrentFinding(scopedCurrent)

  if (
    NEGATED.test(scopedCurrent) ||
    NEGATED_FEATURE.test(scopedCurrent) ||
    NEGATED_HEADACHE_ACUITY.test(scopedCurrent)
  ) {
    return true
  }

  // A relative may be the reporter rather than the symptom experiencer.
  // Suppress only when the relative is grammatically the subject of the
  // clinical event ("mother had status"), not "daughter reports the patient...".
  if (RELATIVE_EXPERIENCER.test(scopedCurrent) && !/\bpatient\b/i.test(scopedCurrent)) {
    return true
  }
  if (FAMILY_HISTORY_HEADING.test(scopedCurrent) && !explicitlyCurrent) return true
  if (EDUCATION_CONTEXT.test(scopedCurrent)) return true

  // Headings apply to the next short fragment only when that fragment does not
  // independently assert a current patient event.
  if (FAMILY_HISTORY_HEADING.test(previous) && !explicitlyCurrent) return true
  if (REMOTE_HISTORY_HEADING.test(previous) && !explicitlyCurrent) return true
  if (EDUCATION_HEADING.test(previous) && !STRONG_CURRENT_ASSERTION.test(scopedCurrent)) {
    return true
  }
  // A following sentence suppresses only when it explicitly says the matched
  // symptoms are not current. Ordinary discharge instructions may follow a
  // real emergency and must never erase the active finding.
  if (NOT_CURRENT.test(next) && NONCURRENT_REFERENCE.test(next)) return true

  if (HISTORICAL.test(evaluationText) && !hasCurrentFindingAfterHistoricalLanguage(evaluationText)) {
    return true
  }

  // A speculative diagnosis followed by an explicit symptom denial is not an
  // asserted emergency. Uncertainty without denial remains a same-day hold.
  const boundedFollowUp = `${scopedCurrent} ${next}`
  if (
    RULE_OUT.test(scopedCurrent) &&
    (NEGATED.test(boundedFollowUp) || NEGATED_FEATURE.test(boundedFollowUp))
  ) {
    return true
  }

  return false
}

function classifyAssertion(text: string): GatewaySignal['assertion'] {
  return UNCERTAIN.test(text) ? 'uncertain' : 'present'
}

function classifyTemporality(text: string): GatewaySignal['temporality'] {
  if (/\b(?:unclear|unknown|cannot determine)\b/i.test(text)) return 'unknown'
  if (/\b(?:now|currently|ongoing|continuous|active|cannot|can't|unable|tonight)\b/i.test(text)) {
    return 'current'
  }
  if (
    /\b(?:today|this morning|just|began|started|new|sudden|acute|rapidly|progressive|\d+\s*(?:minutes?|hours?)\s+ago)\b/i.test(
      text,
    )
  ) {
    return 'recent'
  }
  return 'unknown'
}

function makeEvidence(
  text: string,
  span: TextSpan,
  anchor: RegExp,
  source?: SourceLocation,
): GatewayEvidence {
  const maximumQuoteLength = 320
  const localAnchor = Math.max(0, span.text.search(anchor))
  let startOffset = span.startOffset
  let endOffset = span.endOffset

  if (endOffset - startOffset > maximumQuoteLength) {
    const anchorOffset = span.startOffset + localAnchor
    startOffset = Math.max(span.startOffset, anchorOffset - 120)
    endOffset = Math.min(span.endOffset, startOffset + maximumQuoteLength)
    startOffset = Math.max(span.startOffset, endOffset - maximumQuoteLength)

    while (startOffset < anchorOffset && /\S/.test(text[startOffset - 1] ?? '') && /\S/.test(text[startOffset])) {
      startOffset += 1
    }
    while (endOffset > anchorOffset && /\S/.test(text[endOffset - 1]) && /\S/.test(text[endOffset] ?? '')) {
      endOffset -= 1
    }
  }

  return {
    packetId: source?.packetId ?? null,
    documentId: source?.documentId ?? null,
    pageNumber: source?.pageNumber ?? null,
    startOffset,
    endOffset,
    quote: text.slice(startOffset, endOffset),
  }
}

function selectEvaluationSpan(
  sourceText: string,
  spans: TextSpan[],
  index: number,
  rule: SyndromeRule,
): { span: TextSpan; nextContextIndex: number } | null {
  const current = spans[index]
  if (rule.matches(current.text)) {
    return { span: current, nextContextIndex: index + 1 }
  }

  const next = spans[index + 1]
  if (!next || !rule.anchor.test(current.text)) return null

  const combined: TextSpan = {
    startOffset: current.startOffset,
    endOffset: next.endOffset,
    text: sourceText.slice(current.startOffset, next.endOffset),
  }

  return rule.matches(combined.text)
    ? { span: combined, nextContextIndex: index + 2 }
    : null
}

function mergeSignal(existing: GatewaySignal, incoming: GatewaySignal): GatewaySignal {
  const assertion =
    existing.assertion === 'present' || incoming.assertion === 'present' ? 'present' : 'uncertain'
  const evidence = [...existing.evidence, ...incoming.evidence]
    .filter(
      (item, index, items) =>
        items.findIndex(
          (candidate) =>
            candidate.startOffset === item.startOffset &&
            candidate.endOffset === item.endOffset &&
            candidate.packetId === item.packetId &&
            candidate.documentId === item.documentId &&
            candidate.pageNumber === item.pageNumber,
        ) === index,
    )
    .sort((left, right) => left.startOffset - right.startOffset)

  return {
    ...existing,
    assertion,
    action: assertion === 'present' ? 'emergency_now' : 'immediate_clinician_review',
    temporality:
      existing.temporality === 'current' || incoming.temporality === 'current'
        ? 'current'
        : existing.temporality === 'recent' || incoming.temporality === 'recent'
          ? 'recent'
          : 'unknown',
    evidence,
  }
}

export function runEmergencyGateway(
  text: string,
  source?: SourceLocation,
): EmergencyGatewayResult {
  const signalsBySyndrome = new Map<EmergencySyndrome, GatewaySignal>()
  const spans = sentenceSpans(text)

  for (let index = 0; index < spans.length; index += 1) {
    for (const rule of RULES) {
      const evaluation = selectEvaluationSpan(text, spans, index, rule)
      if (!evaluation) continue
      if (isSuppressed(spans, index, evaluation.span.text, evaluation.nextContextIndex)) {
        continue
      }

      const assertion = classifyAssertion(evaluation.span.text)
      const signal: GatewaySignal = {
        code: `NEURO_EMERGENCY_${rule.syndrome.toUpperCase()}`,
        syndrome: rule.syndrome,
        action: assertion === 'present' ? 'emergency_now' : 'immediate_clinician_review',
        assertion,
        temporality: classifyTemporality(evaluation.span.text),
        experiencer: 'patient',
        evidence: [makeEvidence(text, evaluation.span, rule.anchor, source)],
      }
      const existing = signalsBySyndrome.get(rule.syndrome)
      signalsBySyndrome.set(rule.syndrome, existing ? mergeSignal(existing, signal) : signal)
    }
  }

  const signals = [...signalsBySyndrome.values()]
  const hasPresentEmergency = signals.some((signal) => signal.assertion === 'present')
  const hasUncertainEmergency = signals.some((signal) => signal.assertion === 'uncertain')

  if (hasPresentEmergency) {
    return {
      carePathway: 'emergency_now',
      reviewRequirement: 'emergency_action',
      schedulingLocked: true,
      signals,
      version: EMERGENCY_GATEWAY_VERSION,
    }
  }

  if (hasUncertainEmergency) {
    return {
      carePathway: 'same_day_clinician_review',
      reviewRequirement: 'immediate_clinician_review',
      schedulingLocked: true,
      signals,
      version: EMERGENCY_GATEWAY_VERSION,
    }
  }

  return {
    carePathway: 'routine_outpatient',
    reviewRequirement: 'clinician_confirmation',
    schedulingLocked: true,
    signals: [],
    version: EMERGENCY_GATEWAY_VERSION,
  }
}
