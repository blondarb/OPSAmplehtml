import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { TriageTier } from '@/lib/triage/types'
import { from } from '@/lib/db-query'

// Ordered tiers for weighted calculations (0 = least urgent, 6 = most urgent)
const TIER_ORDER: TriageTier[] = [
  'non_urgent',        // 0
  'routine',           // 1
  'routine_priority',  // 2
  'semi_urgent',       // 3
  'urgent',            // 4
  'emergent',          // 5
  'insufficient_data', // 6 (separate category)
]

function tierToOrdinal(tier: TriageTier): number {
  const idx = TIER_ORDER.indexOf(tier)
  return idx >= 0 ? idx : -1
}

// ── Fleiss' Kappa for multiple raters ──
function fleissKappa(matrix: number[][]): number {
  // matrix[i][j] = number of raters who assigned category j to subject i
  const N = matrix.length // number of subjects
  if (N === 0) return 0

  const n = matrix[0].reduce((a, b) => a + b, 0) // number of raters per subject
  if (n <= 1) return 0

  const k = matrix[0].length // number of categories

  // Pi for each subject (proportion of agreeing pairs)
  const Pi = matrix.map(row => {
    const sum = row.reduce((a, b) => a + b * b, 0)
    return (sum - n) / (n * (n - 1))
  })

  // Pbar = mean of Pi
  const Pbar = Pi.reduce((a, b) => a + b, 0) / N

  // pj = proportion of all ratings in category j
  const totalRatings = N * n
  const pj = Array.from({ length: k }, (_, j) =>
    matrix.reduce((sum, row) => sum + row[j], 0) / totalRatings
  )

  // Pe = sum of pj^2
  const Pe = pj.reduce((a, b) => a + b * b, 0)

  if (Pe >= 1) return 1 // perfect agreement by chance
  return (Pbar - Pe) / (1 - Pe)
}

// ── Weighted Kappa (linear weights) for two raters ──
function weightedKappa(ratings1: number[], ratings2: number[], numCategories: number): number {
  const n = ratings1.length
  if (n === 0) return 0

  // Build observed agreement matrix
  const observed = Array.from({ length: numCategories }, () =>
    Array(numCategories).fill(0) as number[]
  )
  for (let i = 0; i < n; i++) {
    const a = ratings1[i], b = ratings2[i]
    if (a >= 0 && a < numCategories && b >= 0 && b < numCategories) {
      observed[a][b]++
    }
  }

  // Marginals
  const rowSum = observed.map(row => row.reduce((a, b) => a + b, 0))
  const colSum = Array.from({ length: numCategories }, (_, j) =>
    observed.reduce((sum, row) => sum + row[j], 0)
  )

  // Linear weight matrix: w[i][j] = 1 - |i-j| / (k-1)
  const maxDist = numCategories - 1 || 1
  const weight = Array.from({ length: numCategories }, (_, i) =>
    Array.from({ length: numCategories }, (_, j) => 1 - Math.abs(i - j) / maxDist)
  )

  // Observed weighted agreement
  let po = 0
  for (let i = 0; i < numCategories; i++) {
    for (let j = 0; j < numCategories; j++) {
      po += weight[i][j] * observed[i][j] / n
    }
  }

  // Expected weighted agreement
  let pe = 0
  for (let i = 0; i < numCategories; i++) {
    for (let j = 0; j < numCategories; j++) {
      pe += weight[i][j] * (rowSum[i] / n) * (colSum[j] / n)
    }
  }

  if (pe >= 1) return 1
  return (po - pe) / (1 - pe)
}

