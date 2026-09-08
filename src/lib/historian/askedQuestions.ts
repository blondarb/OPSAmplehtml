/**
 * Extracts the questions Henry (the historian voice agent) has already asked
 * the patient, from the transcript, for the localizer's steer-generation
 * step to dedupe against.
 *
 * Why (2026-09-08): the steer generator (Step 3a of the localizer pipeline,
 * src/app/api/ai/historian/localizer/route.ts) never saw which questions
 * Henry had already asked, so it kept re-suggesting the same gap ("where is
 * the weakness most?", "when did you first notice it?") whenever the
 * extracted symptom list still lacked that detail — and Henry repeated a
 * question the patient had already answered. Observed live: the same
 * location question asked 3 times and the onset question 3 times across a
 * 40-question interview.
 */

export interface AskedQuestionsTurn {
  role: string
  text: string
}

const DEFAULT_MAX = 40
const DEFAULT_MAX_LEN = 160

/** Split turn text into sentences, keeping the trailing terminator with each. */
function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+(?:[.!?]+|$)/g) ?? []
  return matches.map((s) => s.trim()).filter(Boolean)
}

/**
 * Returns the question sentences Henry (assistant turns) has already asked,
 * most recent last, de-duplicated case-insensitively (a repeated question
 * keeps only its most recent position), capped at `max` entries of at most
 * `maxLen` characters each. Non-assistant turns and sentences without a
 * question mark (greeting/closing boilerplate) are naturally excluded.
 */
export function extractAskedQuestions(
  turns: Array<{ role: string; text: string }>,
  opts?: { max?: number; maxLen?: number }
): string[] {
  const max = opts?.max ?? DEFAULT_MAX
  const maxLen = opts?.maxLen ?? DEFAULT_MAX_LEN

  // Ordered map keyed by the case-insensitive normalized question — inserting
  // (or re-inserting) a key moves it to the end, so the most recent occurrence
  // of a repeated question determines its position.
  const seen = new Map<string, string>()

  for (const turn of turns) {
    if (turn.role !== 'assistant' || typeof turn.text !== 'string') continue
    for (const sentence of splitSentences(turn.text)) {
      if (!sentence.includes('?')) continue
      const trimmed = sentence.trim().slice(0, maxLen).trim()
      if (!trimmed) continue
      const key = trimmed.toLowerCase()
      seen.delete(key)
      seen.set(key, trimmed)
    }
  }

  const ordered = Array.from(seen.values())
  return ordered.length > max ? ordered.slice(-max) : ordered
}
