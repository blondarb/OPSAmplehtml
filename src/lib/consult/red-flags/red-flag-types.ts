export type RedFlagSeverity = 'critical' | 'high' | 'moderate'

// Maps to follow-up EscalationTier for consistency
export type EscalationTier = 'immediate' | 'urgent' | 'same_day' | 'routine'

export interface RedFlag {
  id: string
  name: string
  /** Keywords and phrases to match against transcript */
  patterns: string[]
  severity: RedFlagSeverity
  escalation_tier: EscalationTier
  clinical_significance: string
  recommended_action: string
}

export interface DetectedFlag {
  flag: RedFlag
  /** Matched keyword/phrase that triggered detection */
  matched_pattern: string
  /** 0–1 confidence score */
  confidence: number
  /** Excerpt from transcript around the match */
  context_snippet: string
}

export interface RedFlagDetection {
  consult_id: string
  transcript_text: string
  detected_flags: DetectedFlag[]
  highest_severity: RedFlagSeverity | null
  recommended_escalation_tier: EscalationTier | null
  detected_at: string
}

export interface EscalationEvent {
  id: string
  consult_id: string
  flag_name: string
  severity: RedFlagSeverity
  detected_symptoms: string[]
  confidence: number
  escalation_from_tier: EscalationTier
  escalation_to_tier: EscalationTier
  detected_at: string
  acknowledged_at: string | null
}
