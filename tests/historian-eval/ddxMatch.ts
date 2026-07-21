/**
 * ═══ MATCHER SCOPE — READ BEFORE REUSING OR COMPARING NUMBERS ═══════════════
 * This is the TASK-2 INTERIM STRING HEURISTIC. It is used ONLY by this
 * Task 2 module's own live gate (tests/historian-eval/finalDifferential.gate.test.ts)
 * and this file's own unit tests (ddxMatch.test.ts) — grep confirms no
 * production code imports it. It is NOT the authoritative ground-truth
 * matcher for release-gate purposes.
 *
 * The AUTHORITATIVE matcher is src/lib/historian/eval/agreement.ts's
 * `scoreAgainstGroundTruth` (ICD-10 3-character category match as the
 * deterministic fast path, Haiku-adjudicated synonym resolution as the
 * fallback for everything else) — that is what Task 5's batch harness and
 * release gates (qa/historian-eval/release-gates.json's
 * `ddx-top3-ground-truth` gate) actually use in the artifact Steve reviews
 * for QI/IRB purposes.
 *
 * tokenSetMatch (here) and scoreAgainstGroundTruth (agreement.ts)
 * implement DIFFERENT matching policies and will legitimately produce
 * DIFFERENT, NON-COMPARABLE hit numbers on the same transcript/persona —
 * by design, not by bug. Do not treat this gate's hit-rate as confirming or
 * contradicting Task 5's report, and do not port this module's numbers
 * into a release-gate decision. See the matching cross-reference comment at
 * finalDifferential.gate.test.ts's `tokenSetMatch` import.
 * ═════════════════════════════════════════════════════════════════════════
 *
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
 * side's token set is a subset of the other's — EXCEPT when either side
 * is a single token, in which case the specificity floor below requires
 * exact equality instead.
 *
 * Negation guard: stripping "with" as a connector stopword means "X with
 * Y" tokenizes identically to "X Y", which is then a trivial SUBSET of
 * "X without Y" (since "without" is a real, non-stripped token) — without
 * a guard, a plain subset check would call two clinically OPPOSITE
 * diagnoses ("migraine with aura" vs "migraine without aura") a match.
 * Negation words are therefore never stopwords, and a negation-word
 * asymmetry between the two sides (one has one, the other doesn't) is
 * treated as a hard non-match before the subset check ever runs.
 *
 * Specificity floor (single-token sides require exact equality, not
 * subset): a single-token ground-truth entry (e.g. "TIA", "CIDP" — the
 * gate's own fixtures carry both, each "low" likelihood) is a trivial
 * SUBSET of almost anything containing that token — "TIA" would
 * "match" a completely unrelated candidate like "hemispheric TIA with
 * migraine features" purely because the word appears somewhere in a much
 * larger, differently-focused diagnosis. Multi-token sides keep the
 * subset rule (that's the whole point of tolerating word-order/hyphen
 * differences); only a single-token side is required to match its
 * counterpart exactly. Accepted trade-off: a single-token ground truth
 * like "migraine" will no longer subset-match a multi-token candidate
 * like "chronic migraine with aura" — deliberately stricter, since the
 * alternative (any single distinctive word triggering a match against
 * anything containing it) is the more dangerous failure mode for a
 * script measuring diagnostic accuracy. In the actual gate, this floor is
 * currently inert in practice — every persona's "high"-likelihood
 * candidates (the only ones `highLikelihoodOrAll()` in
 * finalDifferential.gate.test.ts feeds to the matcher) are multi-token —
 * but `expectedDDxStrings` (personaTranscripts.ts) is a general-purpose
 * export future callers (Tasks 4/5) could use without that filter, so the
 * floor needs to hold on its own, not rely on today's fixture shape.
 * This module remains interim — Task 4's ICD-10-category + adjudicated
 * matching supersedes it.
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

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && isSubset(a, b)
}

function hasNegation(tokens: Set<string>): boolean {
  for (const t of tokens) {
    if (NEGATION_WORDS.has(t)) return true
  }
  return false
}

/**
 * True if `a` and `b` describe the same diagnosis under normalized
 * token-set matching (see module doc for the algorithm, negation guard,
 * and single-token specificity floor). Order of arguments doesn't matter
 * — the match is symmetric.
 */
export function tokenSetMatch(a: string, b: string): boolean {
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (ta.size === 0 || tb.size === 0) return false
  if (hasNegation(ta) !== hasNegation(tb)) return false

  // Specificity floor — see module doc. A single-token side must match
  // exactly; only multi-token-vs-multi-token gets subset tolerance.
  if (ta.size === 1 || tb.size === 1) return setsEqual(ta, tb)

  return isSubset(ta, tb) || isSubset(tb, ta)
}