// ── Krippendorff's Alpha (ordinal) ──
function krippendorffAlpha(data: (number | null)[][]): number {
  // data[rater][subject] = ordinal value or null (missing)
  const nSubjects = data[0]?.length || 0
  if (nSubjects === 0) return 0

  // Collect all non-null values per subject
  const subjectValues: number[][] = []
  for (let s = 0; s < nSubjects; s++) {
    const vals: number[] = []
    for (const rater of data) {
      if (rater[s] !== null && rater[s] !== undefined) {
        vals.push(rater[s]!)
      }
    }
    subjectValues.push(vals)
  }

  // Total number of pairable values
  const totalPairs = subjectValues.reduce((sum, vals) => sum + vals.length * (vals.length - 1), 0)
  if (totalPairs === 0) return 0

  // Observed disagreement
  let Do = 0
  for (const vals of subjectValues) {
    const m = vals.length
    if (m < 2) continue
    for (let i = 0; i < m; i++) {
      for (let j = i + 1; j < m; j++) {
        Do += (vals[i] - vals[j]) ** 2
      }
    }
  }
  Do = (2 * Do) / totalPairs

  // Expected disagreement
  const allValues: number[] = subjectValues.flat()
  const n = allValues.length
  let De = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      De += (allValues[i] - allValues[j]) ** 2
    }
  }
  De = (2 * De) / (n * (n - 1))

  if (De === 0) return 1
  return 1 - Do / De
}

function interpretKappa(k: number): string {
  if (k < 0) return 'Less than chance agreement'
  if (k < 0.21) return 'Slight agreement'
  if (k < 0.41) return 'Fair agreement'
  if (k < 0.61) return 'Moderate agreement'
  if (k < 0.81) return 'Substantial agreement'
  return 'Almost perfect agreement'
}

// Majority vote for consensus tier
function consensusTier(tiers: TriageTier[]): TriageTier | null {
  if (tiers.length === 0) return null
  const counts = new Map<TriageTier, number>()
  for (const t of tiers) {
    counts.set(t, (counts.get(t) || 0) + 1)
  }
  let maxCount = 0
  let winner: TriageTier | null = null
  for (const [tier, count] of counts) {
    if (count > maxCount) {
      maxCount = count
      winner = tier
    }
  }
  return winner
}

