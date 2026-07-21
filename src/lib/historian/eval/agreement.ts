/**
 * Cross-model agreement metrics (Historian Validation Suite Task 4).
 *
 * Pure, deterministic-first comparison logic between two independently
 * generated DifferentialItem[] lists — Task 2's Sonnet-family
 * `final_differential` and Task 4's DeepSeek-R1 `independentDdx.ts` output
 * — plus scoring either differential against a persona fixture's
 * ground-truth diagnosis list. This module has NO Bedrock/DB imports: the
 * adjudicator is always an INJECTED async function (`adjudicate?`), never
 * called directly here. Unit tests inject fakes (see agreement.test.ts);
 * production wiring (the real Haiku-backed `adjudicateEquivalence`) lives in
 * independentDdx.ts, which imports FROM this module, never the reverse.
 *
 * Matching policy (binding, per the Task 4 brief):
 *   - ICD-10 3-character CATEGORY match is the deterministic fast path
 *     (normalizeIcd10('G43.909') -> 'G43'; normalizeIcd10('G43.1') -> 'G43'
 *     -> same category -> match). An exact-code match is automatically a
 *     category match too, since both reduce to the same normalized form —
 *     no separate exact-match branch is needed.
 *   - Two valid-but-DIFFERENT categories are a confident, deterministic
 *     NON-match — never sent to the adjudicator (asking an LLM to overrule
 *     two positively-different ICD codes would be a false-positive risk,
 *     not a synonym-resolution problem).
 *   - The adjudicator is used ONLY for a pair where at least one side lacks
 *     a valid normalized ICD10 category (null or malformed) — the case
 *     where two diagnosis strings might be clinical synonyms ("TIA" vs
 *     "transient ischemic attack") that deterministic matching can't
 *     resolve on its own.
 *   - Every pair needing adjudication within one computeAgreement /
 *     scoreAgainstGroundTruth call is batched into exactly ONE adjudicate()
 *     call (never one call per pair) — this is what makes the Haiku
 *     production wiring cheap regardless of how many top-3 x top-3 (or
 *     top-3 x expected) comparisons are in play.
 *   - When `adjudicate` is omitted, any pair that would have needed it is
 *     treated as a NON-match (conservative default — never throws, never
 *     fabricates agreement).
 *
 * top1Match is intentionally rank-1-vs-rank-1 ONLY (does a's #1 pick match
 * b's #1 pick specifically) — independent of whatever else overlaps deeper
 * in the top-3 lists. See agreement.test.ts's "top1Match is false when the
 * #1 items do not match each other, even if #1 matches something else..."
 * for the concrete case this guards.
 *
 * Ground-truth scoring (scoreAgainstGroundTruth) compares against a persona
 * fixture's `expectedDDx` diagnosis STRINGS (no ICD10 code available on
 * that side at all — persona fixtures are hand-authored clinical text, not
 * coded data), so it cannot use the ICD10 fast path. It instead uses a
 * cheap case-insensitive exact-string match as its deterministic fast path,
 * falling back to the adjudicator for everything else. The "which
 * expectedDDx entries count as ground truth" policy (HIGH-likelihood
 * entries, falling back to ALL entries if none are marked "high") is
 * decided by the CALLER (mirrors finalDifferential.gate.test.ts's
 * `highLikelihoodOrAll()`) — this function just takes the already-filtered
 * list of candidate diagnosis strings.
 */

import type { DifferentialItem } from './finalDifferential'

// ── normalizeIcd10 ───────────────────────────────────────────────────────

/**
 * Reduce an ICD-10-CM code to its 3-character category (e.g. 'G43.909' ->
 * 'G43'). Returns null for null/empty/whitespace-only/malformed input —
 * never throws. A category is exactly one letter followed by two digits
 * (the universal ICD-10-CM category shape, e.g. G43, I63, E11); rare
 * letter-digit-letter supplementary chapters (e.g. 'O9A') are treated as
 * malformed here rather than special-cased, since none of this sprint's
 * neurology personas use them — a known, documented simplification, not a
 * silent gap.
 */
export function normalizeIcd10(code: string | null): string | null {
  if (typeof code !== 'string') return null
  const trimmed = code.trim().toUpperCase()
  if (!trimmed) return null
  const category = trimmed.split('.')[0]
  if (!/^[A-Z]\d{2}$/.test(category)) return null
  return category
}

// ── Shared types ─────────────────────────────────────────────────────────

/** Batches every pair needing a judgment call into ONE invocation. */
export type Adjudicator = (pairs: [string, string][]) => Promise<boolean[]>

export interface AgreementResult {
  /** Does a[0] (pipeline's #1 pick) match b[0] (independent's #1 pick), specifically? */
  top1Match: boolean
  /** Count of distinct matched pairs between a's top-3 and b's top-3 (0-3). */
  top3Overlap: number
  /** Jaccard similarity of a's top-3 and b's top-3, treated as sets (0-1). */
  jaccardTop3: number
  matchedPairs: { a: string; b: string; via: 'icd10' | 'adjudicated' }[]
  /** Human-readable "only in a" / "only in b" entries for the unmatched remainder of each top-3. */
  disagreements: string[]
}

