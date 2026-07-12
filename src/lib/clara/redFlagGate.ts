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