// GET /api/triage/validate/results
export async function GET(req: NextRequest) {

  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const studyName = req.nextUrl.searchParams.get('study') || 'default'

  // Fetch all non-calibration active cases
  const { data: cases, error: casesError } = await from('validation_cases')
    .select('*')
    .eq('study_name', studyName)
    .eq('active', true)
    .eq('is_calibration', false)
    .order('case_number', { ascending: true })

  if (casesError) {
    return NextResponse.json({ error: casesError.message }, { status: 500 })
  }

  if (!cases || cases.length === 0) {
    return NextResponse.json({ error: 'No validation cases found' }, { status: 404 })
  }

  const caseIds = cases.map((c: any) => c.id)

  // Fetch all reviews
  const { data: reviews, error: reviewsError } = await from('validation_reviews')
    .select('*')
    .in('case_id', caseIds)

  if (reviewsError) {
    return NextResponse.json({ error: reviewsError.message }, { status: 500 })
  }

  if (!reviews || reviews.length === 0) {
    return NextResponse.json({ error: 'No reviews submitted yet' }, { status: 404 })
  }

  // Fetch reviewer profiles
  const reviewerIds = [...new Set<string>(reviews.map((r: any) => r.reviewer_id))]
  const { data: profiles } = await from('user_profiles')
    .select('id, display_name')
    .in('id', reviewerIds)

  const profileMap = new Map<string, string>((profiles || []).map((p: any) => [p.id, p.display_name || 'Reviewer']))

  // Build a consistent name map for all reviewers (avoids mismatched fallbacks)
  const nameMap = new Map<string, string>()
  let unnamedIdx = 1
  for (const rid of reviewerIds) {
    const profileName = profileMap.get(rid)
    if (profileName) {
      nameMap.set(rid, profileName)
    } else {
      nameMap.set(rid, reviewerIds.length === 1 ? 'Reviewer' : `Reviewer ${unnamedIdx++}`)
    }
  }

  // Group reviews by case_id
  const reviewsByCase = new Map<string, typeof reviews>()
  for (const r of reviews) {
    const list = reviewsByCase.get(r.case_id) || []
    list.push(r)
    reviewsByCase.set(r.case_id, list)
  }

  // Group reviews by reviewer
  const reviewsByReviewer = new Map<string, typeof reviews>()
  for (const r of reviews) {
    const list = reviewsByReviewer.get(r.reviewer_id) || []
    list.push(r)
    reviewsByReviewer.set(r.reviewer_id, list)
  }

  // ── Build Fleiss' Kappa matrix ──
  const numCategories = TIER_ORDER.length
  // Only include cases where at least 2 reviewers have responded
  const eligibleCases = cases.filter((c: any) => {
    const caseReviews = reviewsByCase.get(c.id) || []
    return caseReviews.length >= 2
  })

  const fleissMatrix: number[][] = eligibleCases.map((c: any) => {
    const caseReviews = reviewsByCase.get(c.id) || []
    const row = Array(numCategories).fill(0) as number[]
    for (const r of caseReviews) {
      const idx = TIER_ORDER.indexOf(r.triage_tier as TriageTier)
      if (idx >= 0) row[idx]++
    }
    return row
  })

  const fk = fleissMatrix.length >= 2 ? fleissKappa(fleissMatrix) : 0

  // ── Krippendorff's Alpha ──
  const raterData: (number | null)[][] = reviewerIds.map(rid => {
    return eligibleCases.map((c: any) => {
      const caseReviews = reviewsByCase.get(c.id) || []
      const review = caseReviews.find((r: any) => r.reviewer_id === rid)
      if (!review) return null
      return tierToOrdinal(review.triage_tier as TriageTier)
    })
  })

  const ka = krippendorffAlpha(raterData)

  // ── Overall agreement rate ──
  let totalAgreements = 0
  let totalComparisons = 0
  for (const c of eligibleCases) {
    const caseReviews = reviewsByCase.get(c.id) || []
    for (let i = 0; i < caseReviews.length; i++) {
      for (let j = i + 1; j < caseReviews.length; j++) {
        totalComparisons++
        if (caseReviews[i].triage_tier === caseReviews[j].triage_tier) {
          totalAgreements++
        }
      }
    }
  }
  const overallAgreementRate = totalComparisons > 0 ? totalAgreements / totalComparisons : 0

  // ── Per-tier agreement ──
  const tierAgreement: Record<string, { agreement_rate: number; total: number }> = {}
  for (const tier of TIER_ORDER) {
    const casesWithThisTier = eligibleCases.filter((c: any) => {
      const caseReviews = reviewsByCase.get(c.id) || []
      const consTier = consensusTier(caseReviews.map((r: any) => r.triage_tier as TriageTier))
      return consTier === tier
    })
    const agreed = casesWithThisTier.filter((c: any) => {
      const caseReviews = reviewsByCase.get(c.id) || []
      return caseReviews.every((r: any) => r.triage_tier === caseReviews[0].triage_tier)
    })
    tierAgreement[tier] = {
      total: casesWithThisTier.length,
      agreement_rate: casesWithThisTier.length > 0 ? agreed.length / casesWithThisTier.length : 0,
    }
  }

  // ── Pairwise comparisons ──
  const pairwise: Array<{
    reviewer_a: string
    reviewer_b: string
    reviewer_a_name: string
    reviewer_b_name: string
    agreement_rate: number
    weighted_kappa: number
    cases_compared: number
  }> = []

  for (let i = 0; i < reviewerIds.length; i++) {
    for (let j = i + 1; j < reviewerIds.length; j++) {
      const a = reviewerIds[i], b = reviewerIds[j]
      const ratingsA: number[] = []
      const ratingsB: number[] = []
      let agree = 0

      for (const c of eligibleCases) {
        const caseReviews = reviewsByCase.get(c.id) || []
        const ra = caseReviews.find((r: any) => r.reviewer_id === a)
        const rb = caseReviews.find((r: any) => r.reviewer_id === b)
        if (ra && rb) {
          ratingsA.push(tierToOrdinal(ra.triage_tier as TriageTier))
          ratingsB.push(tierToOrdinal(rb.triage_tier as TriageTier))
          if (ra.triage_tier === rb.triage_tier) agree++
        }
      }

      if (ratingsA.length > 0) {
        pairwise.push({
          reviewer_a: a,
          reviewer_b: b,
          reviewer_a_name: nameMap.get(a) || 'Reviewer',
          reviewer_b_name: nameMap.get(b) || 'Reviewer',
          agreement_rate: agree / ratingsA.length,
          weighted_kappa: weightedKappa(ratingsA, ratingsB, numCategories),
          cases_compared: ratingsA.length,
        })
      }
    }
  }

  // ── AI vs Human Consensus ──
  const aiDisagreements: Array<{
    case_id: string
    case_number: number
    case_title: string
    ai_tier: TriageTier
    consensus_tier: TriageTier
    reviewer_tiers: Record<string, TriageTier>
  }> = []
  let aiAgreeCount = 0
  let aiCompareCount = 0
  const aiRatings: number[] = []
  const consensusRatings: number[] = []

  for (const c of eligibleCases) {
    if (!c.ai_triage_tier) continue
    const caseReviews = reviewsByCase.get(c.id) || []
    const consTier = consensusTier(caseReviews.map((r: any) => r.triage_tier as TriageTier))
    if (!consTier) continue

    aiCompareCount++
    const aiOrd = tierToOrdinal(c.ai_triage_tier as TriageTier)
    const consOrd = tierToOrdinal(consTier)
    aiRatings.push(aiOrd)
    consensusRatings.push(consOrd)

    if (c.ai_triage_tier === consTier) {
      aiAgreeCount++
    } else {
      const revTiers: Record<string, TriageTier> = {}
      for (const r of caseReviews) {
        revTiers[nameMap.get(r.reviewer_id) || r.reviewer_id] = r.triage_tier as TriageTier
      }
      aiDisagreements.push({
        case_id: c.id,
        case_number: c.case_number,
        case_title: c.title,
        ai_tier: c.ai_triage_tier as TriageTier,
        consensus_tier: consTier,
        reviewer_tiers: revTiers,
      })
    }
  }

  const aiVsConsensus = {
    agreement_rate: aiCompareCount > 0 ? aiAgreeCount / aiCompareCount : 0,
    weighted_kappa: aiRatings.length > 0 ? weightedKappa(aiRatings, consensusRatings, numCategories) : 0,
    cases_compared: aiCompareCount,
    disagreements: aiDisagreements,
  }

  // ── Redirect agreement ──
  let redirectAgreeCount = 0
  let redirectTotalCount = 0
  for (const c of eligibleCases) {
    const caseReviews = reviewsByCase.get(c.id) || []
    if (caseReviews.length < 2) continue
    const redirectVotes = caseReviews.filter((r: any) => r.redirect_to_non_neuro).length
    const noRedirectVotes = caseReviews.length - redirectVotes
    redirectTotalCount++
    // Agreement = majority agrees (either mostly redirect or mostly not)
    if (redirectVotes === 0 || noRedirectVotes === 0) {
      redirectAgreeCount++ // unanimous
    }
  }

  // ── Per-case detail ──
  const caseDetails = cases.map((c: any) => {
    const caseReviews = reviewsByCase.get(c.id) || []
    const revTiers: Record<string, TriageTier> = {}
    const revRedirects: Record<string, string | null> = {}
    for (const r of caseReviews) {
      const name = nameMap.get(r.reviewer_id) || r.reviewer_id
      revTiers[name] = r.triage_tier as TriageTier
      if (r.redirect_to_non_neuro) {
        revRedirects[name] = r.redirect_specialty || 'Yes (unspecified)'
      }
    }
    const consTier = consensusTier(caseReviews.map((r: any) => r.triage_tier as TriageTier))
    // agreement: true = all same, false = disagree, null = only 1 reviewer (N/A)
    const agreement = caseReviews.length > 1
      ? caseReviews.every((r: any) => r.triage_tier === caseReviews[0].triage_tier)
      : null
    const anyRedirect = caseReviews.some((r: any) => r.redirect_to_non_neuro)

    return {
      case_id: c.id,
      case_number: c.case_number,
      case_title: c.title,
      ai_tier: c.ai_triage_tier as TriageTier | null,
      ai_redirect: c.ai_redirect_to_non_neuro ? (c.ai_redirect_specialty || 'Yes') : null,
      reviewer_tiers: revTiers,
      reviewer_redirects: revRedirects,
      consensus_tier: consTier,
      agreement,
      any_redirect: anyRedirect,
    }
  })

  // ── AI Self-Consistency (multi-run analysis) ──
  let aiConsistency = undefined
  {
    const { data: aiRuns } = await from('validation_ai_runs')
      .select('*')
      .in('case_id', caseIds)
      .order('run_number', { ascending: true })

    if (aiRuns && aiRuns.length > 0) {
      // Group runs by case
      const runsByCase = new Map<string, typeof aiRuns>()
      for (const run of aiRuns) {
        const list = runsByCase.get(run.case_id) || []
        list.push(run)
        runsByCase.set(run.case_id, list)
      }

      const caseConsistency = cases
        .filter((c: any) => runsByCase.has(c.id))
        .map((c: any) => {
          const runs = runsByCase.get(c.id) || []
          const successRuns = runs.filter((r: any) => !r.error)
          const baseline = successRuns.find((r: any) => r.run_number === 0)
          const standardRuns = successRuns.filter((r: any) => r.run_number > 0)

          const allTiers = successRuns.map((r: any) => r.ai_triage_tier as TriageTier).filter(Boolean)
          const distinctTiers = [...new Set(allTiers)].length

          const scores = successRuns
            .map((r: any) => parseFloat(r.ai_weighted_score))
            .filter((s: any) => !isNaN(s))
          const scoreMean = scores.length > 0
            ? scores.reduce((a: any, b: any) => a + b, 0) / scores.length
            : null
          const scoreStd = scores.length > 1
            ? Math.sqrt(scores.reduce((sum: any, s: any) => sum + (s - scoreMean!) ** 2, 0) / (scores.length - 1))
            : null

          return {
            case_id: c.id,
            case_number: c.case_number,
            case_title: c.title,
            baseline_tier: baseline?.ai_triage_tier as TriageTier | null ?? null,
            baseline_score: baseline?.ai_weighted_score ? parseFloat(baseline.ai_weighted_score) : null,
            run_tiers: standardRuns.map((r: any) => r.ai_triage_tier as TriageTier).filter(Boolean),
            run_scores: standardRuns.map((r: any) => parseFloat(r.ai_weighted_score)).filter((s: any) => !isNaN(s)),
            distinct_tiers: distinctTiers,
            score_mean: scoreMean !== null ? Math.round(scoreMean * 100) / 100 : null,
            score_std: scoreStd !== null ? Math.round(scoreStd * 100) / 100 : null,
            all_agree: distinctTiers <= 1,
          }
        })

      const casesWithRuns = caseConsistency.length
      const perfectAgreement = caseConsistency.filter((c: any) => c.all_agree).length
      const avgDistinct = casesWithRuns > 0
        ? caseConsistency.reduce((s: any, c: any) => s + c.distinct_tiers, 0) / casesWithRuns
        : 0

      aiConsistency = {
        total_cases_with_runs: casesWithRuns,
        total_runs: aiRuns.length,
        perfect_agreement_rate: casesWithRuns > 0 ? Math.round((perfectAgreement / casesWithRuns) * 1000) / 1000 : 0,
        avg_distinct_tiers_per_case: Math.round(avgDistinct * 100) / 100,
        case_consistency: caseConsistency,
      }
    }
  }

  // ── Reviewer summaries ──
  const reviewerSummaries = reviewerIds.map(rid => ({
    reviewer_id: rid,
    reviewer_name: nameMap.get(rid) || 'Reviewer',
    cases_completed: (reviewsByReviewer.get(rid) || []).length,
    total_cases: cases.length,
  }))

  const casesWithAnyRedirect = caseDetails.filter((cd: any) => cd.any_redirect || cd.ai_redirect).length

  return NextResponse.json({
    study_name: studyName,
    total_cases: eligibleCases.length,
    total_reviewers: reviewerIds.length,
    reviewers: reviewerSummaries,
    fleiss_kappa: Math.round(fk * 1000) / 1000,
    fleiss_kappa_interpretation: interpretKappa(fk),
    krippendorff_alpha: Math.round(ka * 1000) / 1000,
    krippendorff_alpha_interpretation: interpretKappa(ka),
    overall_agreement_rate: Math.round(overallAgreementRate * 1000) / 1000,
    tier_agreement: tierAgreement,
    pairwise,
    ai_vs_consensus: aiVsConsensus,
    ai_consistency: aiConsistency,
    redirect_agreement: {
      agreement_rate: redirectTotalCount > 0 ? Math.round((redirectAgreeCount / redirectTotalCount) * 1000) / 1000 : 0,
      total_cases: redirectTotalCount,
      cases_with_any_redirect: casesWithAnyRedirect,
    },
    case_details: caseDetails,
  })
}
