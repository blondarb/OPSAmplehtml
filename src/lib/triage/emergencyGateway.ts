import type { CarePathway, ReviewRequirement } from './types'

export const EMERGENCY_GATEWAY_VERSION = 'neurology-emergency-gateway-v3'

export interface SourceLocation {
  packetId?: string
  documentId?: string
  pageNumber?: number
  extractionMethod?: 'native_text' | 'ocr'
  extractionConfidence?: number | null
}

export type EmergencySyndrome =
  | 'acute_cerebrovascular'
  | 'intracranial_hemorrhage_or_sah'
  | 'status_or_recurrent_seizure'
  | 'acute_spinal_cord_or_cauda_equina'
  | 'autonomic_dysreflexia'
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
  extractionMethod: 'native_text' | 'ocr'
  extractionConfidence: number | null
}

export interface GatewaySignal {
  code: string
  syndrome: EmergencySyndrome
  source: 'deterministic'
  action: 'emergency_now' | 'immediate_clinician_review'
  assertion: 'present' | 'negated' | 'uncertain' | 'conditional'
  temporality: 'current' | 'recent' | 'historical' | 'unknown'
  experiencer: 'patient' | 'family' | 'other' | 'unknown'
  evidence: GatewayEvidence[]
}

export interface GatewayLexicalHit extends GatewaySignal {
  matchedRule: boolean
  suppressed: boolean
}

export interface EmergencyGatewayResult {
  status: 'completed' | 'failed'
  failureCode:
    | 'gateway_execution_failed'
    | 'empty_input'
    | 'unreliable_extraction'
    | 'invalid_provenance'
    | null
  carePathway: CarePathway
  reviewRequirement: ReviewRequirement
  schedulingLocked: true
  signals: GatewaySignal[]
  lexicalHits: GatewayLexicalHit[]
  version: typeof EMERGENCY_GATEWAY_VERSION
}

