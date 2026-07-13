/**
 * Clara voice test — deterministic red-flag gate (Gate 0).
 *
 * SOURCE OF TRUTH: keep in sync with sevaro-voice-agent
 * src/agents/safety/redFlagGate.ts (if/when that file exists — as of this
 * writing sevaro-voice-agent's emergency detection lives inline in
 * ConsultClassificationService.emergencyFallbackService(), which this gate
 * supersedes for Clara's browser test surface with a much higher-recall,
 * word-boundary lexicon). This runs on the RAW transcript BEFORE any model
 * call — it is the non-bypassable floor of the layered safety design used
 * by Clara's classify route (see /api/ai/clara/classify).
 *
 * Lexicon sources:
 *   - src/hooks/useRealtimeSession.ts SAFETY_KEYWORDS (self-harm/harm-to-others)
 *   - ClaudeSync/projects/OPSample/neuro-faq-voice/safety_architecture.md §2
 *     (BE-FAST stroke signs, status epilepticus, thunderclap/"worst headache
 *     of my life", self-harm) — Steve's local planning doc, not in this repo
 *   - sevaro-voice-agent ConsultClassificationService.emergencyFallbackService()
 *     emergencyKeywords (stroke, seizure, unconscious, unresponsive, bleeding,
 *     hemorrhage, weakness, speech problems, vision loss, confusion, acute, sudden)
 *
 * Tuning principle: HIGH RECALL. Over-triggering ("call 911 to be safe") is
 * the safe failure direction; under-triggering is not. Word-boundary regex,
 * case-insensitive, run against the lowercased+trimmed utterance.
 */

export type RedFlagCategory =
  | 'stroke'
  | 'seizure'
  | 'headache'
  | 'acute_emergency'
  | 'self_harm'

export interface RedFlagBank {
  category: RedFlagCategory
  patterns: RegExp[]
}

