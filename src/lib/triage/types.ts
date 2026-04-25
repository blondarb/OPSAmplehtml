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

// Non-neurology specialties for redirect routing
export type NonNeuroSpecialtyType =
  | 'Primary Care / PCP'
  | 'Orthopedics'
  | 'Spine Surgery'
  | 'Pain Management'
  | 'Rheumatology'
  | 'Psychiatry'
  | 'Podiatry'
  | 'Physical Medicine & Rehab'
  | 'ENT / Otolaryngology'
  | 'Ophthalmology'
  | 'Cardiology'
  | 'Endocrinology'
  | 'Other Specialty'

export const NON_NEURO_SPECIALTIES: NonNeuroSpecialtyType[] = [
  'Primary Care / PCP',
  'Orthopedics',
  'Spine Surgery',
  'Pain Management',
  'Rheumatology',
  'Psychiatry',
  'Podiatry',
  'Physical Medicine & Rehab',
  'ENT / Otolaryngology',
  'Ophthalmology',
  'Cardiology',
  'Endocrinology',
  'Other Specialty',
]

export const NEURO_SUBSPECIALTIES: SubspecialtyType[] = [
  'General Neurology',
  'Epilepsy',
  'Movement Disorders',
  'Headache',
  'Neuromuscular',
  'Cognitive/Memory',
  'Stroke',
]

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
  // Non-neuro redirect (new — AI may recommend a different specialty entirely)
  redirect_to_non_neuro?: boolean
  redirect_specialty?: string
  redirect_rationale?: string
  // Safety-critical history extraction. Each field is verbatim from the
  // referral when stated, or null when not mentioned. The AI does NOT
  // fabricate values — missing-but-clinically-critical items are flagged
  // via missing_information with a "SAFETY: " prefix instead.
  safety_anticoagulation?: string | null
  safety_symptom_onset_time?: string | null
  safety_allergies?: string | null
  safety_implanted_devices?: string | null
  safety_pregnancy_status?: string | null
  safety_recent_procedures?: string | null
  safety_renal_function?: string | null
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
  redirect_to_non_neuro: boolean
  redirect_specialty: string | null
  redirect_rationale: string | null
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

// Demo Scenario types
export type DemoCategory = 'outpatient' | 'cross_specialty' | 'packet'

export interface DemoScenarioFile {
  filename: string
  path: string           // relative path from public/, e.g. '/samples/triage/outpatient/01_Jennings_Harold.pdf'
  docType: string        // e.g. 'PCP Referral', 'MRI Brain Report'
  previewText: string    // pre-extracted full text from PDF
}

export interface DemoScenario {
  id: string
  patientName: string
  age: number
  sex: 'M' | 'F'
  category: DemoCategory
  referringSpecialty: string
  briefDescription: string
  clinicalHighlight: string
  expectedTier: TriageTier
  files: DemoScenarioFile[]
  demoPoints: string[]
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

// ── Phase 2: Extraction, Batch, Fusion Types ──

// Source type for how the input was provided
export type SourceType = 'paste' | 'pdf' | 'docx' | 'txt'

// Detected clinical note type
export type NoteType =
  | 'ed_note'
  | 'pcp_note'
  | 'discharge_summary'
  | 'specialist_consult'
  | 'imaging_report'
  | 'referral'
  | 'unknown'

// File upload constraints
export const FILE_CONSTRAINTS = {
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  MAX_FILE_SIZE_DISPLAY: '10MB',
  MAX_BATCH_FILES: 20,
  MAX_TEXT_LENGTH: 50_000,
  SHORT_NOTE_THRESHOLD: 2_000, // below this, skip extraction
  ALLOWED_TYPES: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'] as const,
  ALLOWED_EXTENSIONS: ['.pdf', '.docx', '.txt'] as const,
} as const

// Key clinical findings extracted from a note
export interface ExtractionKeyFindings {
  chief_complaint: string
  neurological_symptoms: string[]
  timeline: string
  relevant_history: string
  medications_and_therapies: string[]
  failed_therapies: FailedTherapy[]
  imaging_results: string[]
  red_flags_noted: string[]
  functional_status: string
}

// Result of Stage 1 extraction
export interface ClinicalExtraction {
  extraction_id: string
  note_type_detected: NoteType
  extraction_confidence: TriageConfidence
  extracted_summary: string
  key_findings: ExtractionKeyFindings
  original_text_length: number
  source_filename?: string
}

// Request to the extraction endpoint
export interface ExtractionRequest {
  text: string
  patient_age?: number
  patient_sex?: string
}

// Result of multi-note fusion
export interface FusionResult {
  fusion_group_id: string
  fused_summary: string
  fusion_confidence: TriageConfidence
  sources_used: string[]
  conflicts_resolved: string[]
  timeline_reconstructed: string
}

// Request to the fusion endpoint
export interface FusionRequest {
  extractions: Array<{
    extracted_summary: string
    note_type_detected: string
    key_findings: ExtractionKeyFindings
    source_filename?: string
  }>
  patient_age?: number
  patient_sex?: string
}

// Enhanced triage request with Phase 2 fields (backward-compatible)
export interface EnhancedTriageRequest extends TriageRequest {
  extracted_summary?: string
  source_type?: SourceType
  source_filename?: string
  extraction_confidence?: TriageConfidence
  note_type_detected?: NoteType
  batch_id?: string
  fusion_group_id?: string
}

// Batch processing
export interface BatchItem {
  id: string
  filename?: string
  text?: string
  file?: File
  status: 'pending' | 'extracting' | 'extracted' | 'triaging' | 'completed' | 'error'
  extraction?: ClinicalExtraction
  triageResult?: TriageResult
  error?: string
}

export interface BatchState {
  batch_id: string
  items: BatchItem[]
  total: number
  completed: number
  status: 'idle' | 'processing' | 'completed' | 'partial_failure'
  autoApproveExtractions: boolean
}

// Page state machine for Phase 2 multi-step flow
export type TriagePageState =
  | 'input'        // User entering text or uploading files
  | 'extracting'   // Stage 1: AI extracting from note
  | 'review'       // User reviewing extraction
  | 'triaging'     // Stage 2: AI scoring triage
  | 'result'       // Showing triage result
  | 'batch'        // Batch mode: processing multiple items
