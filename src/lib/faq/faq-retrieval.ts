/**
 * Neuro FAQ Voice — corpus retrieval (Gate 3).
 *
 * POC SKELETON. At POC scale (~8 entries) this is tag + keyword overlap.
 * Production upgrade path: embeddings / Bedrock Knowledge Base (retrieveFromKB
 * already exists in src/lib/bedrock.ts).
 *
 * Grounding is a SAFETY control: if nothing matches, the answer layer MUST
 * refuse (refusal-by-default). The corpus is the scope boundary.
 */

import seed from '@/data/faq/neuro-faq-seed.json'

export interface FaqEntry {
  id: string
  topic: string
  question: string
  canonical_answer: string
  escalation: 'none' | 'soft' | 'route'
  keywords: string[]
  source: string
  reviewed_by: string | null
  last_reviewed: string | null
}

const ENTRIES: FaqEntry[] = (seed as { entries: FaqEntry[] }).entries

/**
 * Return up to `limit` FAQ entries that plausibly answer the utterance,
 * scored by keyword overlap. Empty array => no grounding => caller must refuse.
 */
export function retrieveFaq(utterance: string, limit = 3): FaqEntry[] {
  const text = utterance.toLowerCase()
  const scored = ENTRIES.map((entry) => {
    let score = 0
    for (const kw of entry.keywords) {
      if (text.includes(kw.toLowerCase())) score += 2
    }
    // light bonus for topic word presence
    if (text.includes(entry.topic.replace(/_/g, ' '))) score += 1
    return { entry, score }
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored.map((s) => s.entry)
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
