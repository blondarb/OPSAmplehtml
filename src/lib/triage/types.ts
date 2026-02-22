// Triage Tiers
export type TriageTier =
  | 'emergent'
  | 'urgent'
  | 'semi_urgent'
  | 'routine_priority'
  | 'routine'
  | 'non_urgent'
  | 'insufficient_data'

export type TriageConfidence = 'high' | 'moderate' | 'low'

export type SubspecialtyType =
  | 'General Neurology'
  | 'Epilepsy'
  | 'Movement Disorders'
  | 'Headache'
  | 'Neuromuscular'
  | 'Cognitive/Memory'
  | 'Stroke'

// Override categories per CMIO review
export type OverrideCategory =
  | 'Acuity higher than assessed'
  | 'Acuity lower than assessed'
  | 'Needs different subspecialty'
  | 'Disagree with tier'
  | 'Additional clinical context'

export const OVERRIDE_CATEGORIES: OverrideCategory[] = [
  'Acuity higher than assessed',
  'Acuity lower than assessed',
  'Needs different subspecialty',
  'Disagree with tier',
  'Additional clinical context',
]

// Dimension Scores
export interface DimensionScore {
  score: number // 1-5 integer
  rationale: string
}

export interface DimensionScores {
  symptom_acuity: DimensionScore
  diagnostic_concern: DimensionScore
  rate_of_progression: DimensionScore
  functional_impairment: DimensionScore
  red_flag_presence: DimensionScore
}

// Failed Therapy
export interface FailedTherapy {
  therapy: string
  reason_stopped: string
}

// What the AI returns (raw scores, NO tier calculation)
export interface AITriageResponse {
  emergent_override: boolean
  emergent_reason: string | null
  insufficient_data: boolean
  missing_information: string[] | null
  confidence: TriageConfidence
  dimension_scores: DimensionScores
  red_flag_override: boolean
  clinical_reasons: string[]
  red_flags: string[]
  suggested_workup: string[]
  failed_therapies: FailedTherapy[]
  subspecialty_recommendation: SubspecialtyType | string
  subspecialty_rationale: string
}

// Full result after app-side scoring
export interface TriageResult {
  session_id: string
  triage_tier: TriageTier
  triage_tier_display: string
  confidence: TriageConfidence
  dimension_scores: DimensionScores
  weighted_score: number | null
  red_flag_override: boolean
  emergent_override: boolean
  emergent_reason: string | null
  insufficient_data: boolean
  missing_information: string[] | null
  clinical_reasons: string[]
  red_flags: string[]
  suggested_workup: string[]
  failed_therapies: FailedTherapy[]
  subspecialty_recommendation: string
  subspecialty_rationale: string
  disclaimer: string
}

// API Request
export interface TriageRequest {
  referral_text: string
  patient_age?: number
  patient_sex?: string
  referring_provider_type?: string
  patient_id?: string
}

// Database row
export interface TriageSession {
  id: string
  created_at: string
  referral_text: string
  patient_age: number | null
  patient_sex: string | null
  referring_provider_type: string | null
  triage_tier: TriageTier
  confidence: TriageConfidence
  dimension_scores: DimensionScores
  weighted_score: number | null
  clinical_reasons: string[]
  red_flags: string[]
  suggested_workup: string[]
  failed_therapies: FailedTherapy[]
  missing_information: string[] | null
  subspecialty_recommendation: string | null
  subspecialty_rationale: string | null
  ai_model_used: string
  ai_raw_response: unknown
  physician_override_tier: string | null
  physician_override_reason: string | null
  flagged_for_review: boolean
  status: string
  patient_id: string | null
}

// Sample Note
export interface SampleNote {
  id: string
  title: string
  tierHint: string
  text: string
}

// Tier display configuration
export interface TierDisplayConfig {
  label: string
  timeframe: string
  color: string
  borderColor: string
  textColor: string
  bgColor: string
  pulsing?: boolean
}

export const TIER_DISPLAY: Record<TriageTier, TierDisplayConfig> = {
  emergent: {
    label: 'EMERGENT',
    timeframe: 'Redirect to ED Immediately',
    color: '#1E1E1E',
    borderColor: '#DC2626',
    textColor: '#FFFFFF',
    bgColor: '#1E1E1E',
    pulsing: true,
  },
  urgent: {
    label: 'URGENT',
    timeframe: 'Within 1 Week',
    color: '#DC2626',
    borderColor: '#DC2626',
    textColor: '#FFFFFF',
    bgColor: '#DC2626',
  },
  semi_urgent: {
    label: 'SEMI-URGENT',
    timeframe: 'Within 2 Weeks',
    color: '#EA580C',
    borderColor: '#EA580C',
    textColor: '#FFFFFF',
    bgColor: '#EA580C',
  },
  routine_priority: {
    label: 'ROUTINE-PRIORITY',
    timeframe: 'Within 4-6 Weeks',
    color: '#CA8A04',
    borderColor: '#CA8A04',
    textColor: '#FFFFFF',
    bgColor: '#CA8A04',
  },
  routine: {
    label: 'ROUTINE',
    timeframe: 'Within 8-12 Weeks',
    color: '#16A34A',
    borderColor: '#16A34A',
    textColor: '#FFFFFF',
    bgColor: '#16A34A',
  },
  non_urgent: {
    label: 'NON-URGENT',
    timeframe: 'Within 6 Months or Redirect to PCP',
    color: '#2563EB',
    borderColor: '#2563EB',
    textColor: '#FFFFFF',
    bgColor: '#2563EB',
  },
  insufficient_data: {
    label: 'INSUFFICIENT DATA',
    timeframe: 'Return to Referring Provider for Clarification',
    color: '#6B7280',
    borderColor: '#6B7280',
    textColor: '#FFFFFF',
    bgColor: '#6B7280',
  },
}

export const DISCLAIMER_TEXT =
  'This is a clinical decision support tool. Final triage decisions must be made by a licensed clinician. This tool does not diagnose conditions, prescribe treatments, or replace clinical judgment.'

export const LOW_CONFIDENCE_DISCLAIMER =
  'The AI has low confidence in this triage recommendation. Please have a licensed clinician review the original referral note directly before scheduling.'

export const RED_FLAG_DISCLAIMER =
  'One or more clinical red flags have been identified. This case should be reviewed by a clinician promptly.'