const TOP_N = 3

// Above this size on either side, exact matching falls back to greedy
// (factorial blow-up guard) — never hit today, since every current caller
// pre-slices to TOP_N=3, but kept as an explicit, documented safety net
// rather than an unstated assumption.
const MAX_EXACT_MATCH_SIZE = 8

/**
 * Greedy one-to-one assignment (row-major, first-available-column) — the
 * MAX_EXACT_MATCH_SIZE fallback only. Can under-count vs the true maximum
 * matching; see maxBipartiteMatching's doc comment for the failure case.
 */
function greedyBipartiteMatching(truth: boolean[][], rows: number, cols: number): [number, number][] {
  const consumedCols = new Set<number>()
  const pairs: [number, number][] = []
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (consumedCols.has(j)) continue
      if (truth[i][j]) {
        pairs.push([i, j])
        consumedCols.add(j)
        break
      }
    }
  }
  return pairs
}

/**
 * Maximum bipartite matching by pair COUNT — exact, via brute-force search
 * over the padded permutation space (rows/cols are both trivially small
 * here, capped at TOP_N=3 by every current caller; MAX_EXACT_MATCH_SIZE
 * guards against this ever being called with a larger input).
 *
 * Greedy row-major assignment (the prior implementation) can UNDER-COUNT
 * when one candidate matches multiple items but another candidate matches
 * only one of them: e.g. truth = [[true,true],[true,false]] — row 0
 * matches BOTH columns, row 1 matches ONLY column 0. Greedy processes row 0
 * first, takes the first available column (0), and consumes it — leaving
 * row 1 with no available column even though row 1's ONLY possible match
 * was column 0. The true maximum matching is 2 (row 0 -> column 1, row 1
 * -> column 0), not greedy's 1. This function always finds the true
 * maximum by exhaustively scoring every possible one-to-one assignment
 * (via a permutation of the padded index space) and keeping the
 * highest-scoring one — a tie among multiple maximum matchings is broken
 * by whichever permutation the search visits first (deterministic given a
 * fixed input, but not intended to encode any particular preference among
 * equally-sized maximum matchings).
 */
function maxBipartiteMatching(truth: boolean[][], rows: number, cols: number): [number, number][] {
  if (rows > MAX_EXACT_MATCH_SIZE || cols > MAX_EXACT_MATCH_SIZE) {
    return greedyBipartiteMatching(truth, rows, cols)
  }
  if (rows === 0 || cols === 0) return []

  // Pad the index space to a square of size n = max(rows, cols) so every
  // permutation is a full bijection; positions that fall outside the real
  // rows/cols (padding artifacts) simply never score.
  const n = Math.max(rows, cols)
  const indices = Array.from({ length: n }, (_, i) => i)
  let bestAssignment: number[] = indices.slice()
  let bestScore = -1

  function scoreOf(assignment: number[]): number {
    let score = 0
    for (let i = 0; i < rows; i++) {
      if (assignment[i] < cols && truth[i][assignment[i]]) score++
    }
    return score
  }

  function permute(arr: number[], k: number): void {
    if (k === arr.length) {
      const score = scoreOf(arr)
      if (score > bestScore) {
        bestScore = score
        bestAssignment = arr.slice()
      }
      return
    }
    for (let i = k; i < arr.length; i++) {
      ;[arr[k], arr[i]] = [arr[i], arr[k]]
      permute(arr, k + 1)
      ;[arr[k], arr[i]] = [arr[i], arr[k]]
    }
  }
  permute(indices, 0)

  const pairs: [number, number][] = []
  for (let i = 0; i < rows; i++) {
    if (bestAssignment[i] < cols && truth[i][bestAssignment[i]]) {
      pairs.push([i, bestAssignment[i]])
    }
  }
  return pairs
}

async function batchAdjudicate(
  pairs: [string, string][],
  adjudicate: Adjudicator | undefined,
): Promise<boolean[]> {
  if (pairs.length === 0) return []
  if (!adjudicate) return pairs.map(() => false)
  const results = await adjudicate(pairs)
  // Defensive: never trust the injected function's array to be the right
  // length/type — pad/normalize to booleans so a misbehaving adjudicator
  // (production: a malformed Haiku tool response) can never desync from
  // the pairs it was asked about or crash the caller.
  return pairs.map((_, i) => results[i] === true)
}

// ── computeAgreement ─────────────────────────────────────────────────────

/**
 * Compare two independently generated differentials' top-3 diagnoses.
 * Deterministic-first (ICD10 category match); the adjudicator resolves
 * only pairs where at least one side lacks a usable ICD10 code. Never
 * throws — a missing/misbehaving adjudicator degrades to "no match" for
 * the pairs it would have covered, not a crash.
 */
