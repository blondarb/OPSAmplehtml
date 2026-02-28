import { TriageTier, TriageConfidence, DimensionScores, SubspecialtyType, NonNeuroSpecialtyType, NON_NEURO_SPECIALTIES, NEURO_SUBSPECIALTIES } from './types'

// ── Validation Case (the note to be graded) ──

export interface ValidationCase {
  id: string
  case_number: number
  title: string
  referral_text: string
  patient_age: number | null
  patient_sex: string | null
  ai_triage_tier: TriageTier | null
  ai_weighted_score: number | null
  ai_dimension_scores: DimensionScores | null
  ai_subspecialty: string | null
  ai_confidence: TriageConfidence | null
  ai_session_id: string | null
  study_name: string
  is_calibration: boolean
  active: boolean
  created_at: string
}

// ── Validation Review (one reviewer's assessment of one case) ──

export interface ValidationReview {
  id: string
  case_id: string
  reviewer_id: string
  triage_tier: TriageTier
  subspecialty: string | null
  redirect_to_non_neuro: boolean
  redirect_specialty: string | null
  confidence: TriageConfidence | null
  key_factors: string[]
  reasoning: string | null
  started_at: string | null
  completed_at: string
  duration_seconds: number | null
  created_at: string
}

// ── Key Clinical Factors (checkbox options for reviewers) ──

export const KEY_FACTOR_OPTIONS = [
  'Acute symptom onset',
  'Progressive neurological deficit',
  'Red flag symptoms present',
  'Significant functional impairment',
  'Diagnostic uncertainty / complex presentation',
  'Failed prior therapies',
  'Chronic stable condition',
  'Known diagnosis, needs optimization',
  'Vague or insufficient clinical information',
  'Concern for life-threatening condition',
  'Imaging or lab abnormalities',
  'Psychiatric/safety concern',
] as const

export type KeyFactor = typeof KEY_FACTOR_OPTIONS[number]

// ── Subspecialty options (matching existing types) ──

export const SUBSPECIALTY_OPTIONS: SubspecialtyType[] = NEURO_SUBSPECIALTIES

// Re-export for convenience in validation form
export const NON_NEURO_SPECIALTY_OPTIONS: NonNeuroSpecialtyType[] = NON_NEURO_SPECIALTIES

// ── Case with review status (for the reviewer's case list) ──

export interface ValidationCaseWithStatus extends ValidationCase {
  reviewed: boolean
  review?: ValidationReview
}

// ── Statistics Types ──

export interface ReviewerSummary {
  reviewer_id: string
  reviewer_name: string
  cases_completed: number
  total_cases: number
}

export interface TierAgreementCell {
  tier: TriageTier
  count: number
  percentage: number
}

export interface PairwiseAgreement {
  reviewer_a: string
  reviewer_b: string
  reviewer_a_name: string
  reviewer_b_name: string
  agreement_rate: number
  weighted_kappa: number
  cases_compared: number
}

export interface ValidationResults {
  study_name: string
  total_cases: number
  total_reviewers: number
  reviewers: ReviewerSummary[]
  // Agreement metrics
  fleiss_kappa: number
  fleiss_kappa_interpretation: string
  krippendorff_alpha: number
  krippendorff_alpha_interpretation: string
  overall_agreement_rate: number
  // Per-tier agreement
  tier_agreement: Record<TriageTier, { agreement_rate: number; total: number }>
  // Pairwise reviewer comparisons
  pairwise: PairwiseAgreement[]
  // AI vs Human consensus
  ai_vs_consensus: {
    agreement_rate: number
    weighted_kappa: number
    cases_compared: number
    disagreements: Array<{
      case_id: string
      case_number: number
      case_title: string
      ai_tier: TriageTier
      consensus_tier: TriageTier
      reviewer_tiers: Record<string, TriageTier>
    }>
  }
  // Redirect agreement
  redirect_agreement: {
    agreement_rate: number
    total_cases: number
    cases_with_any_redirect: number
  }
  // Per-case detail
  case_details: Array<{
    case_id: string
    case_number: number
    case_title: string
    ai_tier: TriageTier | null
    ai_redirect: string | null
    reviewer_tiers: Record<string, TriageTier>
    reviewer_redirects: Record<string, string | null>
    consensus_tier: TriageTier | null
    agreement: boolean
    any_redirect: boolean
  }>
}
