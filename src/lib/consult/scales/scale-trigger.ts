/**
 * Scale Trigger Engine (Phase 3)
 *
 * Evaluates localizer output against the SCALE_TRIGGERS registry and returns
 * the ordered list of scales that should be administered for this session.
 *
 * Matching logic (either condition triggers the scale):
 *   1. A trigger category matches one of the localizer's differential categories
 *   2. A trigger keyword appears in the symptom summary
 *
 * Deduplication:
 *   - Scales already completed in this session are excluded
 *   - Results are ranked by trigger priority (ascending — 1 = highest)
 */

import { SCALE_TRIGGERS, CONSULT_SCALE_DEFINITIONS } from './scale-library'
import type { LocalizerSnapshot, TriggeredScale } from './scale-types'

// ─── Matching ─────────────────────────────────────────────────────────────────

function categoryMatch(triggerCategories: string[], detected: string[]): boolean {
  const detected_lower = detected.map((c) => c.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
  return triggerCategories.some((tc) =>
    detected_lower.some((dc) => dc.includes(tc) || tc.includes(dc))
  )
}

function keywordMatch(triggerKeywords: string[], symptomSummary: string): string | null {
  const lower = symptomSummary.toLowerCase()
  for (const kw of triggerKeywords) {
    if (lower.includes(kw.toLowerCase())) return kw
  }
  return null
}

// ─── Main API ─────────────────────────────────────────────────────────────────

/**
 * Options to adjust trigger sensitivity.
 * - `strict`: Only match when a category matches (keywords alone don't trigger)
 * - `broad` (default): Category OR keyword match triggers the scale
 */
export interface TriggerOptions {
  mode?: 'strict' | 'broad'
  /** Override the feature flag — useful for testing */
  forceEnabled?: boolean
}

/**
 * Given a localizer snapshot, returns the ordered list of scales that should
 * be administered. Already-completed scales are excluded.
 */
export function getTriggeredScales(
  snapshot: LocalizerSnapshot,
  options: TriggerOptions = {}
): TriggeredScale[] {
  const { mode = 'broad' } = options
  const completedSet = new Set(snapshot.completedScaleIds)

  const results: TriggeredScale[] = []

  for (const trigger of SCALE_TRIGGERS) {
    // Skip already completed
    if (completedSet.has(trigger.scaleId)) continue

    // Look up scale definition for display metadata
    const scaleDef = CONSULT_SCALE_DEFINITIONS[trigger.scaleId]
    if (!scaleDef) continue

    // Determine if this trigger fires
    const catHit = categoryMatch(trigger.triggerCategories, snapshot.differentialCategories)
    const kwHit = mode === 'broad'
      ? keywordMatch(trigger.triggerKeywords, snapshot.symptomSummary)
      : null

    if (!catHit && !kwHit) continue

    // Build human-readable trigger reason
    const triggerReason = catHit
      ? `Identified diagnosis category: ${snapshot.differentialCategories
          .filter((c) =>
            trigger.triggerCategories.some(
              (tc) => c.toLowerCase().includes(tc) || tc.includes(c.toLowerCase())
            )
          )
          .join(', ')}`
      : `Symptom mention: "${kwHit}"`

    results.push({
      scaleId: trigger.scaleId,
      scaleName: scaleDef.name,
      scaleAbbreviation: scaleDef.abbreviation,
      adminMode: trigger.adminMode,
      requiresPhysician: trigger.requiresPhysician,
      triggerReason,
      priority: trigger.priority,
    })
  }

  // Sort by priority ascending (1 = most important first)
  results.sort((a, b) => a.priority - b.priority)

  return results
}

/**
 * Convenience: returns only scales that can be voice-administered by the historian AI.
 */
export function getVoiceAdministrableScales(
  snapshot: LocalizerSnapshot,
  options?: TriggerOptions
): TriggeredScale[] {
  return getTriggeredScales(snapshot, options).filter(
    (s) => s.adminMode === 'voice_administrable'
  )
}

/**
 * Convenience: returns scales that require a physician (flagged for the physician panel).
 */
export function getPhysicianRequiredScales(
  snapshot: LocalizerSnapshot,
  options?: TriggerOptions
): TriggeredScale[] {
  return getTriggeredScales(snapshot, options).filter((s) => s.requiresPhysician)
}

/**
 * Builds the instructions block that is injected into the historian session
 * to administer a specific scale. This text is appended to the session's
 * system prompt via a `session.update` message on the data channel.
 *
 * The historian AI reads these instructions and transitions to scale
 * administration mode, asking questions one at a time in natural language,
 * then calls `save_scale_responses` when complete.
 */
export function buildScaleAdministrationInstructions(
  scaleName: string,
  scaleAbbreviation: string,
  questions: Array<{ id: string; conversationalText: string }>
): string {
  const questionList = questions
    .map((q, i) => `  ${i + 1}. [ID: ${q.id}] ${q.conversationalText}`)
    .join('\n')

  return `

---
SCALE ADMINISTRATION BLOCK — ${scaleAbbreviation}

You are now administering the ${scaleName} (${scaleAbbreviation}). This is a validated clinical instrument; you must ask each question using the exact phrasing provided below. Ask one question at a time and wait for the patient's response before moving to the next.

When the patient provides an answer, confirm it back to them naturally ("Got it, I'll note that") and proceed. Do not interpret or comment on their answers during administration.

Questions to ask (in order):
${questionList}

After you have collected all responses, call the \`save_scale_responses\` function with:
- scale_id: "${scaleAbbreviation.toLowerCase().replace(/-/g, '')}"
- scale_abbreviation: "${scaleAbbreviation}"
- responses: { question_id: numeric_value, ... }

For choice questions, map the spoken answer to its numeric value (0, 1, 2, 3, or 4 depending on scale).
For frequency questions (PHQ-9, GAD-7): Not at all=0, Several days=1, More than half the days=2, Nearly every day=3.
For impact questions (HIT-6): Never=6, Rarely=8, Sometimes=10, Very often=11, Always=13.
For MIDAS questions: use the number of days the patient reports.
For ESS questions: Never=0, Slight=1, Moderate=2, High=3.
For ALSFRS-R questions: map to the displayed numeric value (0–4).

Once the function call is submitted, say something like: "Thank you, I've recorded your answers. Let me continue with a few more questions about your health history." Then resume the normal intake interview.
---
`
}

/** The OpenAI function tool definition for `save_scale_responses`. */
export const SAVE_SCALE_RESPONSES_TOOL = {
  type: 'function' as const,
  name: 'save_scale_responses',
  description:
    'Called by the historian AI after completing administration of a clinical scale. Submits the patient\'s responses for scoring.',
  parameters: {
    type: 'object',
    properties: {
      scale_id: {
        type: 'string',
        description: 'The scale identifier (e.g., "phq9", "gad7", "hit6")',
      },
      scale_abbreviation: {
        type: 'string',
        description: 'The scale abbreviation (e.g., "PHQ-9", "GAD-7")',
      },
      responses: {
        type: 'object',
        description: 'Map of question ID to numeric response value',
        additionalProperties: { type: 'number' },
      },
    },
    required: ['scale_id', 'scale_abbreviation', 'responses'],
  },
}
