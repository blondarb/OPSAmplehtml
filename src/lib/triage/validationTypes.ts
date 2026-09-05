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
  comfortable_with_wait?: 'yes' | 'no' | 'uncertain' | null
  reviewer_kind?: string
  label_context?: string
  clinical_assessment?: ClinicalAssessment | null
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

export const CLINICAL_ASSESSMENT_ACTIONS = [
  'emergency_now',
  'clinician_review_now',
  'outpatient_assessment',
  'clarify_before_disposition',
] as const

export const CLINICAL_ASSESSMENT_ORIGINS = [
  'decision_time',
  'symptom_onset',
  'prior_assessment',
  'unknown',
] as const

export const CLINICAL_ASSESSMENT_INTERVAL_UNITS = ['minutes', 'hours', 'days', 'weeks'] as const

/** These actions record an assessment needed at the decision time, with no delay. */
export const IMMEDIATE_CLINICAL_ASSESSMENT_ACTIONS = [
  'emergency_now',
  'clinician_review_now',
] as const

export const CLINICAL_ASSESSMENT_LEGACY_TIERS = {
  emergency_now: ['emergent'],
  clinician_review_now: ['urgent', 'insufficient_data'],
  outpatient_assessment: ['urgent', 'semi_urgent', 'routine_priority', 'routine', 'non_urgent'],
  clarify_before_disposition: ['insufficient_data'],
} as const

export const CLINICAL_ASSESSMENT_DEFAULT_LEGACY_TIER = {
  emergency_now: 'emergent',
  clinician_review_now: 'urgent',
  outpatient_assessment: 'routine',
  clarify_before_disposition: 'insufficient_data',
} as const

export type ClinicalAssessmentAction = typeof CLINICAL_ASSESSMENT_ACTIONS[number]
export type ClinicalAssessmentOrigin = typeof CLINICAL_ASSESSMENT_ORIGINS[number]
export type ClinicalAssessmentIntervalUnit = typeof CLINICAL_ASSESSMENT_INTERVAL_UNITS[number]

/** A reviewer-owned label, not a final clinical disposition. */
export interface ClinicalAssessment {
  version: 'v1'
  action: ClinicalAssessmentAction
  latest_safe_assessment: {
    origin: ClinicalAssessmentOrigin
    interval?: { value: number; unit: ClinicalAssessmentIntervalUnit }
    anchor?: string
  }
  services: string[]
  decisive_missing_facts: string[]
}

export interface ClinicalAssessmentDraft {
  action: ClinicalAssessmentAction | ''
  origin: ClinicalAssessmentOrigin | ''
  intervalValue: string
  intervalUnit: ClinicalAssessmentIntervalUnit
  anchor: string
  services: string[]
  decisiveMissingFacts: string
}

export const EMPTY_CLINICAL_ASSESSMENT_DRAFT: ClinicalAssessmentDraft = {
  action: '', origin: '', intervalValue: '', intervalUnit: 'hours', anchor: '', services: [], decisiveMissingFacts: '',
}

export function clinicalAssessmentDraftForAction(
  draft: ClinicalAssessmentDraft,
  action: ClinicalAssessmentDraft['action'],
): ClinicalAssessmentDraft {
  if (IMMEDIATE_CLINICAL_ASSESSMENT_ACTIONS.includes(action as typeof IMMEDIATE_CLINICAL_ASSESSMENT_ACTIONS[number])) {
    return { ...draft, action, origin: 'decision_time', intervalValue: '0', intervalUnit: 'minutes', anchor: '' }
  }
  if (draft.origin === 'decision_time' && draft.intervalValue === '0' && draft.intervalUnit === 'minutes' && !draft.anchor) {
    return { ...draft, action, origin: '', intervalValue: '', intervalUnit: 'hours' }
  }
  return { ...draft, action }
}

export function clinicalAssessmentTiersForAction(action: ClinicalAssessmentDraft['action']): readonly string[] {
  return action ? CLINICAL_ASSESSMENT_LEGACY_TIERS[action] : []
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

export const SUBSPECIALTY_OPTIONS: readonly SubspecialtyType[] = NEURO_SUBSPECIALTIES

// Re-export for convenience in validation form
export const NON_NEURO_SPECIALTY_OPTIONS: readonly NonNeuroSpecialtyType[] = NON_NEURO_SPECIALTIES

// ── AI Run (one triage pass of one case at a specific temperature) ──

export interface ValidationAIRun {
  id: string
  case_id: string
  run_number: number            // 0 = baseline (temp=0), 1..N = standard (temp=0.2)
  model: string                 // Bedrock model ID used for this run
  temperature: number
  ai_triage_tier: TriageTier | null
  ai_weighted_score: number | null
  ai_dimension_scores: DimensionScores | null
  ai_subspecialty: string | null
  ai_redirect_to_non_neuro: boolean
  ai_redirect_specialty: string | null
  ai_confidence: TriageConfidence | null
  ai_session_id: string | null
  duration_ms: number | null
  error: string | null
  created_at: string
}

// ── Case with review status (for the reviewer's case list) ──

export interface ValidationCaseWithStatus extends ValidationCase {
  reviewed: boolean
  review?: ValidationReview
}

// ── Case with AI runs attached (for admin page) ──

export interface ValidationCaseWithRuns extends ValidationCase {
  ai_runs: ValidationAIRun[]
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

export interface AIConsistencyData {
  total_cases_with_runs: number
  total_runs: number
  perfect_agreement_rate: number
  avg_distinct_tiers_per_case: number
  overall_score_mean: number | null
  overall_avg_duration_ms: number | null
  case_consistency: Array<{
    case_id: string
    case_number: number
    case_title: string
    baseline_tier: TriageTier | null
    baseline_score: number | null
    run_tiers: TriageTier[]
    run_scores: number[]
    distinct_tiers: number
    score_mean: number | null
    score_std: number | null
    all_agree: boolean
    avg_duration_ms: number | null
  }>
}

export interface ValidationResults {
  study_name: string
  total_cases: number
  total_cases_all?: number
  total_reviewers: number
  insufficient_reviewers?: boolean
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
  // AI Self-Consistency (multi-run analysis)
  ai_consistency?: AIConsistencyData
  clinical_assessment_analysis?: ClinicalAssessmentAnalysis | null
  // Model comparison (present when multiple models have been tested)
  model_comparison?: {
    models: string[]
    per_model: Record<string, AIConsistencyData>
    cross_model_agreement_rate: number
    cross_model_cases_compared: number
    cross_model_details: Array<{
      case_id: string
      case_number: number
      case_title: string
      tiers_by_model: Record<string, TriageTier | null>
      scores_by_model: Record<string, number | null>
      agree: boolean
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
    agreement: boolean | null
    any_redirect: boolean
  }>
}

export interface ClinicalAssessmentAgreementMetric {
  cases_compared: number
  cases_in_agreement: number
  disagreement_count: number
  agreement_rate: number | null
}

export interface ClinicalAssessmentAnalysis {
  canonical_label: 'clinical_assessment_v1'
  reviewer_kind: string
  clinical_validation_established: false
  ai_action_comparison: 'not_evaluated'
  coverage: {
    submitted_reviews: number
    assessments_recorded: number
    cases_with_assessment: number
    cases_with_two_or_more_assessments: number
  }
  action_agreement: ClinicalAssessmentAgreementMetric
  timing_agreement: ClinicalAssessmentAgreementMetric
  service_destination_agreement: ClinicalAssessmentAgreementMetric
}
