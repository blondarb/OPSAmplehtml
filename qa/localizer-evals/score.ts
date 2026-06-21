/**
 * Pure scoring functions for the localizer eval harness.
 *
 * No I/O, no Bedrock — given a Gold spec and a normalized LocalizerLike output,
 * produce a deterministic pass/fail per check. This is the testable core
 * (see score.test.ts).
 */

import type {
  DxMatcher,
  Gold,
  LocalizerLike,
  CheckResult,
  VignetteScore,
  ScoredDx,
} from './schema'

/** All dx the engine surfaced, in rank order: likelihood list first, then cant-miss. */
function allDx(resp: LocalizerLike): ScoredDx[] {
  return [...resp.differential, ...(resp.cantMiss ?? [])]
}

function matches(text: string, patterns: string[]): boolean {
  const hay = text.toLowerCase()
  return patterns.some((p) => hay.includes(p.toLowerCase()))
}

/** Is the matcher present anywhere in the surfaced differential (likelihood OR cant-miss)? */
export function dxPresent(resp: LocalizerLike, m: DxMatcher): boolean {
  return allDx(resp).some((d) => matches(d.diagnosis, m.patterns))
}

/**
 * 1-based rank of the matcher within the LIKELIHOOD-ordered differential.
 * Returns null if absent from the likelihood list. (Cant-miss presence does
 * not satisfy a ranking requirement — Adam's note was that B12 must rank high,
 * not merely appear.)
 */
export function dxRank(resp: LocalizerLike, m: DxMatcher): number | null {
  const idx = resp.differential.findIndex((d) => matches(d.diagnosis, m.patterns))
  return idx === -1 ? null : idx + 1
}

/** Does a screening term (with optional `a|b` alternates) appear in questions or rationales? */
export function screenPresent(resp: LocalizerLike, term: string): boolean {
  const alts = term.split('|').map((s) => s.trim()).filter(Boolean)
  const haystacks = [
    ...resp.followUpQuestions,
    ...allDx(resp).map((d) => d.rationale ?? ''),
  ]
  return haystacks.some((h) => matches(h, alts))
}

export function localizationMatch(resp: LocalizerLike, terms: string[]): boolean {
  return matches(resp.localizationHypothesis, terms)
}

/** Score one vignette's gold spec against one engine response. */
export function scoreVignette(id: string, gold: Gold, resp: LocalizerLike): VignetteScore {
  const checks: CheckResult[] = []

  if (gold.localization && gold.localization.length > 0) {
    const ok = localizationMatch(resp, gold.localization)
    checks.push({
      name: 'localization',
      pass: ok,
      detail: ok
        ? `matched one of [${gold.localization.join(', ')}]`
        : `expected one of [${gold.localization.join(', ')}], got "${resp.localizationHypothesis}"`,
    })
  }

  for (const m of gold.mustIncludeDx) {
    const ok = dxPresent(resp, m)
    checks.push({
      name: `include:${m.label}`,
      pass: ok,
      detail: ok ? 'present in differential' : 'MISSING from differential',
    })
  }

  for (const r of gold.mustRankTopN ?? []) {
    const rank = dxRank(resp, r.dx)
    const ok = rank !== null && rank <= r.n
    checks.push({
      name: `rank:${r.dx.label}<=${r.n}`,
      pass: ok,
      detail: rank === null ? 'not in likelihood list' : `ranked #${rank} (need ≤ ${r.n})`,
    })
  }

  for (const term of gold.mustScreen ?? []) {
    const ok = screenPresent(resp, term)
    checks.push({
      name: `screen:${term}`,
      pass: ok,
      detail: ok ? 'screening surfaced' : 'screening NOT surfaced',
    })
  }

  for (const m of gold.mustNotInclude ?? []) {
    const present = dxPresent(resp, m)
    checks.push({
      name: `exclude:${m.label}`,
      pass: !present,
      detail: present ? 'OVER-FIRED (should not be present)' : 'correctly absent',
    })
  }

  const passed = checks.filter((c) => c.pass).length
  return { id, checks, passed, total: checks.length, pass: passed === checks.length }
}
