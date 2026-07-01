/**
 * Bake-off aggregation: turns per-trial, per-engine scores into the decision
 * tables the normalization trials need.
 *
 * Phase A (2026-06-30). Three questions, one report:
 *   1. Engine agreement — do pure-TS and Praat agree on a feature? (ICC across
 *      engines + Bland–Altman for the two primary engines.)
 *   2. Test-retest reliability — is a feature reproducible across repeats?
 *      (ICC across reps + within-subject CV, per engine.)
 *   3. Separation — does the feature separate the labeled profiles (PD/ET/normal)?
 *
 * Pure function over already-scored trials, so it's unit-testable without audio.
 * The CLI (scripts/voice-bench.ts) does file loading + scoring, then calls this.
 *
 * See docs/plans/2026-06-30-sdne-speech-trial-capture-spec.md.
 */

import type { EngineResult } from './engines'
import { blandAltman, icc21, iccLabel, mean, stddev, withinSubjectCv, type BlandAltman } from './stats'
import type { VoiceTask } from './types'

export interface TrialScore {
  subjectId: string       // patient / labeled-profile id (test-retest groups by this)
  profile?: string        // 'PD' | 'ET' | 'normal' | ...
  task: VoiceTask
  rep: number             // 0-based repetition index
  engines: EngineResult[] // one entry per engine that scored this recording
}

export interface FeatureReportRow {
  task: VoiceTask
  feature: string
  // Engine agreement (across all available engines) + primary-pair Bland–Altman.
  engineAgreementIcc: number | null
  engineAgreementLabel: string
  pairwise?: { a: string; b: string; blandAltman: BlandAltman | null }
  // Per-engine test-retest reliability.
  perEngine: Array<{
    engine: string
    testRetestIcc: number | null
    testRetestLabel: string
    withinSubjectCv: number | null
    // Profile separation: mean±sd per profile group.
    separation: Record<string, { mean: number; sd: number; n: number }>
  }>
}

/** Collect every feature key any engine emitted for a task. */
function featureKeys(trials: TrialScore[], task: VoiceTask): string[] {
  const keys = new Set<string>()
  for (const t of trials) {
    if (t.task !== task) continue
    for (const e of t.engines) if (e.available) for (const k of Object.keys(e.features)) keys.add(k)
  }
  return [...keys].sort()
}

function engineIds(trials: TrialScore[]): string[] {
  const ids = new Set<string>()
  for (const t of trials) for (const e of t.engines) ids.add(e.engine)
  return [...ids]
}

function valueFor(trial: TrialScore, engine: string, feature: string): number | null {
  const e = trial.engines.find(x => x.engine === engine && x.available)
  const v = e?.features[feature]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** ICC across engines: rows = recordings, cols = engines (all must have the value). */
function engineAgreement(trials: TrialScore[], task: VoiceTask, feature: string, engines: string[]): number | null {
  const matrix: number[][] = []
  for (const t of trials) {
    if (t.task !== task) continue
    const row = engines.map(en => valueFor(t, en, feature))
    if (row.every(v => v !== null)) matrix.push(row as number[])
  }
  return matrix.length >= 2 ? icc21(matrix).icc : null
}

/** ICC across reps for one engine: rows = subjects, cols = rep index. */
function testRetest(trials: TrialScore[], task: VoiceTask, feature: string, engine: string): { icc: number | null; cv: number | null } {
  const bySubject = new Map<string, Map<number, number>>()
  for (const t of trials) {
    if (t.task !== task) continue
    const v = valueFor(t, engine, feature)
    if (v === null) continue
    if (!bySubject.has(t.subjectId)) bySubject.set(t.subjectId, new Map())
    bySubject.get(t.subjectId)!.set(t.rep, v)
  }
  // Align on the reps common to all subjects so the matrix is rectangular.
  const repSets = [...bySubject.values()].map(m => new Set(m.keys()))
  const commonReps = repSets.length
    ? [...repSets[0]].filter(r => repSets.every(s => s.has(r))).sort((a, b) => a - b)
    : []
  const matrix: number[][] = []
  for (const m of bySubject.values()) {
    if (commonReps.length >= 2) matrix.push(commonReps.map(r => m.get(r)!))
  }
  const icc = matrix.length >= 2 ? icc21(matrix).icc : null
  const cv = withinSubjectCv([...bySubject.values()].map(m => [...m.values()]))
  return { icc, cv }
}

/** Mean±sd of a feature per profile group (separation eyeball). */
function separation(trials: TrialScore[], task: VoiceTask, feature: string, engine: string): Record<string, { mean: number; sd: number; n: number }> {
  const byProfile = new Map<string, number[]>()
  for (const t of trials) {
    if (t.task !== task) continue
    const v = valueFor(t, engine, feature)
    if (v === null) continue
    const key = t.profile || 'unlabeled'
    if (!byProfile.has(key)) byProfile.set(key, [])
    byProfile.get(key)!.push(v)
  }
  const out: Record<string, { mean: number; sd: number; n: number }> = {}
  for (const [k, vals] of byProfile) out[k] = { mean: round(mean(vals)), sd: round(stddev(vals)), n: vals.length }
  return out
}

/** Build the full bake-off report across every task/feature/engine. */
export function buildBenchReport(trials: TrialScore[], primaryPair: [string, string] = ['pure-ts', 'parselmouth']): FeatureReportRow[] {
  const engines = engineIds(trials)
  const tasks = [...new Set(trials.map(t => t.task))]
  const rows: FeatureReportRow[] = []

  for (const task of tasks) {
    for (const feature of featureKeys(trials, task)) {
      const agreeIcc = engineAgreement(trials, task, feature, engines.filter(e => hasFeature(trials, task, e, feature)))
      const [pa, pb] = primaryPair
      const aVals: number[] = []
      const bVals: number[] = []
      for (const t of trials) {
        if (t.task !== task) continue
        const va = valueFor(t, pa, feature)
        const vb = valueFor(t, pb, feature)
        if (va !== null && vb !== null) { aVals.push(va); bVals.push(vb) }
      }
      rows.push({
        task,
        feature,
        engineAgreementIcc: agreeIcc,
        engineAgreementLabel: iccLabel(agreeIcc),
        pairwise: aVals.length >= 2 ? { a: pa, b: pb, blandAltman: blandAltman(aVals, bVals) } : undefined,
        perEngine: engines
          .filter(e => hasFeature(trials, task, e, feature))
          .map(engine => {
            const tr = testRetest(trials, task, feature, engine)
            return {
              engine,
              testRetestIcc: tr.icc,
              testRetestLabel: iccLabel(tr.icc),
              withinSubjectCv: tr.cv === null ? null : round(tr.cv),
              separation: separation(trials, task, feature, engine),
            }
          }),
      })
    }
  }
  return rows
}

function hasFeature(trials: TrialScore[], task: VoiceTask, engine: string, feature: string): boolean {
  return trials.some(t => t.task === task && valueFor(t, engine, feature) !== null)
}

function round(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v
}
