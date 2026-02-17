/**
 * TypeScript types for the AI Neurologic Historian feature.
 */

export type HistorianSessionType = 'new_patient' | 'follow_up'
export type HistorianSessionStatus = 'in_progress' | 'completed' | 'abandoned'

export interface HistorianTranscriptEntry {
  role: 'assistant' | 'user'
  text: string
  timestamp: number // seconds from session start
}

export interface HistorianRedFlag {
  flag: string
  severity: 'high' | 'medium' | 'low'
  context: string
}

export interface HistorianStructuredOutput {
  chief_complaint?: string
  hpi?: string
  onset?: string
  location?: string
  duration?: string
  character?: string
  aggravating_factors?: string
  relieving_factors?: string
  timing?: string
  severity?: string
  associated_symptoms?: string
  current_medications?: string
  allergies?: string
  past_medical_history?: string
  past_surgical_history?: string
  family_history?: string
  social_history?: string
  review_of_systems?: string
  functional_status?: string
  // Follow-up specific
  interval_changes?: string
  treatment_response?: string
  new_symptoms?: string
  medication_changes?: string
  side_effects?: string
}

export interface HistorianSession {
  id: string
  tenant_id: string
  patient_id: string | null
  session_type: HistorianSessionType
  patient_name: string
  referral_reason: string | null
  structured_output: HistorianStructuredOutput | null
  narrative_summary: string | null
  transcript: HistorianTranscriptEntry[] | null
  red_flags: HistorianRedFlag[] | null
  safety_escalated: boolean
  duration_seconds: number
  question_count: number
  status: HistorianSessionStatus
  reviewed: boolean
  imported_to_note: boolean
  session_source?: string
  created_at: string
  updated_at: string
  // Joined patient data (from dashboardData query)
  patient?: {
    id: string
    first_name: string
    last_name: string
    mrn: string
  } | null
}

export interface PortalPatient {
  id: string
  first_name: string
  last_name: string
  date_of_birth: string | null
  gender: string | null
  mrn: string | null
  referral_reason: string | null
  referring_physician: string | null
}

export interface PatientContext {
  patientName: string
  referralReason: string | null
  lastVisitDate: string | null
  lastVisitType: string | null
  lastNoteExcerpt: string | null
  lastNotePlan: string | null
  allergies: string | null
  diagnoses: string | null
  lastNoteSummary: string | null
}

export interface DemoScenario {
  id: string
  label: string
  session_type: HistorianSessionType
  referral_reason: string
  patient_name: string
  description: string
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'headache_new',
    label: 'New Patient: Headache Referral',
    session_type: 'new_patient',
    referral_reason: 'Chronic headaches, referred by PCP for neurological evaluation',
    patient_name: 'Demo Patient',
    description: 'First-time neurology visit for persistent headaches. AI will take a complete headache history using OLDCARTS.',
  },
  {
    id: 'seizure_new',
    label: 'New Patient: Seizure Evaluation',
    session_type: 'new_patient',
    referral_reason: 'New-onset seizures, referred for epilepsy evaluation',
    patient_name: 'Demo Patient',
    description: 'First-time neurology visit for seizure evaluation. AI will characterize events and gather risk factors.',
  },
  {
    id: 'migraine_followup',
    label: 'Follow-Up: Migraine Management',
    session_type: 'follow_up',
    referral_reason: 'Follow-up for chronic migraine on topiramate',
    patient_name: 'Demo Patient',
    description: 'Return visit for migraine management. AI will assess treatment response and interval changes.',
  },
  {
    id: 'ms_followup',
    label: 'Follow-Up: Multiple Sclerosis',
    session_type: 'follow_up',
    referral_reason: 'Follow-up for relapsing-remitting MS on disease-modifying therapy',
    patient_name: 'Demo Patient',
    description: 'Return visit for MS monitoring. AI will screen for new symptoms and treatment tolerability.',
  },
]
