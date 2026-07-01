/**
 * Agreement & reproducibility statistics for the speech-biomarker bake-off.
 *
 * Phase A (2026-06-30). Pure-TS, zero-dep. These are the numbers the
 * normalization trials rest on:
 *   - ICC(2,1)  — reliability across raters (engine-vs-engine) OR reps (test-retest).
 *   - Bland–Altman — bias + limits of agreement between two engines.
 *   - within-subject CV — test-retest stability of one engine.
 *
 * See docs/plans/2026-06-30-sdne-speech-trial-capture-spec.md.
 */

export interface IccResult {
  icc: number | null // ICC(2,1), absolute agreement, single measure
  n: number          // subjects (rows)
  k: number          // raters/reps (columns)
  msr: number        // between-subject mean square
  msc: number        // between-rater mean square
  mse: number        // residual mean square
}

/**
 * ICC(2,1): two-way random-effects, absolute agreement, single measurement.
 * `matrix` is subjects (rows) × raters-or-reps (cols); every row must have the
 * same length and ≥2 cols, with ≥2 rows. Rows containing a non-finite value are
 * dropped (an engine can legitimately fail to estimate a feature).
 */
export function icc21(matrix: number[][]): IccResult {
  const rows = matrix.filter(r => r.length && r.every(v => Number.isFinite(v)))
  const n = rows.length
  const k = n ? rows[0].length : 0
  const empty: IccResult = { icc: null, n, k, msr: NaN, msc: NaN, mse: NaN }
  if (n < 2 || k < 2 || rows.some(r => r.length !== k)) return empty

  const grand = mean(rows.flat())
  const rowMeans = rows.map(r => mean(r))
  const colMeans = Array.from({ length: k }, (_, j) => mean(rows.map(r => r[j])))

  let sst = 0
  for (const r of rows) for (const v of r) sst += (v - grand) ** 2
  let ssr = 0
  for (const rm of rowMeans) ssr += (rm - grand) ** 2
  ssr *= k
  let ssc = 0
  for (const cm of colMeans) ssc += (cm - grand) ** 2
  ssc *= n
  const sse = sst - ssr - ssc

  const msr = ssr / (n - 1)
  const msc = ssc / (k - 1)
  const mse = sse / ((n - 1) * (k - 1))

  const denom = msr + (k - 1) * mse + (k / n) * (msc - mse)
  const icc = denom === 0 ? null : (msr - mse) / denom
  return { icc, n, k, msr, msc, mse }
}

export interface BlandAltman {
  n: number
  bias: number      // mean(a − b)
  sdDiff: number
  loaLower: number  // bias − 1.96·sd
  loaUpper: number  // bias + 1.96·sd
  meanAbsDiff: number
}

/** Bland–Altman agreement between two paired series (e.g. two engines). */
export function blandAltman(a: number[], b: number[]): BlandAltman | null {
  const pairs: Array<[number, number]> = []
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (Number.isFinite(a[i]) && Number.isFinite(b[i])) pairs.push([a[i], b[i]])
  }
  if (pairs.length < 2) return null
  const diffs = pairs.map(([x, y]) => x - y)
  const bias = mean(diffs)
  const sd = stddev(diffs)
  return {
    n: pairs.length,
    bias,
    sdDiff: sd,
    loaLower: bias - 1.96 * sd,
    loaUpper: bias + 1.96 * sd,
    meanAbsDiff: mean(diffs.map(Math.abs)),
  }
}

/**
 * Mean within-subject coefficient of variation across repeats. `repeats` is
 * subjects × reps of one engine's single feature. Lower = more reproducible.
 */
export function withinSubjectCv(repeats: number[][]): number | null {
  const cvs: number[] = []
  for (const reps of repeats) {
    const vals = reps.filter(Number.isFinite)
    if (vals.length < 2) continue
    const m = mean(vals)
    if (m === 0) continue
    cvs.push(stddev(vals) / Math.abs(m))
  }
  return cvs.length ? mean(cvs) : null
}

/** Qualitative reliability label for an ICC (Koo & Li 2016 convention). */
export function iccLabel(icc: number | null): 'poor' | 'moderate' | 'good' | 'excellent' | 'n/a' {
  if (icc === null || !Number.isFinite(icc)) return 'n/a'
  if (icc < 0.5) return 'poor'
  if (icc < 0.75) return 'moderate'
  if (icc < 0.9) return 'good'
  return 'excellent'
}

// ── helpers ──────────────────────────────────────────────────────────

export function mean(xs: number[]): number {
  if (!xs.length) return NaN
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return NaN
  const m = mean(xs)
  let s = 0
  for (const x of xs) s += (x - m) ** 2
  return Math.sqrt(s / (xs.length - 1))
}
