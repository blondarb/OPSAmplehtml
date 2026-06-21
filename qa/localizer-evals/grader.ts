/**
 * Independent grader (LLM-as-judge) for the localizer eval harness.
 *
 * The deterministic scorer (score.ts) checks hard gold criteria. This grader
 * adds the holistic clinical opinion a rubric can't capture, and — crucially —
 * a PAIRWISE mode: given two differentials for the same case, an independent
 * model says which is *better* and why. That's what powers A/B comparison
 * (current engine vs. hardened; KB-RAG vs. frontier).
 *
 * Design: prompt-building + parsing are PURE and unit-tested (grader.test.ts).
 * The model call is injected as a `JudgeFn`, so this file needs no Bedrock and
 * the judge model stays swappable (use one INDEPENDENT of the generator).
 *
 * See docs/plans/2026-06-13-localizer-differential-hardening-spec.md §4.
 */

import type { LocalizerLike, Vignette } from './schema'

/** Injected model call: takes a system + user prompt, returns raw model text. */
export type JudgeFn = (system: string, user: string) => Promise<string>

export interface QualityVerdict {
  /** Overall clinical quality of the differential, 1 (poor) – 5 (excellent). */
  overall: number
  criteria: {
    diagnostic_accuracy: number
    cant_miss_completeness: number
    ranking_appropriateness: number
    localization_quality: number
    safety: number
  }
  /** Diagnoses the judge thinks were wrongly omitted or under-ranked. */
  missed_diagnoses: string[]
  rationale: string
}

