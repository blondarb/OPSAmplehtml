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
  interview_completion_status?: 'complete' | 'ended_early' | null
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

// ─── Turn detection config (env-driven, with PR #105 fallback) ──────────────

export type TurnDetectionMode = 'semantic_vad' | 'server_vad'

export type TurnDetectionConfig =
  | { type: 'semantic_vad'; eagerness: 'low' | 'medium' | 'high' }
  | {
      type: 'server_vad'
      threshold: number
      prefix_padding_ms: number
      silence_duration_ms: number
    }

/**
 * Resolve TurnDetectionConfig from a mode string (typically from
 * HISTORIAN_TURN_DETECTION_MODE env var or NEXT_PUBLIC_HISTORIAN_TURN_DETECTION_MODE
 * on the client). Falls back to semantic_vad on unknown input.
 *
 * server_vad params are the PR #105 tuning (speakerphone-echo-resistant).
 */
export function getTurnDetectionConfig(mode: string | undefined): TurnDetectionConfig {
  if (mode === 'server_vad') {
    return {
      type: 'server_vad',
      threshold: 0.65,
      prefix_padding_ms: 400,
      silence_duration_ms: 1200,
    }
  }
  // Default: semantic_vad with low eagerness (least likely to cut off patient)
  return { type: 'semantic_vad', eagerness: 'low' }
}

// ─── Input noise reduction (env-driven) ─────────────────────────────────────
//
// OpenAI Realtime filters the input audio BEFORE it reaches the VAD + model,
// which cuts the false speech-detections that background noise was causing
// (Riya 2026-06-29: noisy rooms made the historian freeze/stutter). See
// https://developers.openai.com/api/reference/resources/realtime
//   far_field  — laptop / speakerphone / open room (default; most robust to noise)
//   near_field — headset / phone held to the ear
//   off        — disable (legacy behavior, no filtering)
export type NoiseReductionConfig = { type: 'near_field' | 'far_field' } | null

/**
 * Resolve noise reduction from HISTORIAN_NOISE_REDUCTION. Defaults to far_field
 * (the most noise-robust option) so background noise no longer interrupts the AI.
 * Returns null when explicitly disabled, so the session omits the field entirely.
 */
export function getNoiseReductionConfig(mode: string | undefined): NoiseReductionConfig {
  const m = (mode || '').toLowerCase()
  if (m === 'off' || m === 'none' || m === 'false') return null
  if (m === 'near_field' || m === 'near') return { type: 'near_field' }
  return { type: 'far_field' }
}

// ─── Tool: query_evidence ───────────────────────────────────────────────────

export type QueryEvidenceArgs = {
  question: string
  focus_diagnoses?: string[]
}

export type QueryEvidenceResponse =
  | {
      status: 'ok'
      chunks: Array<{ content: string; source: string; score?: number }>
    }
  | { status: 'timeout'; chunks: [] }
  | { status: 'error'; chunks: []; message: string }

// ─── Tool: scale_step (paginated) ───────────────────────────────────────────

export type ScaleStepArgs =
  | { scale_id: string; reason: string } // First call
  | {
      scale_id: string
      prev_index: number
      prev_response: string | number
    }

export type ScaleStepResponse =
  | {
      done: false
      index: number
      item: {
        text: string
        choices?: Array<{ label: string; value: string | number }>
        scoring_hint?: string
      }
    }
  | {
      done: true
      total_score: number
      interpretation: string
      severity_level: 'none' | 'minimal' | 'mild' | 'moderate' | 'moderately_severe' | 'severe'
    }
  | { status: 'unknown_scale'; available: string[] }
  | { status: 'bad_index'; expected_index: number }
