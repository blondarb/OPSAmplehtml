/** Shared client-side shape of a `clara_test_feedback` row (see migrations/049). */
export interface ClaraFeedbackRow {
  id: string
  session_id: string | null
  turn_index: number | null
  consult_type: string | null
  urgency_level: string | null
  stat_level: number | null
  confidence: number | null
  rationale: string | null
  red_flags: string[] | null
  gate0_fired: boolean
  routing_target: string | null
  verdict: 'up' | 'down'
  reason: string | null
  corrected_consult_type: string | null
  created_by: string | null
  created_at: string
}

/** Decision snapshot a feedback card needs — subset shared by live turns and logged sessions. */
export interface ClaraDecisionSnapshot {
  consultType: string
  confidence: number | null
  rationale: string | null
  urgencyLevel: string | null
  statLevel: number | null
  redFlags: string[]
  gate0Fired: boolean
}

export const CONSULT_TYPE_OPTIONS = [
  'emergent',
  'non-emergent',
  'ct-return',
  'rounding',
  'eeg-read',
  'ceribell-eeg',
  'outpatient',
] as const

export const TESTER_NAME_STORAGE_KEY = 'clara_test_tester_name'
