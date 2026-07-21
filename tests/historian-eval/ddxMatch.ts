/**
 * Deterministic normalized token-set matcher for grading the final
 * differential live gate (finalDifferential.gate.test.ts) against a
 * persona fixture's ground-truth expectedDDx.
 *
 * Interim, no-LLM matching for Task 2 — Task 4's ICD-10/adjudicated
 * matching (normalizeIcd10 + a real scorer) supersedes this once it
 * exists. Replaces contiguous-substring matching, which false-negatived
 * on hyphen-vs-space ("New-Onset" vs "new onset") and word-order
 * ("New-Onset Epilepsy" vs "Epilepsy (new onset)") differences between
 * clinically identical phrasings.
 *
 * Algorithm: normalize both strings (casefold, strip non-alphanumerics to
 * whitespace — NOT delete, which is what broke "New-Onset" — collapse
 * whitespace, drop trivial connector stopwords), then match if either
 * side's token set is a subset of the other's.
 *
 * Negation guard: stripping "with" as a connector stopword means "X with
 * Y" tokenizes identically to "X Y", which is then a trivial SUBSET of
 * "X without Y" (since "without" is a real, non-stripped token) — without
 * a guard, a plain subset check would call two clinically OPPOSITE
 * diagnoses ("migraine with aura" vs "migraine without aura") a match.
 * Negation words are therefore never stopwords, and a negation-word
 * asymmetry between the two sides (one has one, the other doesn't) is
 * treated as a hard non-match before the subset check ever runs.
 */

const STOPWORDS = new Set(['with', 'of', 'the', 'a', 'an', 'and'])

// Never stopwords — negation changes clinical meaning, unlike "with"/"of".
const NEGATION_WORDS = new Set(['without', 'no', 'non', 'absent', 'negative'])

function tokenize(s: string): Set<string> {
  const normalized = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // strip non-alphanumerics TO SPACE, not delete — preserves word boundaries across hyphens/punctuation
    .trim()
  if (!normalized) return new Set()

  const tokens = normalized.split(/\s+/).filter((t) => t.length > 0 && !STOPWORDS.has(t))
  return new Set(tokens)
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  for (const t of a) {
    if (!b.has(t)) return false
  }
  return true
}

function hasNegation(tokens: Set<string>): boolean {
  for (const t of tokens) {
    if (NEGATION_WORDS.has(t)) return true
  }
  return false
}

/**
 * True if `a` and `b` describe the same diagnosis under normalized
 * token-set matching (see module doc for the algorithm + negation guard).
 * Order of arguments doesn't matter — the match is symmetric.
 */
export function tokenSetMatch(a: string, b: string): boolean {
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (ta.size === 0 || tb.size === 0) return false
  if (hasNegation(ta) !== hasNegation(tb)) return false
  return isSubset(ta, tb) || isSubset(tb, ta)
}