export interface EmergencyGatewayExecutionLimits {
  maxSentenceSpans?: number
  maxLexicalHits?: number
  maxEvidencePerSyndrome?: number
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
  /\b(?:sudden(?:ly)?|abrupt(?:ly)?|new(?:-onset)?|acute|now|current(?:ly)?|today|this morning|just started|began|started|woke up|rapid(?:ly)?|progressive(?:ly)?)\b/i
const UNRESOLVED_EXCLUSION =
  /\b(?:has|have|had) not been (?:ruled out|excluded)\b|\b(?:cannot|can't|could not) be (?:ruled out|excluded)\b/i
const UNCERTAIN =
  /\b(?:possible|possibly|may have|might have|concern(?:ed)? for|suspected|rule out|r\/o|unclear|unknown|cannot determine|could represent)\b|\b(?:has|have|had) not been (?:ruled out|excluded)\b|\b(?:cannot|can't|could not) be (?:ruled out|excluded)\b/i
const NEGATED =
  /\b(?:den(?:y|ies|ied)|negative for|absence of|explicitly no|no evidence of|not experiencing|not currently experiencing)\b/i
const NEGATED_FEATURE =
  /\b(?:no|not|without)\s+(?:new\s+)?(?:sudden\s+)?(?:acute\s+)?(?:stroke|SAH|subarachnoid h[ae]morrhage|cauda equina(?: syndrome)?|retinal detachment|retinal artery occlusion|optic nerve compression|meningitis|encephalitis|papilledema|optic disc edema|blocked VP shunt|VP shunt malfunction|shunt malfunction|myasthenic crisis|status epilepticus|weakness|numbness|facial droop|aphasia|dysarthria|slurred speech|vision loss|visual loss|blindness|urinary retention|bladder symptoms?|saddle (?:anesthesia|numbness|sensory loss)|leg weakness|fever|neck stiffness|confusion|headache|seizures?|LOC|loss of consciousness|suicidal (?:thoughts?|intent)|homicidal (?:thoughts?|intent)|new symptoms?)\b/i
const POSTPOSED_NEGATION =
  /\b(?:acute stroke|stroke|cauda equina(?: syndrome)?|retinal detachment|papilledema|shunt malfunction|myasthenic crisis|status epilepticus|weakness|numbness|facial droop|aphasia|vision loss|urinary retention|saddle (?:anesthesia|numbness)|fever|neck stiffness|confusion|headache|seizures?|meningitis|encephalitis)\b\s*(?::|,)?\s*(?:(?:is|was|are|were)\s+)?(?:absent|denied|negative|not present|not observed|ruled out)\b/i
const NEGATED_HEADACHE_ACUITY =
  /\b(?:not|never)\s+(?:a\s+)?(?:sudden|thunderclap|maximal(?:ly)?|the worst|worst)\b/i
const HISTORICAL =
  /\b(?:history of|past history|historical|remote|prior|previous|resolved|at baseline|baseline deficit|stable residual|chronic stable|follow-up after|follow up after|seen after|last (?:week|month|year)|in childhood|in 19\d{2}|in 20\d{2}|(?:one|two|three|four|several|\d+) (?:days?|weeks?|months?|years?) ago|years? ago)\b/i
const CHRONIC_FEATURE_CONTEXT =
  /\bchronic (?:ataxia|weakness|numbness|aphasia|dysphagia|headaches?|seizures?|vision loss|urinary retention|confusion)\b/i
const RELATIVE_EXPERIENCER =
  /\b(?:mother|father|sister|brother|daughter|son|grandmother|grandfather|wife|husband|spouse|partner|aunt|uncle|cousin|niece|nephew|(?:patient's|his|her|their) (?:child|cousin|niece|nephew))\s+(?:had|has|experienced|developed|suffers?|was diagnosed|with)\b/i
const OTHER_EXPERIENCER =
  /\b(?:caregiver|referring clinician|clinician|provider|nurse|doctor|roommate|friend|neighbor|coworker|witness|bystander)\s+(?:had|has|experienced|developed|suffers?|was diagnosed|with)\b/i
const REPORTER_EXPERIENCER =
  /\b(?:mother|father|sister|brother|daughter|son|grandmother|grandfather|wife|husband|spouse|partner|aunt|uncle|cousin|niece|nephew|caregiver|referring clinician|clinician|provider|nurse|doctor|roommate|friend|neighbor|coworker|witness|bystander)\s+(?:(?:has|had)\s+)?(?:noticed|reports?|states?|says?|observed)\b/i
const ADMINISTRATIVE_NEW_CONTEXT =
  /\bnew (?:patient|referral|consult(?:ation)?|clinic referral)\b/i
const PROBLEM_LIST_CONTEXT =
  /^\s*(?:problem list|diagnoses|active problems?)\s*:/i
const EXPLICIT_PATIENT_EXPERIENCER =
  /\b(?:the patient|patient|he|she|they|I)\s+(?:has|had|is|was|developed|reports?|presented|experienced|experiencing|cannot|can't|fell|struck|hit)\b/i
const FAMILY_HISTORY_HEADING = /^\s*(?:family history|fhx)\b/i
const REMOTE_HISTORY_HEADING =
  /^\s*(?:remote history|past history|past medical history|prior history|historical)\b/i
const EDUCATION_CONTEXT =
  /\b(?:discharge instructions?|return instructions?|return precautions?|seek emergency care if|call 911 if|go to (?:the )?(?:ED|ER|emergency department) if|patient education|warning signs? (?:reviewed|include)|copied (?:discharge|instructions?))\b/i
const EDUCATION_HEADING =
  /^\s*(?:discharge instructions?|return instructions?|return precautions?|patient education|warning signs?)\b/i
const RULE_OUT = /\b(?:rule out|r\/o|possible|concern(?:ed)? for|suspected)\b/i
const RULED_OUT = /\b(?:ruled out|was excluded|has been excluded|not suspected)\b/i
const HYPOTHETICAL_CONTEXT =
  /\b(?:if|when|should)\b.{0,120}\b(?:notice|notices|develops?|occurs?|happens?|starts?|returns?)\b|\basks?\s+(?:what|when|whether).{0,60}\bif\b/i
const NON_DIAGNOSTIC_DISEASE_CONTEXT =
  /\b(?:vaccin(?:e|ation)|immunization|antibody panel|serology|screening test|panel ordered|test ordered|PCR negative|panel negative|test negative)\b/i
const CORRECTION_DENIAL =
  /^\s*no\s*[.!?]?\s*$|^\s*no\s*,?\s*(?:ruled out|not present)\b/i
const STRONG_CURRENT_ASSERTION =
  /\b(?:now|currently|today|this morning|just started|began|started|\d+\s*(?:minutes?|hours?)\s+ago)\b|\b(?:patient|he|she|they)\b.{0,100}\b(?:has|having|developed|reports?|presented|experiencing|is now)\b/i
const NOT_CURRENT = /\b(?:not current|not currently present|not active|historical only)\b/i
const NONCURRENT_REFERENCE =
  /(?:\b(?:these|those|above|aforementioned|listed|described)\b.{0,100}\b(?:not current|not currently present|not active|historical only)\b)|(?:\b(?:the|these|those) (?:symptoms|findings|features) (?:are|were) (?:not current|not currently present|not active|historical only)\b)/i
const NEGATED_ACUITY_CHANGE =
  /\b(?:no|not|without)\s+(?:(?:new|sudden|acute|recent|current)(?:\s+or\s+|\s+))+(?:change|changes|symptoms?|worsening|decline)\b/i

const FOCAL_DEFICIT =
  /\b(?:facial (?:droop|asymmetry)|face droop|(?:left|right) side of (?:his |her |their )?face (?:started )?drooping|aphasia|dysarthria|slurred speech|garbled speech|speech became garbled|gaze deviation|neglect|hemiparesis|focal (?:weakness|numbness|deficit)|one-sided (?:weakness|numbness)|unilateral (?:weakness|numbness)|right-sided (?:weakness|numbness)|left-sided (?:weakness|numbness)|(?:left|right) (?:arm|leg) (?:weakness|numbness)|(?:cannot|can't) move (?:his |her |their )?(?:left|right) (?:arm|leg)|numbness on (?:the )?(?:left|right) side|sudden weakness|ataxia|diplopia|double vision)\b/i
const STROKE_DIAGNOSIS =
  /\b(?:(?:acute|new|suspected|possible) (?:ischemic |haemorrhagic |hemorrhagic )?stroke|stroke alert|(?:patient|he|she|they) (?:is|was) having (?:a )?stroke)\b/i
const STROKE_ENCOUNTER_CONTEXT =
  /\b(?:stroke (?:clinic|follow-up|follow up|referral)|new (?:patient|referral|consult(?:ation)?)\b.{0,50}\bstroke)\b/i
const TIA = /\b(?:TIA|TIAs|transient ischemic attacks?)\b/i
const CRESCENDO_TIA =
  /\b(?:crescendo|recurrent|multiple|repeated) (?:TIA|TIAs|transient ischemic attacks?)\b|\b(?:TIA|TIAs|transient ischemic attacks?)\b.{0,60}\b(?:today|\d+\s+times|recurrent|repeated)\b/i
const RECENTLY_RESOLVED_CEREBRO =
  /\b(?:sudden|new|acute)\b.{0,160}\b(?:today|yesterday|this morning|\d+\s*(?:minutes?|hours?)\s+ago)\b.{0,100}\b(?:resolved|now resolved)\b|\b(?:sudden|new|acute)\b.{0,160}\b(?:resolved|now resolved)\b.{0,60}\b(?:after|within)\s+\d+\s*(?:minutes?|hours?)\b/i
const RECENT_TIA_RESOLVED =
  /\b(?:TIA|TIAs|transient ischemic attacks?)\b.{0,100}\b(?:today|yesterday|\d+\s*(?:minutes?|hours?)\s+ago)\b.{0,100}\b(?:resolved|now resolved)\b|\b(?:resolved|now resolved)\b.{0,60}\b(?:TIA|TIAs|transient ischemic attacks?)\b.{0,60}\b(?:today|yesterday|\d+\s*(?:minutes?|hours?)\s+ago)\b/i
const RECURRENT_TRANSIENT_EPISODES =
  /\b(?:(?:one|two|three|four|single|multiple|several|\d+) episodes?|recurrent episodes?)\b/i
const CEREBRO_ANCHOR = new RegExp(
  `${FOCAL_DEFICIT.source}|\\b(?:weakness|numbness|stroke|TIA|TIAs|transient ischemic attacks?)\\b`,
  'i',
)
const HEADACHE = /\bheadache\b/i
const SAH_DIAGNOSIS = /\b(?:subarachnoid h[ae]morrhage|SAH)\b/i
const INTRACRANIAL_HEMORRHAGE =
  /\b(?:intracranial h[ae]morrhage|intracerebral h[ae]morrhage|intraparenchymal h[ae]morrhage|ICH)\b/i
const WORST_HEADACHE = /\b(?:worst headache(?: of (?:her|his|my|their|the) life)?|worst headache of life)\b/i
const SEVERE_HEADACHE = /\bsevere headache\b/i
const MAXIMAL_AT_ONSET =
  /\b(?:thunderclap|maximal(?:ly)? at onset|maximum at onset|peaked immediately|instant(?:aneous)? onset|explosive onset)\b/i
const ANTICOAGULATION =
  /\b(?:anticoagulat(?:ed|ion)|blood thinner|apixaban|eliquis|warfarin|coumadin|rivaroxaban|xarelto|dabigatran|pradaxa|edoxaban|savaysa|heparin)\b/i
const HIGH_RISK_HEADACHE_COMPANION =
  /\b(?:syncope|faint(?:ed|ing)?|pregnan(?:t|cy)|postpartum|(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty) weeks? gestation|loss of consciousness|reduced consciousness|unresponsive|severe hypertension|hypertensive crisis|neck stiffness|meningismus)\b/i
const SEVERE_BLOOD_PRESSURE =
  /\b(?:BP|blood pressure)\s*(?:of|is|=|:)?\s*(?:1[89]\d|2\d{2})\s*\/\s*(?:1[12]\d|\d{2,3})\b/i
const SEIZURE = /\b(?:seizures?|seizing|convulsions?|convulsing|status epilepticus)\b/i
const SEIZURE_EMERGENCY =
  /\bstatus epilepticus\b|\b(?:continuous|ongoing|prolonged|back-to-back) (?:generalized )?seizures?\b|\bactive(?:ly)? (?:seizures?|seizing|convulsing)\b|\b(?:is|currently) (?:seizing|convulsing)\b|\b(?:seizing|convulsing) (?:now|continuous(?:ly)?)\b|\b(?:seizures?|seizing|convulsions?|convulsing)\b.{0,50}\b(?:(?:without|no) (?:recovery|regaining consciousness)|not return(?:ed|ing)? to baseline|(?:remains?|still|persistently) postictal)\b/i
const RECURRENT_SEIZURE =
  /\b(?:recurrent|repeated) seizures?\b|\b(?:two|three|four|five|six|seven|eight|nine|ten|\d+) seizures? (?:in|within)\b/i
const STABLE_SEIZURE_CONTEXT =
  /\b(?:well controlled|controlled on|seizure-free|no recent seizures?|at baseline)\b/i
const FIRST_SEIZURE = /\b(?:first|first-ever|new-onset) seizures?\b/i
const FIRST_TIME_SEIZURE =
  /\b(?:seizures?|convulsions?)\b.{0,40}\b(?:for the first time|first-ever)\b/i
const FIRST_SEIZURE_HIGH_RISK =
  /\b(?:pregnan(?:t|cy)|postpartum|persistent (?:\w+-sided )?(?:weakness|numbness|aphasia|confusion|deficit)|head injury|injury|trauma|fell|fall)\b/i
const BLADDER =
  /\b(?:(?:urinary|bladder) (?:retention|incontinence|dysfunction|symptoms?)|inability to urinate|unable to urinate|can't urinate)\b/i
const SADDLE =
  /\b(?:saddle (?:anesthesia|anaesthesia|numbness|sensory loss)|numbness in (?:the )?saddle area)\b/i
const BILATERAL_LEGS =
  /\b(?:(?:bilateral|both) (?:leg|legs|lower extremit(?:y|ies)) (?:weakness|are getting weaker)|both legs are getting weaker|progressive leg weakness)\b/i
const CAUDA = /\b(?:cauda equina|acute spinal cord compression)\b/i
const CAUDA_ANCHOR =
  /\b(?:cauda equina|acute spinal cord compression|urinary retention|bladder (?:retention|incontinence|dysfunction)|inability to urinate|unable to urinate|can't urinate|saddle (?:anesthesia|anaesthesia|numbness|sensory loss)|numbness in (?:the )?saddle area|bilateral leg weakness|both legs are getting weaker|progressive leg weakness|(?:severe|new|acute) (?:low |lower )?back pain)\b/i
const SEVERE_BACK_PAIN = /\b(?:severe|new|acute) (?:low |lower )?back pain\b/i
const SPINAL_COMPRESSION_RISK =
  /\b(?:cancer|malignan(?:cy|t)|metastatic|spinal infection|epidural abscess|discitis|osteomyelitis|IV drug use|intravenous drug use|anticoagulat(?:ed|ion)|apixaban|warfarin|rivaroxaban)\b/i
const FEVER =
  /\b(?:fever|febrile|(?:temp(?:erature)?\s*)?(?:10[1-9])(?:\.\d+)?\s*°?\s*F|(?:temp(?:erature)?\s*)?(?:3[89]|4[0-3])(?:\.\d+)?\s*°?\s*C)\b/i
const CNS_INFECTION_DIAGNOSIS = /\b(?:meningitis|encephalitis)\b/i
const CNS_INFECTION_ANCHOR = new RegExp(
  `${FEVER.source}|\\b(?:meningitis|encephalitis)\\b`,
  'i',
)
const NEURO_INFECTION =
  /\b(?:severe headache|confusion|altered mental status|neck stiffness|stiff neck|meningismus|encephalitis|meningitis)\b/i
const BULBAR =
  /\b(?:bulbar weakness|dysphagia|difficulty swallowing|cannot swallow saliva|can't swallow saliva|weak cough|myasthenic crisis|guillain[- ]barr[eé])\b/i
const NEUROMUSCULAR_RISK =
  /\b(?:myasthenia gravis|myasthenic|guillain[- ]barr[eé]|GBS)\b/i
const RAPID_BULBAR_DECLINE =
  /\b(?:rapid(?:ly)?|progressive(?:ly)?|worsening)\b.{0,50}\b(?:bulbar weakness|dysphagia|difficulty swallowing|weak cough)\b|\b(?:bulbar weakness|dysphagia|difficulty swallowing|weak cough)\b.{0,50}\b(?:rapid(?:ly)?|progressive(?:ly)?|worsening)\b/i
const RESPIRATORY_WARNING =
  /\b(?:cannot|can't|unable to) (?:handle|manage|clear) (?:his |her |their )?secretions\b|\b(?:cannot|can't|unable to) swallow saliva\b|\b(?:respiratory (?:distress|failure|weakness)|shortness of breath|trouble breathing|difficulty breathing|dyspnea|weak cough)\b/i
const VISION_LOSS =
  /\b(?:loss of vision|vision loss|visual loss|blindness|went blind(?: in one eye)?|cannot see|can't see)\b/i
const RETINAL_OR_OPTIC_EMERGENCY =
  /\b(?:central retinal artery occlusion|retinal artery occlusion|CRAO|retinal detachment|ischemic optic neuropathy|optic nerve compression|curtain over (?:the )?vision)\b/i
const TRAUMA =
  /\b(?:fall|fell|head injury|head trauma|head strike|struck (?:his |her |their )?head|hit (?:his |her |their )?head|trauma|collision|accident)\b/i
const HEAD_TRAUMA =
  /\b(?:head injury|head trauma|head strike|struck (?:his |her |their )?head|hit (?:his |her |their )?head)\b/i
const DETERIORATING_MENTAL_STATUS =
  /\b(?:unresponsive|unconscious|coma|comatose|obtunded|stuporous|encephalopathy|will not wake up|won't wake up|cannot be awakened|can't be awakened|hard to arouse|GCS\s*(?:of\s*)?(?:[3-8])\b|rapidly declining mental status|declining mental status|worsening confusion)\b/i
const ACUTE_MENTAL_STATUS =
  /\b(?:(?:sudden|new|acute) (?:confusion|altered mental status|delirium)|not making sense)\b/i
const MENTAL_STATUS_ANCHOR =
  /\b(?:unresponsive|unconscious|coma|comatose|obtunded|stuporous|encephalopathy|will not wake up|won't wake up|cannot be awakened|can't be awakened|hard to arouse|GCS\s*(?:of\s*)?\d+|declining mental status|confused|confusion|delirium|altered mental status|not making sense)\b/i
const SUICIDE_OR_VIOLENCE =
  /\b(?:suicidal|homicidal) (?:intent|plan)\b|\b(?:active|current) (?:SI|HI) with (?:(?:a )?plan(?: and intent)?|intent)\b|\bintend(?:s)? suicide\b|\bplans? to take all (?:of )?(?:his|her|their) pills\b|\b(?:intend(?:s)?|plans?|planning|going|will)\b.{0,35}\b(?:kill|harm|shoot|overdose|jump off|end (?:my|his|her|their) life)\b|\b(?:kill|harm|shoot|end) myself\b|\b(?:cannot|can't|unable to) (?:keep|maintain) (?:(?:myself|himself|herself|themself|themselves) )?(?:safe|safety)\b|\b(?:cannot|can't|unable to) contract for safety\b/i
const RAISED_ICP =
  /\b(?:papilledema|optic disc edema|shunt malfunction|blocked VP shunt|VP shunt (?:blocked|malfunction(?:ing)?)|rapidly worsening headache)\b/i
const PAPILLEDEMA_OR_SHUNT =
  /\b(?:papilledema|optic disc edema|shunt malfunction|blocked VP shunt|VP shunt (?:blocked|malfunction(?:ing)?))\b/i
const ICP_COMPANION =
  /\b(?:vomiting|confusion|altered mental status|reduced consciousness|shunt malfunction|papilledema)\b/i
const AUTONOMIC_DYSREFLEXIA = /\bautonomic dysreflexia\b/i
const HIGH_SPINAL_CORD_INJURY =
  /\b(?:(?:high|cervical|upper thoracic|at or above T6) spinal cord injury|spinal cord injury at T[1-6]|T[1-6] (?:spinal cord )?injury|cervical SCI|high SCI|quadriplegia|tetraplegia)\b/i
const AUTONOMIC_DYSREFLEXIA_FEATURE =
  /\b(?:pounding headache|flushing|sweating above (?:the )?(?:injury|lesion)|sweating|bradycardia|goosebumps|piloerection|blocked (?:urinary )?catheter|kinked (?:urinary )?catheter|bladder disten(?:sion|ded)|bowel impaction|fecal impaction)\b/i

function hasAutonomicDysreflexiaConstellation(text: string): boolean {
  return (
    HIGH_SPINAL_CORD_INJURY.test(text) &&
    hasUnnegatedFeature(text, SEVERE_BLOOD_PRESSURE) &&
    hasUnnegatedFeature(text, AUTONOMIC_DYSREFLEXIA_FEATURE) &&
    (ACUTE.test(text) || STRONG_CURRENT_ASSERTION.test(text))
  )
}

function hasSeizureDurationOverFiveMinutes(text: string): boolean {
  const numberWords: Record<string, number> = {
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    fifteen: 15,
    twenty: 20,
  }
  const duration =
    '\\d+(?:\\.\\d+)?|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty'
  const patterns = [
    new RegExp(
      `\\b(?:seizures?|seizing|convulsions?|convulsing|status epilepticus)\\b[^.!?;\\n]{0,80}?\\b(?:for|lasted|lasting|duration(?:\\s+(?:of|was))?)\\s*(?:approximately|about|around|roughly)?\\s*(?<start>${duration})(?:\\s*-\\s*(?<end>${duration}))?\\s*(?:minutes?|mins?)\\b`,
      'gi',
    ),
    new RegExp(
      `\\b(?<start>${duration})(?:\\s*-\\s*(?<end>${duration}))?[- ]minute\\s+(?:seizures?|seizing|convulsions?|convulsing)\\b`,
      'gi',
    ),
  ]

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const rawStart = match.groups?.start?.toLowerCase()
      const rawEnd = match.groups?.end?.toLowerCase()
      if (!rawStart) continue
      const startValue = numberWords[rawStart] ?? Number(rawStart)
      const endValue = rawEnd ? numberWords[rawEnd] ?? Number(rawEnd) : startValue
      if (Math.max(startValue, endValue) >= 5) return true
    }
  }
  return false
}

function hasUnnegatedFeature(text: string, pattern: RegExp): boolean {
  const matcher = new RegExp(pattern.source, `${pattern.flags.replace(/g/g, '')}g`)

  for (const match of text.matchAll(matcher)) {
    const matchIndex = match.index ?? 0
    const preceding = text.slice(Math.max(0, matchIndex - 60), matchIndex)
    const localClause = preceding.slice(
      Math.max(
        preceding.lastIndexOf('.'),
        preceding.lastIndexOf(';'),
        preceding.lastIndexOf(' but '),
        preceding.lastIndexOf(' however '),
      ) + 1,
    )
    const lastNegator = [...localClause.matchAll(
      /\b(?:no|not|without|den(?:y|ies|ied)|negative for|ruled out|excluded)\b/gi,
    )].at(-1)
    const afterNegator =
      lastNegator?.index == null
        ? ''
        : localClause.slice(lastNegator.index + lastNegator[0].length)
    const following = text.slice(matchIndex + match[0].length, matchIndex + match[0].length + 60)
    const explicitPositiveRestart =
      /,\s*(?:(?:the )?patient|he|she|they)\s+(?:has|developed|reports?|presented|is|was|cannot|can't)\b/i.test(
        afterNegator,
      ) ||
      /\b(?:now|currently)\s+(?:has|with|experiencing)\b/i.test(afterNegator) ||
      (/,\s*(?:when\s+)?(?:new|sudden|acute)\b/i.test(afterNegator) &&
        /\b(?:began|started|developed|today|tonight|now|currently|this morning)\b/i.test(
          following,
        ))
    const unresolvedExclusion =
      lastNegator != null &&
      /^(?:ruled out|excluded)$/i.test(lastNegator[0]) &&
      UNRESOLVED_EXCLUSION.test(localClause)
    const locallyNegated =
      lastNegator != null &&
      !unresolvedExclusion &&
      !explicitPositiveRestart
    const postposedNegation =
      /^\s*(?::|,)?\s*(?:(?:is|was|are|were)\s+)?(?:absent|denied|negative|not present|not observed|ruled out)\b/i.test(
        following,
      )
    if (!locallyNegated && !postposedNegation) return true
  }

  return false
}

function hasRuleScopedNegation(text: string, rule: SyndromeRule): boolean {
  if (UNRESOLVED_EXCLUSION.test(text)) return false
  const containsNegatingLanguage =
    NEGATED.test(text) ||
    NEGATED_FEATURE.test(text) ||
    NEGATED_HEADACHE_ACUITY.test(text) ||
    RULED_OUT.test(text) ||
    POSTPOSED_NEGATION.test(text)

  return containsNegatingLanguage && !hasUnnegatedFeature(text, rule.anchor)
}

function isRecentResolvedCerebro(text: string): boolean {
  if (!RECENTLY_RESOLVED_CEREBRO.test(text)) return false
  const hasDatedRemoteEvent = /\b(?:in 19\d{2}|in 20\d{2}|years? ago)\b/i.test(text)
  if (!hasDatedRemoteEvent) return true
  return /\b(?:but|however|yet)\b.{0,200}\b(?:now|currently|today|this morning|\d+\s*(?:minutes?|hours?)\s+ago)\b/i.test(
    text,
  )
}

function isRecurrentTransientFocalEvent(text: string): boolean {
  return (
    RECURRENT_TRANSIENT_EPISODES.test(text) &&
    FOCAL_DEFICIT.test(text) &&
    /\b(?:today|this morning|\d+\s*(?:minutes?|hours?)\s+ago)\b/i.test(text) &&
    /\b(?:resolved|lasting|lasted)\b/i.test(text)
  )
}

function isRecentResolvedNonCerebroEmergency(text: string): boolean {
  const recentlyResolved =
    /\b(?:now resolved|resolved)\b/i.test(text) &&
    /\b(?:now|today|this morning|yesterday|\d+\s*(?:minutes?|hours?)\s+ago)\b/i.test(
      text,
    )
  if (!recentlyResolved) return false

  const timeCriticalSeizure =
    SEIZURE.test(text) &&
    (SEIZURE_EMERGENCY.test(text) || hasSeizureDurationOverFiveMinutes(text))
  const timeCriticalHeadache =
    HEADACHE.test(text) &&
    (MAXIMAL_AT_ONSET.test(text) || WORST_HEADACHE.test(text))

  return timeCriticalSeizure || timeCriticalHeadache
}

const RULES: SyndromeRule[] = [
  {
    syndrome: 'autonomic_dysreflexia',
    anchor: new RegExp(
      `${AUTONOMIC_DYSREFLEXIA.source}|${HIGH_SPINAL_CORD_INJURY.source}|${AUTONOMIC_DYSREFLEXIA_FEATURE.source}`,
      'i',
    ),
    matches: (text) =>
      hasAutonomicDysreflexiaConstellation(text) ||
      (AUTONOMIC_DYSREFLEXIA.test(text) &&
        (ACUTE.test(text) || UNCERTAIN.test(text) || STRONG_CURRENT_ASSERTION.test(text))),
  },
  {
    syndrome: 'acute_cerebrovascular',
    anchor: CEREBRO_ANCHOR,
    matches: (text) =>
      (FOCAL_DEFICIT.test(text) &&
        (ACUTE.test(text) ||
          UNCERTAIN.test(text) ||
          isRecentResolvedCerebro(text) ||
          isRecurrentTransientFocalEvent(text))) ||
      (STROKE_DIAGNOSIS.test(text) && !STROKE_ENCOUNTER_CONTEXT.test(text)) ||
      (/\bstroke\b/i.test(text) && UNRESOLVED_EXCLUSION.test(text)) ||
      (TIA.test(text) &&
        (ACUTE.test(text) ||
          UNCERTAIN.test(text) ||
          CRESCENDO_TIA.test(text) ||
          RECENT_TIA_RESOLVED.test(text))),
  },
  {
    syndrome: 'intracranial_hemorrhage_or_sah',
    anchor: /\b(?:headache|thunderclap|subarachnoid h[ae]morrhage|SAH|intracranial h[ae]morrhage|intracerebral h[ae]morrhage|intraparenchymal h[ae]morrhage|ICH)\b/i,
    matches: (text) => {
      const maximalAtOnset = MAXIMAL_AT_ONSET.test(text) && HEADACHE.test(text)
      const highRiskAcuteHeadache =
        HEADACHE.test(text) &&
        ACUTE.test(text) &&
        (hasUnnegatedFeature(text, FOCAL_DEFICIT) ||
          hasUnnegatedFeature(text, HIGH_RISK_HEADACHE_COMPANION) ||
          hasUnnegatedFeature(text, ANTICOAGULATION) ||
          hasUnnegatedFeature(text, SEVERE_BLOOD_PRESSURE))
      const explicitSahConcern =
        SAH_DIAGNOSIS.test(text) && (ACUTE.test(text) || UNCERTAIN.test(text))
      const intracranialHemorrhage =
        INTRACRANIAL_HEMORRHAGE.test(text) &&
        (ACUTE.test(text) ||
          STRONG_CURRENT_ASSERTION.test(text) ||
          /\b(?:CT|MRI|imaging) (?:shows?|demonstrates?|reveals?)\b/i.test(text))
      return (
        WORST_HEADACHE.test(text) ||
        maximalAtOnset ||
        highRiskAcuteHeadache ||
        explicitSahConcern ||
        intracranialHemorrhage
      )
    },
  },
  {
    syndrome: 'status_or_recurrent_seizure',
    anchor: SEIZURE,
    matches: (text) =>
      SEIZURE.test(text) &&
      (SEIZURE_EMERGENCY.test(text) ||
        hasSeizureDurationOverFiveMinutes(text) ||
        (RECURRENT_SEIZURE.test(text) &&
          !STABLE_SEIZURE_CONTEXT.test(text) &&
          (ACUTE.test(text) || UNCERTAIN.test(text))) ||
        ((FIRST_SEIZURE.test(text) || FIRST_TIME_SEIZURE.test(text)) &&
          hasUnnegatedFeature(text, FIRST_SEIZURE_HIGH_RISK))),
  },
  {
    syndrome: 'acute_spinal_cord_or_cauda_equina',
    anchor: CAUDA_ANCHOR,
    matches: (text) => {
      const clusterCount = [BLADDER, SADDLE, BILATERAL_LEGS].filter((pattern) =>
        hasUnnegatedFeature(text, pattern),
      ).length
      const highRiskBackPain =
        SEVERE_BACK_PAIN.test(text) &&
        hasUnnegatedFeature(text, SPINAL_COMPRESSION_RISK) &&
        (ACUTE.test(text) || UNCERTAIN.test(text))
      return (
        CAUDA.test(text) ||
        ((hasUnnegatedFeature(text, BLADDER) ||
          hasUnnegatedFeature(text, SADDLE) ||
          hasUnnegatedFeature(text, BILATERAL_LEGS)) &&
          (ACUTE.test(text) || UNCERTAIN.test(text))) ||
        (clusterCount >= 2 && (ACUTE.test(text) || UNCERTAIN.test(text))) ||
        highRiskBackPain ||
        (CAUDA.test(text) && (ACUTE.test(text) || UNCERTAIN.test(text) || clusterCount > 0))
      )
    },
  },
  {
    syndrome: 'acute_cns_infection',
    anchor: CNS_INFECTION_ANCHOR,
    matches: (text) =>
      CNS_INFECTION_DIAGNOSIS.test(text) ||
      (FEVER.test(text) &&
        hasUnnegatedFeature(text, NEURO_INFECTION) &&
        (ACUTE.test(text) || UNCERTAIN.test(text))),
  },
  {
    syndrome: 'raised_intracranial_pressure',
    anchor: RAISED_ICP,
    matches: (text) =>
      PAPILLEDEMA_OR_SHUNT.test(text) ||
      (RAISED_ICP.test(text) &&
        ICP_COMPANION.test(text) &&
        (ACUTE.test(text) || UNCERTAIN.test(text))),
  },
  {
    syndrome: 'neuromuscular_respiratory_or_bulbar_failure',
    anchor:
      /\b(?:bulbar weakness|dysphagia|difficulty swallowing|cannot swallow saliva|can't swallow saliva|weak cough|myasthenic crisis|myasthenia gravis|myasthenic|guillain[- ]barr[eé]|GBS|respiratory distress|respiratory failure|respiratory weakness|shortness of breath|trouble breathing|difficulty breathing|dyspnea|secretions)\b/i,
    matches: (text) =>
      /\bmyasthenic crisis\b/i.test(text) ||
      (RAPID_BULBAR_DECLINE.test(text) && (ACUTE.test(text) || UNCERTAIN.test(text))) ||
      (hasUnnegatedFeature(text, RESPIRATORY_WARNING) &&
        (ACUTE.test(text) || UNCERTAIN.test(text))) ||
      ((BULBAR.test(text) || NEUROMUSCULAR_RISK.test(text)) &&
        hasUnnegatedFeature(text, RESPIRATORY_WARNING)),
  },
  {
    syndrome: 'acute_vision_threat',
    anchor:
      /\b(?:loss of vision|vision loss|visual loss|blindness|went blind(?: in one eye)?|cannot see|can't see|central retinal artery occlusion|retinal artery occlusion|CRAO|retinal detachment|ischemic optic neuropathy|optic nerve compression|curtain over (?:the )?vision)\b/i,
    matches: (text) =>
      (VISION_LOSS.test(text) &&
        (ACUTE.test(text) ||
          UNCERTAIN.test(text) ||
          classifyTemporality(text) === 'current')) ||
      RETINAL_OR_OPTIC_EMERGENCY.test(text),
  },
  {
    syndrome: 'traumatic_neurologic_deterioration',
    anchor: TRAUMA,
    matches: (text) =>
      (TRAUMA.test(text) &&
        (DETERIORATING_MENTAL_STATUS.test(text) ||
          ACUTE_MENTAL_STATUS.test(text) ||
          hasUnnegatedFeature(
            text,
            /\b(?:loss of consciousness|lost consciousness|unconscious|LOC)\b/i,
          ) ||
          (hasUnnegatedFeature(text, HEAD_TRAUMA) &&
            hasUnnegatedFeature(text, SEIZURE) &&
            ACUTE.test(text)) ||
          (FOCAL_DEFICIT.test(text) && (ACUTE.test(text) || UNCERTAIN.test(text))))) ||
      (hasUnnegatedFeature(text, HEAD_TRAUMA) &&
        hasUnnegatedFeature(text, ANTICOAGULATION)),
  },
  {
    syndrome: 'suicide_or_violence_risk',
    anchor: SUICIDE_OR_VIOLENCE,
    matches: (text) => SUICIDE_OR_VIOLENCE.test(text),
  },
  {
    syndrome: 'altered_mental_status_or_coma',
    anchor: MENTAL_STATUS_ANCHOR,
    matches: (text) =>
      !TRAUMA.test(text) &&
      !(FEVER.test(text) && NEURO_INFECTION.test(text)) &&
      hasUnnegatedFeature(text, MENTAL_STATUS_ANCHOR) &&
      (DETERIORATING_MENTAL_STATUS.test(text) ||
        ACUTE.test(text) ||
        UNCERTAIN.test(text)),
  },
]

function sentenceSpans(
  text: string,
  maximumSpans = Number.POSITIVE_INFINITY,
): TextSpan[] | null {
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
    if (spans.length >= maximumSpans) return null

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

function relevantRuleContext(text: string, rule: SyndromeRule): string {
  const candidates = text
    .split(
      /[.!?]+|\b(?:but|however|yet)\b|\band\s+(?=(?:(?:the )?patient\s+)?(?:reports?|states?|has|developed|is|experiencing)\b)/i,
    )
    .map((candidate) => candidate.trim())
    .filter(Boolean)

  const completed = candidates.filter(
    (candidate) => rule.anchor.test(candidate) && rule.matches(candidate),
  )
  if (completed.length > 0) return completed[completed.length - 1]

  const anchored = candidates.filter((candidate) => rule.anchor.test(candidate))
  return anchored.length > 0 ? anchored[anchored.length - 1] : text
}

function classifyExperiencer(text: string): GatewaySignal['experiencer'] {
  if (RELATIVE_EXPERIENCER.test(text) || FAMILY_HISTORY_HEADING.test(text)) {
    return 'family'
  }
  if (OTHER_EXPERIENCER.test(text)) return 'other'
  if (EDUCATION_CONTEXT.test(text) || EDUCATION_HEADING.test(text)) return 'other'
  if (EXPLICIT_PATIENT_EXPERIENCER.test(text) || /\b(?:my|myself)\b/i.test(text)) {
    return 'patient'
  }
  return 'unknown'
}

function canCombineAdjacent(left: string, right: string): boolean {
  const leftExperiencer = classifyExperiencer(left)
  const rightExperiencer = classifyExperiencer(right)
  const crossesFamilyContext =
    (leftExperiencer === 'family' && rightExperiencer !== 'family') ||
    (rightExperiencer === 'family' && leftExperiencer !== 'family')
  const crossesInstructionContext =
    (leftExperiencer === 'other' && rightExperiencer !== 'other') ||
    (rightExperiencer === 'other' && leftExperiencer !== 'other')
  return !crossesFamilyContext && !crossesInstructionContext
}

function hasCurrentFindingAfterHistoricalLanguage(text: string): boolean {
  const historicalIndex = text.search(HISTORICAL)
  if (historicalIndex === -1) return false
  const afterHistorical = text.slice(historicalIndex)
  const currentClause = activeContrastClause(afterHistorical) ?? afterHistorical
  const containsEmergencyFeature = (candidate: string): boolean =>
    CEREBRO_ANCHOR.test(candidate) ||
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
    || RAISED_ICP.test(candidate)
    || RETINAL_OR_OPTIC_EMERGENCY.test(candidate)
    || HEAD_TRAUMA.test(candidate)
    || SEVERE_BACK_PAIN.test(candidate)
    || ANTICOAGULATION.test(candidate)

  if (
    /\b(?:still present|ongoing|persists?|has persisted|remains? present)\b/i.test(
      text,
    ) &&
    containsEmergencyFeature(text)
  ) {
    return true
  }
  const withoutAdministrativeOrHistoricalAcuity = (candidate: string): string =>
    candidate
      .replace(new RegExp(NEGATED_FEATURE.source, 'gi'), '')
      .replace(new RegExp(NEGATED_ACUITY_CHANGE.source, 'gi'), '')
      .replace(/\bnew (?:referral|patient|visit|consult(?:ation)?)\b/gi, '')
      .replace(
        /\b(?:history of|remote|prior|previous|follow-up after|follow up after|seen after)\s+(?:an\s+)?acute\b/gi,
        'history',
      )

  const introducesNewSymptom = (candidate: string): boolean => {
    const clinicalCandidate = withoutAdministrativeOrHistoricalAcuity(candidate)
    return (
      /\b(?:new|sudden|acute|worsening|progressive|developed|began|started)\b|\b(?:now|currently)\s+(?:has|having|with|experiencing)\b/i.test(
        clinicalCandidate,
      ) && containsEmergencyFeature(clinicalCandidate)
    )
  }

  const explicitPatientAssertion = currentClause.match(
    /\b(?:the patient|patient|he|she|they)\s+(?:has|is|was|cannot|can't|will not|won't|developed|reports?|presented|experienced|experiencing)\b/i,
  )
  if (explicitPatientAssertion?.index != null) {
    const assertedFinding = currentClause.slice(explicitPatientAssertion.index)
    if (containsEmergencyFeature(assertedFinding)) return true
  }

  if (
    /\b(?:still present|ongoing|persists?|has persisted|remains? present)\b/i.test(
      currentClause,
    ) &&
    containsEmergencyFeature(currentClause)
  ) {
    return true
  }

  const routineEncounter =
    /\b(?:seen|visit|follow-up|follow up|referral|appointment)\b.{0,50}\b(?:now|today)\b|\b(?:now|today)\b.{0,50}\b(?:seen|visit|follow-up|follow up|referral|appointment)\b/i.test(
      currentClause,
    )
  if (routineEncounter && !introducesNewSymptom(currentClause)) return false

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
    const afterHistoricalDate = currentClause
      .slice(datedHistory.index + datedHistory[0].length)
      .replace(
        /\b(?:reviewed|seen|visit|follow-up|follow up|appointment)\b.{0,30}\b(?:today|now|currently)\b/gi,
        '',
      )
    if (
      !/\b(?:but|however|yet|now|currently|today|this morning|\d+\s*(?:minutes?|hours?)\s+ago)\b/i.test(
        afterHistoricalDate,
      )
    ) {
      return false
    }
  }

  const hasCurrentSymptomMarker =
    /\b(?:but|however|yet|now|currently|today|tonight|new|sudden|acute|began|started|just started|still present|ongoing|persists?)\b/i.test(
      withoutAdministrativeOrHistoricalAcuity(currentClause),
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
  rule: SyndromeRule,
): boolean {
  const previous = spans[index - 1]?.text ?? ''
  const next = spans[nextContextIndex]?.text ?? ''
  const scopedCurrent = relevantRuleContext(evaluationText, rule)
  const explicitlyCurrent = hasExplicitCurrentFinding(scopedCurrent)

  if (PROBLEM_LIST_CONTEXT.test(scopedCurrent) && !explicitlyCurrent) return true

  if (hasRuleScopedNegation(scopedCurrent, rule)) {
    return true
  }

  // A relative may be the reporter rather than the symptom experiencer.
  // Suppress only when the relative is grammatically the subject of the
  // clinical event ("mother had status"), not "daughter reports the patient...".
  if (
    RELATIVE_EXPERIENCER.test(scopedCurrent) &&
    !REPORTER_EXPERIENCER.test(scopedCurrent)
  ) {
    return true
  }
  if (
    OTHER_EXPERIENCER.test(scopedCurrent) &&
    !REPORTER_EXPERIENCER.test(scopedCurrent)
  ) {
    return true
  }
  if (
    NON_DIAGNOSTIC_DISEASE_CONTEXT.test(scopedCurrent) &&
    !EXPLICIT_PATIENT_EXPERIENCER.test(scopedCurrent)
  ) {
    return true
  }
  if (ADMINISTRATIVE_NEW_CONTEXT.test(scopedCurrent)) {
    const withoutAdministrativeNew = scopedCurrent.replace(
      ADMINISTRATIVE_NEW_CONTEXT,
      '',
    )
    if (
      !/\b(?:sudden(?:ly)?|abrupt(?:ly)?|today|this morning|now|currently|worsening|progressive|began|started)\b/i.test(
        withoutAdministrativeNew,
      )
    ) {
      return true
    }
  }
  if (
    CHRONIC_FEATURE_CONTEXT.test(scopedCurrent) &&
    !/\b(?:sudden(?:ly)?|abrupt(?:ly)?|new symptom|worsening|progressive|began|started|now has|currently has)\b/i.test(
      scopedCurrent,
    )
  ) {
    return true
  }
  if (HYPOTHETICAL_CONTEXT.test(scopedCurrent)) return true
  if (FAMILY_HISTORY_HEADING.test(evaluationText) && !explicitlyCurrent) return true
  if (REMOTE_HISTORY_HEADING.test(evaluationText) && !explicitlyCurrent) return true
  if (EDUCATION_HEADING.test(evaluationText) && !explicitlyCurrent) return true
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
  if (rule.anchor.test(scopedCurrent) && CORRECTION_DENIAL.test(next)) return true

  if (
    HISTORICAL.test(evaluationText) &&
    !isRecentResolvedCerebro(evaluationText) &&
    !isRecurrentTransientFocalEvent(evaluationText) &&
    !isRecentResolvedNonCerebroEmergency(evaluationText) &&
    !RECENT_TIA_RESOLVED.test(evaluationText) &&
    !hasCurrentFindingAfterHistoricalLanguage(evaluationText)
  ) {
    return true
  }

  // A speculative diagnosis followed by an explicit symptom denial is not an
  // asserted emergency. Uncertainty without denial remains a same-day hold.
  if (
    RULE_OUT.test(scopedCurrent) &&
    rule.anchor.test(next) &&
    (NEGATED.test(next) || NEGATED_FEATURE.test(next))
  ) {
    return true
  }

  return false
}

function classifyAssertion(text: string): GatewaySignal['assertion'] {
  return UNCERTAIN.test(text) ? 'uncertain' : 'present'
}

function classifyLexicalAssertion(
  text: string,
  rule: SyndromeRule,
): GatewaySignal['assertion'] {
  const scoped = relevantRuleContext(text, rule)
  if (
    EDUCATION_CONTEXT.test(scoped) ||
    EDUCATION_HEADING.test(scoped) ||
    HYPOTHETICAL_CONTEXT.test(scoped) ||
    NON_DIAGNOSTIC_DISEASE_CONTEXT.test(scoped)
  ) {
    return 'conditional'
  }
  if (hasRuleScopedNegation(scoped, rule)) {
    return 'negated'
  }
  return classifyAssertion(scoped)
}

function classifyTemporality(text: string): GatewaySignal['temporality'] {
  if (/\b(?:unclear|unknown|cannot determine)\b/i.test(text)) return 'unknown'
  if (
    isRecentResolvedCerebro(text) ||
    isRecurrentTransientFocalEvent(text) ||
    isRecentResolvedNonCerebroEmergency(text) ||
    RECENT_TIA_RESOLVED.test(text)
  ) {
    return 'recent'
  }
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
  if (HISTORICAL.test(text)) return 'historical'
  return 'unknown'
}

function makeEvidence(
  text: string,
  span: TextSpan,
  source?: SourceLocation,
): GatewayEvidence {
  return {
    packetId: source?.packetId ?? null,
    documentId: source?.documentId ?? null,
    pageNumber: source?.pageNumber ?? null,
    startOffset: span.startOffset,
    endOffset: span.endOffset,
    quote: text.slice(span.startOffset, span.endOffset),
    extractionMethod: source?.extractionMethod ?? 'native_text',
    extractionConfidence: source?.extractionConfidence ?? null,
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
  if (!next || !canCombineAdjacent(current.text, next.text)) return null

  const combined: TextSpan = {
    startOffset: current.startOffset,
    endOffset: next.endOffset,
    text: sourceText.slice(current.startOffset, next.endOffset),
  }

  if (
    (rule.anchor.test(current.text) || rule.anchor.test(next.text)) &&
    rule.matches(combined.text)
  ) {
    return { span: combined, nextContextIndex: index + 2 }
  }

  const third = spans[index + 2]
  if (!third || !canCombineAdjacent(next.text, third.text)) return null

  const combinedThree: TextSpan = {
    startOffset: current.startOffset,
    endOffset: third.endOffset,
    text: sourceText.slice(current.startOffset, third.endOffset),
  }
  const hasAnchor = [current, next, third].some((span) =>
    rule.anchor.test(span.text),
  )

  return hasAnchor && rule.matches(combinedThree.text)
    ? { span: combinedThree, nextContextIndex: index + 3 }
    : null
}

function collectLexicalHits(
  sourceText: string,
  spans: TextSpan[],
  source?: SourceLocation,
  maximumHits = Number.POSITIVE_INFINITY,
): GatewayLexicalHit[] {
  const hits: GatewayLexicalHit[] = []

  scan:
  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index]
    for (const rule of RULES) {
      if (!rule.anchor.test(span.text)) continue
      if (hits.length >= maximumHits) break scan

      const matchedRule = rule.matches(span.text)
      const experiencer = classifyExperiencer(span.text)
      const assertion = classifyLexicalAssertion(span.text, rule)
      const temporality =
        experiencer === 'family' || HISTORICAL.test(span.text)
          ? 'historical'
          : classifyTemporality(span.text)
      const suppressed =
        !matchedRule ||
        isSuppressed(spans, index, span.text, index + 1, rule)

      hits.push({
        code: `NEURO_LEXICAL_${rule.syndrome.toUpperCase()}`,
        syndrome: rule.syndrome,
        source: 'deterministic',
        action:
          assertion === 'present'
            ? 'emergency_now'
            : 'immediate_clinician_review',
        assertion,
        temporality,
        experiencer,
        evidence: [makeEvidence(sourceText, span, source)],
        matchedRule,
        suppressed,
      })
    }
  }

  return hits
}

function evidenceIdentity(evidence: GatewayEvidence): string {
  return [
    evidence.packetId ?? '',
    evidence.documentId ?? '',
    evidence.pageNumber ?? '',
    evidence.startOffset,
    evidence.endOffset,
  ].join(':')
}

function mergeSignal(
  existing: GatewaySignal,
  incoming: GatewaySignal,
  seenEvidence: Set<string>,
  maximumEvidence = Number.POSITIVE_INFINITY,
): GatewaySignal {
  const assertion =
    existing.assertion === 'present' || incoming.assertion === 'present' ? 'present' : 'uncertain'
  const incomingDominates =
    incoming.assertion === 'present' && existing.assertion !== 'present'
  let evidence = existing.evidence
  if (incomingDominates) {
    const dominantEvidence: GatewayEvidence[] = []
    const selected = new Set<string>()
    for (const candidate of [...incoming.evidence, ...existing.evidence]) {
      const identity = evidenceIdentity(candidate)
      if (selected.has(identity)) continue
      selected.add(identity)
      dominantEvidence.push(candidate)
      if (dominantEvidence.length >= maximumEvidence) break
    }
    evidence = dominantEvidence
    seenEvidence.clear()
    for (const selectedEvidence of evidence) {
      seenEvidence.add(evidenceIdentity(selectedEvidence))
    }
  } else if (evidence.length < maximumEvidence) {
    for (const candidate of incoming.evidence) {
      const identity = evidenceIdentity(candidate)
      if (seenEvidence.has(identity)) continue
      seenEvidence.add(identity)
      evidence.push(candidate)
      if (evidence.length >= maximumEvidence) break
    }
  }

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

function runEmergencyGatewayInternal(
  text: string,
  source?: SourceLocation,
  limits: EmergencyGatewayExecutionLimits = {},
): EmergencyGatewayResult | null {
  const signalsBySyndrome = new Map<EmergencySyndrome, GatewaySignal>()
  const evidenceIdentitiesBySyndrome = new Map<
    EmergencySyndrome,
    Set<string>
  >()
  const spans = sentenceSpans(
    text,
    limits.maxSentenceSpans ?? Number.POSITIVE_INFINITY,
  )
  if (!spans) return null
  const lexicalHits = collectLexicalHits(
    text,
    spans,
    source,
    limits.maxLexicalHits ?? Number.POSITIVE_INFINITY,
  )

  for (let index = 0; index < spans.length; index += 1) {
    for (const rule of RULES) {
      const evaluation = selectEvaluationSpan(text, spans, index, rule)
      if (!evaluation) continue
      if (
        isSuppressed(
          spans,
          index,
          evaluation.span.text,
          evaluation.nextContextIndex,
          rule,
        )
      ) {
        continue
      }

      const scopedContext = relevantRuleContext(evaluation.span.text, rule)
      const assertionContext = /\b(?:but|however|yet)\b/i.test(
        evaluation.span.text,
      )
        ? scopedContext
        : evaluation.span.text
      const assertion = classifyAssertion(assertionContext)
      const experiencer = classifyExperiencer(scopedContext)
      const signal: GatewaySignal = {
        code: `NEURO_EMERGENCY_${rule.syndrome.toUpperCase()}`,
        syndrome: rule.syndrome,
        source: 'deterministic',
        action: assertion === 'present' ? 'emergency_now' : 'immediate_clinician_review',
        assertion,
        temporality: classifyTemporality(scopedContext),
        experiencer: experiencer === 'family' ? 'family' : experiencer === 'other' ? 'other' : 'patient',
        evidence: [makeEvidence(text, evaluation.span, source)],
      }
      const existing = signalsBySyndrome.get(rule.syndrome)
      const seenEvidence = evidenceIdentitiesBySyndrome.get(rule.syndrome)
      signalsBySyndrome.set(
        rule.syndrome,
        existing && seenEvidence
          ? mergeSignal(
              existing,
              signal,
              seenEvidence,
              limits.maxEvidencePerSyndrome ?? Number.POSITIVE_INFINITY,
            )
          : signal,
      )
      if (!existing) {
        evidenceIdentitiesBySyndrome.set(
          rule.syndrome,
          new Set(signal.evidence.map(evidenceIdentity)),
        )
      }
    }
  }

  const signals = [...signalsBySyndrome.values()]
  const hasPresentEmergency = signals.some((signal) => signal.assertion === 'present')
  const hasUncertainEmergency = signals.some((signal) => signal.assertion === 'uncertain')

  if (hasPresentEmergency) {
    return {
      status: 'completed',
      failureCode: null,
      carePathway: 'emergency_now',
      reviewRequirement: 'emergency_action',
      schedulingLocked: true,
      signals,
      lexicalHits,
      version: EMERGENCY_GATEWAY_VERSION,
    }
  }

  if (hasUncertainEmergency) {
    return {
      status: 'completed',
      failureCode: null,
      carePathway: 'same_day_clinician_review',
      reviewRequirement: 'immediate_clinician_review',
      schedulingLocked: true,
      signals,
      lexicalHits,
      version: EMERGENCY_GATEWAY_VERSION,
    }
  }

  return {
    status: 'completed',
    failureCode: null,
    carePathway: 'routine_outpatient',
    reviewRequirement: 'clinician_confirmation',
    schedulingLocked: true,
    signals: [],
    lexicalHits,
    version: EMERGENCY_GATEWAY_VERSION,
  }
}

export function runEmergencyGateway(
  text: string,
  source?: SourceLocation,
  limits: EmergencyGatewayExecutionLimits = {},
): EmergencyGatewayResult {
  const failClosed = (
    failureCode: Exclude<EmergencyGatewayResult['failureCode'], null>,
  ): EmergencyGatewayResult => ({
    status: 'failed',
    failureCode,
    carePathway: 'undetermined',
    reviewRequirement: 'immediate_clinician_review',
    schedulingLocked: true,
    signals: [],
    lexicalHits: [],
    version: EMERGENCY_GATEWAY_VERSION,
  })

  if (typeof text !== 'string') {
    return failClosed('gateway_execution_failed')
  }
  if (!text.trim()) {
    return failClosed('empty_input')
  }

  if (
    [
      limits.maxSentenceSpans,
      limits.maxLexicalHits,
      limits.maxEvidencePerSyndrome,
    ].some(
      (limit) =>
        limit !== undefined &&
        (!Number.isSafeInteger(limit) || limit < 1),
    )
  ) {
    return failClosed('gateway_execution_failed')
  }

  if (source) {
    const invalidIdentifier = (value: string | undefined): boolean =>
      value !== undefined && !value.trim()
    const invalidPage =
      source.pageNumber !== undefined &&
      (!Number.isSafeInteger(source.pageNumber) || source.pageNumber < 1)
    const invalidConfidence =
      source.extractionConfidence !== undefined &&
      source.extractionConfidence !== null &&
      (!Number.isFinite(source.extractionConfidence) ||
        source.extractionConfidence < 0 ||
        source.extractionConfidence > 1)

    if (
      invalidIdentifier(source.packetId) ||
      invalidIdentifier(source.documentId) ||
      invalidPage ||
      invalidConfidence
    ) {
      return failClosed('invalid_provenance')
    }

    if (
      source.extractionMethod === 'ocr' &&
      (typeof source.extractionConfidence !== 'number' ||
        source.extractionConfidence < 0.5)
    ) {
      return failClosed('unreliable_extraction')
    }
  }

  try {
    return runEmergencyGatewayInternal(text, source, limits) ??
      failClosed('gateway_execution_failed')
  } catch {
    return failClosed('gateway_execution_failed')
  }
}