// Ordered: self-harm first (highest-priority human-safety concern), then
// acute stroke/seizure/headache signs, then general acute-emergency terms.
// First bank with a match wins; matchedTerms collects every hit across all
// banks so the caller can log full context.
export const RED_FLAG_BANKS: RedFlagBank[] = [
  {
    category: 'self_harm',
    patterns: [
      // Reflexive phrasing covers both first-person ("I want to kill myself")
      // and a caller describing the patient in third person ("he wants to
      // kill himself") — a phone operator hears both.
      /\bkill\s+(?:myself|himself|herself|themselves)\b/i,
      /\bwants?\s+to\s+die\b/i,
      /\bhurt\s+(?:myself|himself|herself|themselves)\b/i,
      /\bend\s+(?:my|his|her|their)\s+life\b/i,
      /\bsuicide\b/i,
      /\bsuicidal\b/i,
      /\bself[\s-]?harm\b/i,
      /\bdon'?t\s+want\s+to\s+live\b/i,
      /\bdoesn'?t\s+want\s+to\s+live\b/i,
      /\bhurt\s+someone\b/i,
      /\bkill\s+someone\b/i,
    ],
  },
  {
    category: 'stroke',
    patterns: [
      // STROKE-ALERT ACTIVATION LANGUAGE — added 2026-07-13 (Steve live test):
      // a caller opening with "I need an emergency stroke consult" / "we have a
      // stroke alert" / "code stroke" is the STRONGEST possible signal on a real
      // triage line (it's how nurses and ED clinicians actually call one in),
      // yet the floor missed all of them — it was keyed only to symptom
      // descriptions (face droop, weak arm), so an explicit activation sailed
      // past Gate 0 and the emergent call rode entirely on the LLM. "code
      // stroke"/"stroke alert" previously lived ONLY in ACUTE_STROKE_OVERRIDE
      // (they influenced the subacute deferral but never fired the bank itself).
      // Over-triage direction; a genuinely subacute one still defers via the
      // ≥2-day rule below.
      /\bcode\s+stroke\b/i,
      /\bstroke\s+alert\b/i,
      /\bstroke\s+(?:consult|activation|protocol|code|workup)\b/i,
      /\bactivat\w*\s+(?:a\s+|the\s+)?stroke\b/i,
      /\bemergency\s+stroke\b/i,
      /\bpossible\s+stroke\b/i,
      /\bacute\s+stroke\b/i,
      // LATERALIZED WEAKNESS/NUMBNESS in noun form — the most natural way a
      // caller describes a hemiparesis ("right-sided weakness", "weakness in his
      // right arm and leg"), which the adjacency-only "weak arm"/"arm is weak"
      // patterns below all missed (live test, same session).
      /\b(?:left|right|one)[\s-]?sided?\s+(?:weak(?:ness)?|numb(?:ness)?|paralysis|paresis|droop)/i,
      /\bweak(?:ness)?\s+(?:in|on|of|to)\s+(?:the\s+|his\s+|her\s+|their\s+|my\s+|one\s+)?(?:right\s+|left\s+)?(?:side|arm|leg|face|hand)\b/i,
      /\bnumb(?:ness)?\s+(?:in|on|of)\s+(?:the\s+|his\s+|her\s+|their\s+|my\s+|one\s+)?(?:right\s+|left\s+)?(?:side|arm|leg|face|hand)\b/i,
      /\b(?:right|left)\s+(?:arm|leg|hand|side|face)\s+(?:is\s+|are\s+|feels?\s+|went\s+|going\s+|has\s+gone\s+)?(?:weak|numb|paralyz|droop)/i,
      // BE-FAST — Balance, Eyes, Face, Arm, Speech, Time
      /\bface\s+droop(?:ing|ed)?\b/i,
      /\b(?:face|mouth)\s+is\s+droop(?:ing)?\b/i,
      /\b(?:can'?t|cannot|couldn'?t)\s+(?:lift|move|use)\s+(?:my|his|her|their)?\s*arm\b/i,
      /\bweak\s+arm\b/i,
      /\barm\s+(?:is\s+)?weak(?:ness)?\b/i,
      /\bone\s+side\s+(?:of\s+(?:my|his|her|their)?\s*(?:body|face))?\s*(?:is\s+)?(?:weak|numb|droop)/i,
      /\bslurred?\s+speech\b/i,
      /\bslurring\s+(?:my|his|her|their)?\s*words\b/i,
      /\b(?:can'?t|cannot|couldn'?t)\s+speak\b/i,
      /\b(?:can'?t|cannot|couldn'?t)\s+understand\b/i,
      /\bsudden\s+numbness\b/i,
      /\bsudden\s+(?:loss\s+of\s+)?vision\b/i,
      /\blost\s+(?:my\s+)?vision\b/i,
      /\b(?:can'?t|cannot|couldn'?t)\s+see\b/i,
      /\bsudden\s+dizziness\b/i,
      /\b(?:can'?t|cannot|couldn'?t)\s+walk\b/i,
      /\blost\s+(?:my\s+)?balance\b/i,
      /\bam\s+i\s+having\s+a\s+stroke\b/i,
      /\bhaving\s+a\s+stroke\b/i,
      /\bstroke\s+symptoms?\b/i,
      /\bfacial\s+droop\b/i,
      // WAKE-UP / FOUND-DOWN stroke — added 2026-07-13 (red-team): "woke up
      // this morning with weakness" fired NOTHING at the floor (the noun-form
      // weakness patterns need a body part) and the LLM then wrongly downgraded
      // it to STAT-2 off a stray "couple days ago". A wake-up stroke's LKW is
      // bedtime — potentially inside the thrombectomy window — so it is a floor
      // hit. Bounded to wake-up/found-down CO-OCCURRING with a deficit token so
      // "woke up feeling fine" never fires.
      /\bwoke\s+up\s+(?:this\s+morning\s+|today\s+)?with\s+(?:[a-z']+\s+){0,4}(?:weak|numb|droop|slur|paralyz|vision|speech|face|arm|leg|dizz|confus)/i,
      /\bfound\s+(?:him|her|them|the\s+patient)?\s*(?:down|on\s+the\s+floor|unable\s+to)\b/i,
    ],
  },
  {
    category: 'seizure',
    patterns: [
      /\bhaving\s+a\s+seizure\b/i,
      /\bwon'?t\s+stop\s+shaking\b/i,
      /\bseizure\s+won'?t\s+stop\b/i,
      /\bseizing\b/i,
      /\bconvulsing\b/i,
      /\bseizure\s+(?:lasting|for)\s+(?:more\s+than\s+|over\s+)?\d+\s*min/i,
      /\b(?:back[\s-]to[\s-]back|multiple|repeated)\s+seizures?\b/i,
      // "cluster of seizures" / "seizure cluster" — acute seizure activity that
      // the back-to-back/multiple/repeated alternation missed (red-team
      // 2026-07-12, ceribell-airway case: "cluster of seizures" bypassed the
      // whole floor). Over-triage direction.
      /\b(?:cluster\s+of\s+seizures?|seizure\s+cluster)\b/i,
      /\bwon'?t\s+wake\s+up\s+after\b/i,
      /\bstatus\s+epilepticus\b/i,
    ],
  },
  {
    category: 'headache',
    patterns: [
      /\bworst\s+headache\s+of\s+(?:my|his|her|their)\s+life\b/i,
      /\bthunderclap\b/i,
      /\bsudden\s+severe\s+headache\b/i,
      /\bworst\s+headache\s+(?:i'?ve|i\s+have)\s+ever\s+had\b/i,
    ],
  },
  {
    category: 'acute_emergency',
    patterns: [
      /\b(?:can'?t|cannot|couldn'?t)\s+breathe\b/i,
      /\bchest\s+pain\b/i,
      /\bpassing\s+out\b/i,
      /\bunconscious\b/i,
      /\bunresponsive\b/i,
      /\bbleeding\b/i,
      /\bhemorrhage\b/i,
      /\bgetting\s+worse\s+fast\b/i,
      /\bright\s+now\b/i,
      // AIRWAY / BREATHING collapse — added 2026-07-12 (red-team): a postictal
      // patient "not protecting his airway", "apneic", or "stopped breathing"
      // bypassed Gate 0 entirely and was routed as a routine EEG read. These
      // are unambiguous "call a code" signs regardless of cause; over-triage
      // direction, faithful to the bank's high-recall design.
      /\b(?:not\s+protecting|can'?t\s+protect|cannot\s+protect|unable\s+to\s+protect|failing\s+to\s+protect|losing|lost)\s+(?:his|her|their|the|its\s+)?\s*airway\b/i,
      /\bairway\s+compromis\w*\b/i,
      /\bstopped\s+breathing\b/i,
      /\bnot\s+breathing\b/i,
      /\bapne(?:a|ic)\b/i,
      /\bdesaturat\w*\b/i,
      /\bturning\s+blue\b/i,
      /\bcyanotic\b/i,
      // CONSCIOUSNESS collapse — cannot be roused / won't wake up. The bank had
      // "unconscious"/"unresponsive" but missed these common phrasings (red-team
      // ceribell-airway case: "not been able to rouse him").
      /\b(?:un(?:able\s+to\s+)?rouse|unrousable|unarousable|can'?t\s+rouse|cannot\s+rouse|couldn'?t\s+rouse|won'?t\s+rouse|not\s+(?:been\s+)?able\s+to\s+rouse)\b/i,
      /\b(?:can'?t|cannot|couldn'?t|won'?t|unable\s+to)\s+wake\s+(?:him|her|them)?\s*up\b/i,
      // POST-THROMBOLYTIC / POST-THROMBECTOMY DETERIORATION — added 2026-07-13
      // (red-team): "gave tpa this morning, now vomiting and more confused" is
      // a possible hemorrhagic conversion (a code-level emergency), but it fired
      // NOTHING at the floor — only the LLM caught it. Requires a clot-buster/
      // thrombectomy mention CO-OCCURRING with a decline sign, so a routine
      // "post thrombectomy, no new deficits" (which is STAT 2 / rounding) does
      // NOT fire. Over-triage direction.
      /\b(?:t\s*p\s*a|tnk|tenecteplase|alteplase|thrombolytic\w*|thrombolysis|thrombectomy|clot[\s-]?buster)\b[\s\S]{0,60}?\b(?:worse|worsening|deteriorat\w*|declin\w*|new\s+(?:deficit|weakness|symptom|bleed)|more\s+(?:confused|lethargic|somnolent|drowsy)|vomit\w*|severe\s+headache|unrespons\w*|unarousable|hemorrhag\w*)\b/i,
    ],
  },
]

export interface RedFlagResult {
  isRedFlag: boolean
  category: RedFlagCategory | null
  matchedTerms: string[]
}

// ---------------------------------------------------------------------------
// Subacute-stroke deferral (Sam's live finding, Steve relayed 2026-07-12):
// "LKW two days ago" still escalated as a code stroke. BE-FAST terms in an
// EXPLICITLY multi-day presentation are a completed/subacute stroke, which
// Clara's rulebook already tiers correctly (stroke ≤24h → EMERGENT; >24h →
// NON_EMERGENT STAT 2, callback ≤60 min — see claraRulebook "Stroke timing").
// The deterministic gate was pre-empting that rule, so a clearly-subacute
// stroke-category hit now DEFERS to the rulebook — same approved shape as the
// Ceribell/EEG-read seizure deferral in classify/route.ts.
//
// FAIL-SAFE DIRECTION IS PRESERVED:
//   - Only the STROKE bank can defer. Self-harm, seizure/status, thunderclap
//     and general acute-emergency hits always keep the floor.
//   - Deferral requires an EXPLICIT ≥2-day timeframe ("two days of weakness",
//     "last known well three days ago", "since last week"). Unknown timing,
//     "yesterday", or hour-scale phrasing never defers (thrombectomy-window
//     ambiguity stays gated).
//   - ANY acute/worsening language keeps the floor: "code stroke"/"stroke
//     alert", sudden/acute, worse/worsening/progressing, today/this morning/
//     just now, hour/minute timeframes, wake-up stroke, tPA/thrombectomy talk.
//   - A hit from any OTHER bank (e.g. "unresponsive") keeps the floor — but
//     the pervasive negated radiology idiom "no/without hemorrhage|bleeding"
//     is stripped first so a normal imaging report can't block the deferral
//     ("CT shows no hemorrhage" matched the acute_emergency bank verbatim).
// ---------------------------------------------------------------------------

const SUBACUTE_TIMEFRAME =
  /\b(?:(?:two|three|four|five|six|seven|eight|nine|ten|[2-9]|\d{2,})\s+(?:days?|weeks?|months?)\s+(?:ago|of|prior))\b|\b(?:for|over)\s+the\s+(?:last|past)\s+(?:two|three|four|five|six|seven|eight|nine|ten|[2-9]|\d{2,})\s+(?:days?|weeks?|months?)\b|\blast\s+(?:week|month)\b|\b(?:weeks?|months?)\s+ago\b/i

const ACUTE_STROKE_OVERRIDE =
  /\b(?:code\s+stroke|stroke\s+alert|just\s+now|right\s+now|this\s+morning|today|tonight|(?:an?\s+|\d+\s+|few\s+)?(?:hour|minute)s?\s+ago|within\s+the\s+(?:last|past)\s+(?:hour|day|\d+\s+hours?|twenty[\s-]?four)|sudden(?:ly)?|acute(?:ly)?|(?:getting|got|becoming)\s+worse|worse(?:ning)?|progress(?:ing|ive)|deteriorat\w*|new\s+(?:deficit|symptom|weakness|onset)|woke\s+up\s+with|wake[\s-]?up\s+stroke|still\s+(?:seizing|unresponsive)|t\s*p\s*a|tnk|thrombolytic|thrombolysis|thrombectomy)\b/i

/** Negated imaging findings ("no hemorrhage", "without bleeding") — routine
 *  radiology-speak that must not count as an acute-emergency hit. */
const NEGATED_FINDING =
  /\b(?:no|without|denies|negative\s+for)\s+(?:any\s+)?(?:acute\s+)?(?:evidence\s+of\s+)?(?:hemorrhage|bleed(?:ing)?)\b/gi

/**
 * True when a stroke-category Gate-0 hit describes an EXPLICITLY subacute
 * (≥2-day) presentation with no acute/worsening language and no red-flag hit
 * from any other bank — i.e. it is safe to let the rulebook apply its
 * stroke-timing rule (>24h → NON_EMERGENT STAT 2) instead of the hard floor.
 */
export function isSubacuteStrokeReport(text: string): boolean {
  const normalized = (text || '').toLowerCase().trim()
  if (!normalized) return false

  const flags = detectRedFlag(normalized)
  if (!flags.isRedFlag || flags.category !== 'stroke') return false
  if (!SUBACUTE_TIMEFRAME.test(normalized)) return false
  if (ACUTE_STROKE_OVERRIDE.test(normalized)) return false

  // Any hit outside the stroke bank keeps the floor — after stripping the
  // negated-imaging idiom so "CT shows no hemorrhage" doesn't count.
  const denegated = normalized.replace(NEGATED_FINDING, ' ')
  const nonStrokeHit = RED_FLAG_BANKS.some(
    (bank) => bank.category !== 'stroke' && bank.patterns.some((p) => p.test(denegated)),
  )
  return !nonStrokeHit
}

// ---------------------------------------------------------------------------
// Stroke-downgrade safety guard (red-team 2026-07-13).
//
// The stroke-alert → STAT-2 downgrade is the ONLY under-triage-capable path in
// the classifier, and the LLM does it unreliably on ambiguous timing: the
// red-team found STABLE mis-reads ("a couple days back, hard to say" = 5/5
// non-emergent) AND stochastic flips (temp 0.4). Prompt tuning could not close
// it. This is the deterministic backstop: it only ever ESCALATES a stroke that
// the model tried to downgrade — it can NEVER under-triage — so a wrong guess
// costs an MD1 page (safe/costly), never a missed stroke (dangerous).
//
// Scope: fires ONLY on a consultType === 'non-emergent' result (the stroke-
// timing STAT-2 bucket) with stroke context. CT-return / EEG / Ceribell /
// rounding / outpatient are DISTINCT consult types with their own logic and are
// never touched. A downgrade is PERMITTED only when the transcript carries a
// confident, unambiguous, stable > 24 h onset and NONE of the danger markers.
// ---------------------------------------------------------------------------

/** Any focal-deficit / stroke signal — broad on purpose (over-firing only ever escalates, which is safe). */
const STROKE_CONTEXT =
  /\b(stroke|weak(?:ness)?|numb(?:ness)?|paralys\w*|hemipar\w*|hemipleg\w*|facial\s+droop|droop\w*|slur\w*|aphasi\w*|dysarthr\w*|vision\s+loss|field\s+cut|neglect|ataxi\w*|can'?t\s+(?:move|speak|see)|face\s+is\s+droop)/i

/** Uncertainty/hedging about WHEN it started → not a confident onset → keep EMERGENT. */
const GUARD_UNCERTAINTY =
  /\b(?:not\s+sure|unsure|not\s+(?:totally|entirely|really)\s+sure|hard\s+to\s+say|hard\s+to\s+tell|(?:i|he|she|they|we|patient|family|husband|wife|son|daughter|mother|father|mom|dad)\s+thinks?|i\s+want\s+to\s+say|maybe|roughly|sometime|somewhere\s+around|around\b|[a-z]+-ish\b|poor\s+historian|isn'?t\s+sure|aren'?t\s+sure|not\s+certain|uncertain|unclear|unknown|don'?t\s+know|can'?t\s+say|guessing|approximately|give\s+or\s+take)\b/i
/** Fluctuating / relapsing course → active process → keep EMERGENT. */
const GUARD_FLUCTUATION =
  /\b(?:comes?\s+and\s+goes?|on\s+and\s+off|on-and-off|intermittent\w*|waxing|waning|back\s+again|came?\s+back|returned|relaps\w*)\b/i
/** Wake-up / found-down → LKW is last-seen-normal, may be in window → keep EMERGENT. */
const GUARD_WAKEUP =
  /\b(?:woke\s+up|wake[\s-]?up|found\s+(?:him|her|them|the\s+patient|down|on\s+the)|on\s+waking|on\s+awakening)\b/i
/** Any worsening / progression / new deficit → stroke-in-evolution → keep EMERGENT. */
const GUARD_WORSENING =
  /\b(?:worse|worsen\w*|worsened|progress\w*|spread\w*|deteriorat\w*|declin\w*|getting\s+bad|new\s+(?:deficit|weakness|numbness|symptom|onset))\b/i

/** CONFIDENT, unambiguous > 24 h onset (≥ 2 days / weeks / months, or a named day/week). Required to permit a downgrade. */
const CONFIDENT_OVER_24H =
  /\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,3})\s+(?:days?|weeks?|months?)\s+ago\b|\b(?:since|last)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)\b|\ba\s+(?:week|month)\s+ago\b|\b(?:weeks?|months?)\s+ago\b/i
/** Explicitly stable / unchanged / resolved. Required (with a confident > 24 h) to permit a downgrade. */
const STABLE_SIGNAL =
  /\b(?:stable|unchanged|no\s+change|no\s+new|baseline|resolved|back\s+to\s+(?:normal|baseline)|hasn'?t\s+changed|since\s+then\s+nothing)\b/i

export interface StrokeDowngradeGuardResult {
  /** True → the caller MUST force the disposition back to EMERGENT. */
  forceEmergent: boolean
  reason: string | null
}

/**
 * Given the raw transcript and the model's chosen consultType, decide whether a
 * stroke was unsafely downgraded. Returns forceEmergent=true when the model put
 * a stroke-context case into NON_EMERGENT without a clean, confident, stable
 * > 24 h onset — or with any danger marker present. Escalate-only.
 */
export function evaluateStrokeDowngradeGuard(
  transcript: string,
  consultType: string | null | undefined,
): StrokeDowngradeGuardResult {
  const t = (transcript || '').toLowerCase()
  // Only the stroke-timing STAT-2 bucket is in scope. Other non-emergent
  // consult TYPES (ct-return, eeg-read, ceribell-eeg, rounding, outpatient) are
  // legitimately not-emergent and are never touched.
  if (consultType !== 'non-emergent') return { forceEmergent: false, reason: null }
  if (!STROKE_CONTEXT.test(t)) return { forceEmergent: false, reason: null }

  const danger =
    (GUARD_UNCERTAINTY.test(t) && 'uncertain/hedged onset') ||
    (GUARD_FLUCTUATION.test(t) && 'fluctuating/relapsing course') ||
    (GUARD_WAKEUP.test(t) && 'wake-up / found-down (LKW may be in window)') ||
    (GUARD_WORSENING.test(t) && 'worsening / new deficit')
  const confidentSubacute = CONFIDENT_OVER_24H.test(t) && STABLE_SIGNAL.test(t)

  if (danger) return { forceEmergent: true, reason: `stroke downgrade vetoed — ${danger}` }
  if (!confidentSubacute)
    return { forceEmergent: true, reason: 'stroke downgrade vetoed — no confident, stable >24h onset stated' }
  return { forceEmergent: false, reason: null }
}

/**
 * Deterministic, regex-based red-flag detector. HIGH RECALL by design —
 * this is Gate 0 and must never depend on an LLM "deciding" a symptom is
 * serious. Returns every matched term across all banks (for logging), and
 * the highest-priority category (banks are checked in the order they are
 * declared above; self-harm wins ties).
 */
export function detectRedFlag(text: string): RedFlagResult {
  const normalized = (text || '').toLowerCase().trim()
  if (!normalized) {
    return { isRedFlag: false, category: null, matchedTerms: [] }
  }

  let firstCategory: RedFlagCategory | null = null
  const matchedTerms: string[] = []

  for (const bank of RED_FLAG_BANKS) {
    for (const pattern of bank.patterns) {
      const hit = normalized.match(pattern)
      if (hit) {
        if (!firstCategory) firstCategory = bank.category
        matchedTerms.push(hit[0])
      }
    }
  }

  return {
    isRedFlag: matchedTerms.length > 0,
    category: firstCategory,
    matchedTerms,
  }
}
