/**
 * Neuro FAQ Voice — corpus retrieval (Gate 3).
 *
 * POC SKELETON. At POC scale (handful of entries) this is tag + keyword overlap
 * over the ACTIVE specialty's corpus (neuro today; oab is a data swap via
 * FAQ_SPECIALTY). Production upgrade path: embeddings / Bedrock Knowledge Base
 * (retrieveFromKB already exists in src/lib/bedrock.ts).
 *
 * Grounding is a SAFETY control: if nothing matches, the answer layer MUST
 * refuse (refusal-by-default). The corpus is the scope boundary.
 */

import { getActiveSpecialty } from './specialty'
import type { FaqEntry, SpecialtyConfig } from './types'

export type { FaqEntry } from './types'

/**
 * Return up to `limit` FAQ entries that plausibly answer the utterance,
 * scored by keyword overlap. Empty array => no grounding => caller must refuse.
 */
export function retrieveFaq(
  utterance: string,
  limit = 3,
  specialty: SpecialtyConfig = getActiveSpecialty(),
): FaqEntry[] {
  const text = utterance.toLowerCase()
  return specialty.corpus
    .map((entry) => {
      let score = 0
      for (const kw of entry.keywords) {
        if (text.includes(kw.toLowerCase())) score += 2
      }
      if (text.includes(entry.topic.replace(/_/g, ' '))) score += 1
      return { entry, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry)
}

/** Serialize matched entries for injection into the answer prompt. */
export function formatEntriesForPrompt(entries: FaqEntry[]): string {
  return entries
    .map(
      (e, i) =>
        `[${i + 1}] (topic: ${e.topic}, boundary: ${e.escalation})\nQ: ${e.question}\nA: ${e.canonical_answer}`,
    )
    .join('\n\n')
}
