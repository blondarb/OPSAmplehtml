import type { EscalationFlag, EscalationTier } from './types'

interface TriggerPattern {
  pattern: RegExp
  tier: EscalationTier
  category: string
  recommendedAction: string
}

// Tier 1 — URGENT triggers
const TIER_1_PATTERNS: TriggerPattern[] = [
  { pattern: /chest\s*pain|can'?t\s*breathe|difficulty\s*breathing|short(ness)?\s*of\s*breath/i, tier: 'urgent', category: 'cardiac_respiratory', recommendedAction: 'Advise 911. Immediate clinician notification.' },
  { pattern: /worst\s*headache|thunderclap|worst\s*head\s*pain/i, tier: 'urgent', category: 'severe_headache', recommendedAction: 'Advise 911. Rule out SAH.' },
  { pattern: /face\s*(droop|drooping|numb)|arm\s*(weak|numb|heavy)|speech\s*(slur|change|garble)|can'?t\s*speak\s*right|stroke/i, tier: 'urgent', category: 'stroke_symptoms', recommendedAction: 'Advise 911 immediately. Possible stroke.' },
  { pattern: /seizure|convulsion|fit|seizing/i, tier: 'urgent', category: 'seizure', recommendedAction: 'Urgent clinician callback within 1 hour.' },
  { pattern: /(fall|fell).*(head|hit|struck|injury)|lost\s*consciousness|passed\s*out|blacked\s*out|faint/i, tier: 'urgent', category: 'fall_head_injury', recommendedAction: 'Assess for head injury. Urgent if LOC or unclear.' },
  { pattern: /suicid|kill\s*(my|him|her)self|want\s*to\s*die|hurt\s*(my|him|her)self|end\s*my\s*life|self[- ]?harm|no\s*point|hopeless|don'?t\s*want\s*to\s*live|what'?s\s*the\s*point/i, tier: 'urgent', category: 'suicidal_ideation', recommendedAction: 'Provide 988 Lifeline. Immediate clinician notification. Terminate script.' },
  { pattern: /allergic\s*react|anaphyla|rash.*(all\s*over|spread|severe)|swelling.*(throat|tongue|face|lip)|hives/i, tier: 'urgent', category: 'allergic_reaction', recommendedAction: 'Advise ED evaluation even if "resolved" (biphasic anaphylaxis risk).' },
  { pattern: /vision\s*loss|can'?t\s*see|blind|sudden.*(double\s*vision|blurr)/i, tier: 'urgent', category: 'vision_loss', recommendedAction: 'Urgent clinician callback. Rule out optic neuritis, stroke.' },
  { pattern: /(stop|quit|ran\s*out|discontinue|off).*(levetiracetam|keppra|carbamazepine|tegretol|lamotrigine|lamictal|valproate|depakote|phenytoin|dilantin|baclofen|tizanidine|zanaflex|clonazepam|klonopin|lorazepam|ativan|diazepam|valium|benzodiazepine)/i, tier: 'urgent', category: 'abrupt_cessation', recommendedAction: 'URGENT: Risk of status epilepticus or withdrawal crisis. Immediate clinician callback + care coordinator for refill.' },
]

// Tier 2 — SAME-DAY triggers
const TIER_2_PATTERNS: TriggerPattern[] = [
  { pattern: /can'?t\s*(function|work|sleep|eat|drive|think)|interfering\s*with\s*(daily|my\s*life|everything)/i, tier: 'same_day', category: 'functional_impairment', recommendedAction: 'Same-day clinician callback.' },
  { pattern: /new\s*symptom|never\s*had\s*(this|before)|started\s*having/i, tier: 'same_day', category: 'new_symptoms', recommendedAction: 'Same-day clinician callback to assess.' },
  { pattern: /(much|significantly|lot|way)\s*worse|getting\s*worse|deteriorat/i, tier: 'same_day', category: 'worsening_symptoms', recommendedAction: 'Same-day clinician callback.' },
  { pattern: /can'?t\s*tolerate|makes?\s*me\s*(sick|nauseous|vomit)|throw(ing)?\s*up/i, tier: 'same_day', category: 'medication_intolerance', recommendedAction: 'Same-day clinician callback re: medication change.' },
  { pattern: /(very|extremely|really)\s*(anxious|scared|terrif|panic|worried|upset|distress)/i, tier: 'same_day', category: 'significant_distress', recommendedAction: 'Same-day clinician callback.' },
]

const ALL_PATTERNS = [...TIER_1_PATTERNS, ...TIER_2_PATTERNS]

/**
 * Secondary safety net: scan patient text for known escalation trigger phrases.
 * This runs AFTER the AI's own escalation detection as a dual-check.
 */
export function scanForEscalationTriggers(text: string): EscalationFlag[] {
  const flags: EscalationFlag[] = []
  const now = new Date().toISOString()

  for (const trigger of ALL_PATTERNS) {
    const match = text.match(trigger.pattern)
    if (match) {
      flags.push({
        tier: trigger.tier,
        triggerText: match[0],
        category: trigger.category,
        aiAssessment: `Regex safety net detected: ${trigger.category}`,
        recommendedAction: trigger.recommendedAction,
        timestamp: now,
      })
    }
  }

  return flags
}

/**
 * Merge AI-detected and regex-detected escalations.
 * Takes the higher severity when both detect the same category.
 */
export function mergeEscalations(
  aiFlags: EscalationFlag[],
  regexFlags: EscalationFlag[]
): EscalationFlag[] {
  const merged = [...aiFlags]
  const existingCategories = new Set(aiFlags.map(f => f.category))

  for (const flag of regexFlags) {
    if (!existingCategories.has(flag.category)) {
      merged.push(flag)
    }
  }

  return merged
}

/**
 * Get the highest escalation tier from a set of flags.
 */
export function getHighestTier(flags: EscalationFlag[]): string {
  const tierPriority: Record<string, number> = {
    urgent: 4,
    same_day: 3,
    next_visit: 2,
    informational: 1,
  }

  let highest = 'none'
  let highestPriority = 0

  for (const flag of flags) {
    const priority = tierPriority[flag.tier] || 0
    if (priority > highestPriority) {
      highest = flag.tier
      highestPriority = priority
    }
  }

  return highest
}
