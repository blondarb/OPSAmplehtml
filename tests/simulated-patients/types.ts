/**
 * TypeScript interfaces for the Simulated Patient E2E Test Agent.
 *
 * These types define the persona schema, test result shapes, and grading
 * rubric output used across the test harness.
 */

// ── Persona Definition ────────────────────────────────────────────────────────

export interface PersonaDemographics {
  age: number
  sex: 'M' | 'F'
  name: string
  date_of_birth: string
  email: string
  phone: string
}

export interface PersonaExpectedTriage {
  /** Expected TriageTier value — must match exactly */
  urgency: string
  /** Expected red flags the system should detect */
  redFlags: string[]
  /** Expected subspecialty recommendation */
  subspecialty: string
}

export interface PersonaIntakeData {
  patient_name: string
  date_of_birth: string
  email: string
  phone: string
  chief_complaint: string
  current_medications: string
  allergies: string
  medical_history: string
  family_history: string
}

export interface PersonaHistoryResponse {
  question_pattern: string
  response: string
}

export interface PersonaExpectedDDx {
  diagnosis: string
  likelihood: 'high' | 'medium' | 'low'
}

export interface PersonaStructuredHistory {
  chief_complaint: string
  onset: string
  location: string
  duration: string
  character: string
  aggravating_factors: string
  relieving_factors: string
  timing: string
  severity: string
  associated_symptoms: string
  current_medications: string
  allergies: string
  past_medical_history: string
  family_history: string
  social_history: string
  review_of_systems: string
}

/**
 * A complete simulated patient persona.
 * Each JSON file under /personas/ conforms to this shape.
 */
export interface PatientPersona {
  id: string
  name: string
  description: string
  demographics: PersonaDemographics
  referralText: string
  expectedTriage: PersonaExpectedTriage
  intakeData: PersonaIntakeData
  historyResponses: PersonaHistoryResponse[]
  structuredHistory: PersonaStructuredHistory
  narrativeSummary: string
  expectedScales: string[]
  expectedDDx: PersonaExpectedDDx[]
  expectedRedFlags: string[]
}

// ── API Response Shapes ───────────────────────────────────────────────────────

export interface TriageAPIResponse {
  session_id: string
  triage_tier: string
  triage_tier_display: string
  confidence: string
  dimension_scores: Record<string, { score: number; rationale: string }>
  weighted_score: number
  red_flag_override: boolean
  emergent_override: boolean
  emergent_reason: string | null
  insufficient_data: boolean
  missing_information: string[] | null
  clinical_reasons: string[]
  red_flags: string[]
  suggested_workup: string[]
  failed_therapies: Array<{ therapy: string; reason_stopped: string }>
  subspecialty_recommendation: string
  subspecialty_rationale: string
  redirect_to_non_neuro: boolean
  redirect_specialty: string | null
  redirect_rationale: string | null
  disclaimer: string
  consult_id: string | null
}

export interface ConsultCreateResponse {
  consult: {
    id: string
    status: string
    referral_text: string | null
    triage_session_id: string | null
    triage_urgency: string | null
    [key: string]: unknown
  }
}

export interface InitiateIntakeResponse {
  context: {
    consult_id: string
    triage_urgency: string
    triage_tier_display: string
    chief_complaint: string
    triage_summary: string
    red_flags: string[]
    subspecialty: string
    referral_text: string | null
  }
  intake_session_id: string | null
  already_initiated: boolean
  consult_status: string
}

export interface IntakeChatResponse {
  nextQuestion: string
  extractedData: Record<string, string>
  isComplete: boolean
  readyForReview: boolean
  requiresEmergencyCare?: boolean
}

export interface HistorianSaveResponse {
  session: {
    id: string
    structured_output: Record<string, unknown> | null
    narrative_summary: string | null
    red_flags: Array<{ flag: string; severity: string; context: string }> | null
    [key: string]: unknown
  }
  consult_id: string | null
}

export interface LocalizerResponse {
  differential: Array<{
    diagnosis: string
    icd10?: string
    rationale: string
    likelihood: 'high' | 'medium' | 'low'
  }>
  evidenceSnippets: string[]
  followUpQuestions: string[]
  contextHint: string
  confidence: 'high' | 'medium' | 'low'
  localizationHypothesis: string
  kbSources: string[]
  processingMs: number
  partial?: boolean
  degradedReason?: string
}

export interface ReportResponse {
  report: {
    id: string
    consult_id: string
    status: string
    sections: Array<{
      id: string
      title: string
      content: string
      source: string
      order: number
    }>
    scale_results: Array<{
      scale_name: string
      abbreviation: string
      score: number
      max_score: number
      severity: string
      interpretation: string
    }>
    differential: Array<{
      diagnosis: string
      likelihood: string
      rationale: string
    }>
    red_flags: {
      count: number
      highest_severity: string | null
      flags: Array<{
        name: string
        severity: string
        confidence: number
      }>
    }
    chief_complaint: string
    triage_tier: string | null
    subspecialty: string | null
    word_count: number
    generated_at: string
    [key: string]: unknown
  }
}

// ── Test Result Shapes ────────────────────────────────────────────────────────

export interface StepResult {
  step: string
  passed: boolean
  duration_ms: number
  details: Record<string, unknown>
  errors: string[]
}

export interface PersonaTestResult {
  persona_id: string
  persona_name: string
  steps: StepResult[]
  grade: GradeResult
  total_duration_ms: number
  consult_id: string | null
}

// ── Grading Rubric ────────────────────────────────────────────────────────────

export interface GradeResult {
  triage_accuracy: GradeItem
  red_flag_detection: GradeItem
  ddx_completeness: GradeItem
  history_thoroughness: GradeItem
  report_quality: GradeItem
  overall_score: number
}

export interface GradeItem {
  score: number       // 0-100
  max_score: number   // always 100
  pass: boolean
  details: string
}