export async function computeAgreement(
  a: DifferentialItem[],
  b: DifferentialItem[],
  adjudicate?: Adjudicator,
): Promise<AgreementResult> {
  const topA = a.slice(0, TOP_N)
  const topB = b.slice(0, TOP_N)

  // truth[i][j] = are topA[i] and topB[j] the same diagnosis?
  const truth: boolean[][] = topA.map(() => topB.map(() => false))
  const via: ('icd10' | 'adjudicated')[][] = topA.map(() => topB.map(() => 'icd10'))

  const adjudicationPairs: [string, string][] = []
  const adjudicationCells: [number, number][] = []

  for (let i = 0; i < topA.length; i++) {
    const catA = normalizeIcd10(topA[i].icd10)
    for (let j = 0; j < topB.length; j++) {
      const catB = normalizeIcd10(topB[j].icd10)
      if (catA !== null && catB !== null) {
        // Both sides have a usable ICD10 category — deterministic, final.
        truth[i][j] = catA === catB
        via[i][j] = 'icd10'
      } else {
        // At least one side lacks a usable code — defer to adjudication.
        adjudicationPairs.push([topA[i].diagnosis, topB[j].diagnosis])
        adjudicationCells.push([i, j])
        via[i][j] = 'adjudicated'
      }
    }
  }

  const adjudicated = await batchAdjudicate(adjudicationPairs, adjudicate)
  adjudicationCells.forEach(([i, j], k) => {
    truth[i][j] = adjudicated[k]
  })

  // top1Match: strictly rank-1-vs-rank-1, read directly off the truth table
  // — independent of whatever greedy assignment happens below.
  const top1Match = topA.length > 0 && topB.length > 0 ? truth[0][0] : false

  // Exact maximum one-to-one assignment (see maxBipartiteMatching's doc
  // comment for why greedy can under-count) — used for the clean, deduped
  // matchedPairs listing and the overlap/Jaccard counts. top1Match above
  // never depends on this assignment's outcome.
  const bestPairs = maxBipartiteMatching(truth, topA.length, topB.length)
  const consumedA = new Set<number>(bestPairs.map(([i]) => i))
  const consumedB = new Set<number>(bestPairs.map(([, j]) => j))
  const matchedPairs: AgreementResult['matchedPairs'] = bestPairs.map(([i, j]) => ({
    a: topA[i].diagnosis,
    b: topB[j].diagnosis,
    via: via[i][j],
  }))

  const top3Overlap = matchedPairs.length
  const unionSize = topA.length + topB.length - top3Overlap
  const jaccardTop3 = unionSize > 0 ? top3Overlap / unionSize : 0

  const disagreements: string[] = [
    ...topA.filter((_, i) => !consumedA.has(i)).map((d) => `Only in pipeline differential: ${d.diagnosis}`),
    ...topB.filter((_, j) => !consumedB.has(j)).map((d) => `Only in independent differential: ${d.diagnosis}`),
  ]

  return { top1Match, top3Overlap, jaccardTop3, matchedPairs, disagreements }
}

// ── scoreAgainstGroundTruth ──────────────────────────────────────────────

/**
 * Score one differential's top-1/top-3 against a persona's ground-truth
 * diagnosis strings (already filtered by the caller's likelihood policy —
 * see module doc). Deterministic-first (case-insensitive exact string
 * match); the adjudicator resolves everything else. Never throws.
 */
export async function scoreAgainstGroundTruth(
  ddx: DifferentialItem[],
  expected: string[],
  adjudicate?: Adjudicator,
): Promise<{ top1Hit: boolean; top3Hit: boolean }> {
  const top = ddx.slice(0, TOP_N)
  if (top.length === 0 || expected.length === 0) {
    return { top1Hit: false, top3Hit: false }
  }

  const norm = (s: string) => s.trim().toLowerCase()

  // hit[i] = does top[i] match ANY expected entry?
  const hit: boolean[] = top.map(() => false)

  const adjudicationPairs: [string, string][] = []
  const adjudicationCells: number[] = []

  for (let i = 0; i < top.length; i++) {
    const candidate = norm(top[i].diagnosis)
    let exact = false
    for (const e of expected) {
      if (norm(e) === candidate) {
        exact = true
        break
      }
    }
    if (exact) {
      hit[i] = true
      continue
    }
    for (const e of expected) {
      adjudicationPairs.push([top[i].diagnosis, e])
      adjudicationCells.push(i)
    }
  }

  const adjudicated = await batchAdjudicate(adjudicationPairs, adjudicate)
  adjudicationCells.forEach((i, k) => {
    if (adjudicated[k]) hit[i] = true
  })

  return {
    top1Hit: hit[0] === true,
    top3Hit: hit.some((h) => h === true),
  }
}