export interface PairwiseVerdict {
  winner: 'A' | 'B' | 'tie'
  rationale: string
  criteria_winners: Record<string, 'A' | 'B' | 'tie'>
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderVignette(v: Vignette): string {
  const turns = v.input.transcript.map((t) => `${t.role === 'user' ? 'Patient' : 'Interviewer'}: ${t.text}`).join('\n')
  const lines = [
    v.input.chiefComplaint ? `Chief complaint: ${v.input.chiefComplaint}` : '',
    v.input.exam ? `Exam findings: ${v.input.exam}` : '',
    'Transcript:',
    turns,
  ]
  return lines.filter(Boolean).join('\n')
}

export function renderOutput(o: LocalizerLike): string {
  const diff = o.differential.length
    ? o.differential.map((d, i) => `${i + 1}. ${d.diagnosis}${d.likelihood ? ` [${d.likelihood}]` : ''}${d.rationale ? ` — ${d.rationale}` : ''}`).join('\n')
    : '(none)'
  const cantMiss = o.cantMiss && o.cantMiss.length
    ? `\nCan't-miss / reversible:\n${o.cantMiss.map((d) => `- ${d.diagnosis}${d.rationale ? ` — ${d.rationale}` : ''}`).join('\n')}`
    : ''
  const questions = o.followUpQuestions.length ? o.followUpQuestions.map((q) => `- ${q}`).join('\n') : '(none)'
  return `Differential (ranked most→least likely):\n${diff}${cantMiss}\nLocalization: ${o.localizationHypothesis || '(none)'}\nFollow-up questions:\n${questions}`
}

// ── Prompt builders (pure) ────────────────────────────────────────────────────

const RUBRIC = [
  'diagnostic_accuracy — are the right diagnoses present and well-reasoned?',
  'cant_miss_completeness — are treatable/reversible/dangerous causes appropriate to THIS presentation included (e.g. B12, thyroid, NPH, Wernicke)?',
  'ranking_appropriateness — is the ordering clinically sensible (likely things high, without burying a high-likelihood diagnosis)?',
  'localization_quality — is the neuroanatomical localization correct and specific?',
  'safety — would acting on this differential risk a harmful miss, or conversely over-test with inappropriate zebra workups?',
].join('\n  - ')

export function buildQualityPrompt(v: Vignette, output: LocalizerLike): { system: string; user: string } {
  const system = [
    'You are an independent board-certified neurologist grading the quality of a differential diagnosis produced by an AI tool.',
    'You did NOT produce this output and have no stake in it. Judge only on clinical merit for the scenario given.',
    'Score each criterion 1 (poor) to 5 (excellent):',
    `  - ${RUBRIC}`,
    'Return ONLY JSON: {"overall":1-5,"criteria":{"diagnostic_accuracy":1-5,"cant_miss_completeness":1-5,"ranking_appropriateness":1-5,"localization_quality":1-5,"safety":1-5},"missed_diagnoses":["..."],"rationale":"..."}',
  ].join('\n')
  const user = `CLINICAL SCENARIO:\n${renderVignette(v)}\n\nAI DIFFERENTIAL TO GRADE:\n${renderOutput(output)}`
  return { system, user }
}

export function buildPairwisePrompt(v: Vignette, a: LocalizerLike, b: LocalizerLike): { system: string; user: string } {
  const system = [
    'You are an independent board-certified neurologist comparing TWO AI-produced differentials for the same patient.',
    'You did not produce either and do not know which tool made which. Judge purely on clinical merit.',
    'Do not favor an answer for being longer or listing more diagnoses. Reward correct, well-ranked, safe, can\'t-miss-complete reasoning.',
    'Decide which is better overall and per criterion:',
    `  - ${RUBRIC}`,
    'Return ONLY JSON: {"winner":"A|B|tie","rationale":"...","criteria_winners":{"diagnostic_accuracy":"A|B|tie","cant_miss_completeness":"A|B|tie","ranking_appropriateness":"A|B|tie","localization_quality":"A|B|tie","safety":"A|B|tie"}}',
  ].join('\n')
  const user = `CLINICAL SCENARIO:\n${renderVignette(v)}\n\n=== OPTION A ===\n${renderOutput(a)}\n\n=== OPTION B ===\n${renderOutput(b)}`
  return { system, user }
}

// ── Parsing (pure, fence-tolerant) ────────────────────────────────────────────

function stripFences(raw: string): string {
  let s = raw.trim()
  if (s.startsWith('```json')) s = s.slice(7)
  else if (s.startsWith('```')) s = s.slice(3)
  if (s.endsWith('```')) s = s.slice(0, -3)
  return s.trim()
}

export function parseQualityVerdict(raw: string): QualityVerdict {
  const p = JSON.parse(stripFences(raw))
  if (typeof p.overall !== 'number' || typeof p.criteria !== 'object' || p.criteria === null) {
    throw new Error('quality verdict missing overall/criteria')
  }
  return {
    overall: p.overall,
    criteria: p.criteria,
    missed_diagnoses: Array.isArray(p.missed_diagnoses) ? p.missed_diagnoses : [],
    rationale: typeof p.rationale === 'string' ? p.rationale : '',
  }
}

export function parsePairwiseVerdict(raw: string): PairwiseVerdict {
  const p = JSON.parse(stripFences(raw))
  if (!['A', 'B', 'tie'].includes(p.winner)) throw new Error(`invalid winner: ${p.winner}`)
  return {
    winner: p.winner,
    rationale: typeof p.rationale === 'string' ? p.rationale : '',
    criteria_winners: p.criteria_winners ?? {},
  }
}

// ── Thin grade functions (inject the judge) ───────────────────────────────────

export async function gradeQuality(v: Vignette, output: LocalizerLike, judge: JudgeFn): Promise<QualityVerdict> {
  const { system, user } = buildQualityPrompt(v, output)
  return parseQualityVerdict(await judge(system, user))
}

export async function gradePairwise(v: Vignette, a: LocalizerLike, b: LocalizerLike, judge: JudgeFn): Promise<PairwiseVerdict> {
  const { system, user } = buildPairwisePrompt(v, a, b)
  return parsePairwiseVerdict(await judge(system, user))
}

/**
 * Position-debiased pairwise: judge twice with A/B swapped. If the verdict
 * flips with position, the judge is not discriminating → return 'tie'.
 * This is the cheap guard against position bias in LLM-as-judge.
 */
export async function gradePairwiseDebiased(v: Vignette, a: LocalizerLike, b: LocalizerLike, judge: JudgeFn): Promise<PairwiseVerdict> {
  const first = await gradePairwise(v, a, b, judge)
  const second = await gradePairwise(v, b, a, judge) // A/B swapped
  // In `second`, "A" refers to original b. Translate back to original A/B frame.
  const secondInOriginalFrame: PairwiseVerdict['winner'] =
    second.winner === 'A' ? 'B' : second.winner === 'B' ? 'A' : 'tie'
  if (first.winner === secondInOriginalFrame) return first
  return {
    winner: 'tie',
    rationale: `Position-dependent verdict (order 1: ${first.winner}, order 2→original: ${secondInOriginalFrame}) — treated as tie. ` + first.rationale,
    criteria_winners: first.criteria_winners,
  }
}
