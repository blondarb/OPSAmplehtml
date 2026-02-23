// Follow-up conversation module stages
export type FollowUpModule = 'greeting' | 'medication' | 'side_effects' | 'symptoms' | 'functional' | 'questions' | 'wrapup'

// Escalation severity tiers (from playbook Section 6.3)
export type EscalationTier = 'urgent' | 'same_day' | 'next_visit' | 'informational'

// Conversation lifecycle
export type ConversationStatus = 'idle' | 'in_progress' | 'completed' | 'abandoned' | 'escalated'

// Communication mode
export type FollowUpMethod = 'sms' | 'voice'

// Medication info from patient context
export interface MedicationInfo {
  name: string
  dose: string
  isNew: boolean
}

// Demo patient scenario
export interface PatientScenario {
  id: string
  name: string
  age: number
  gender: string
  diagnosis: string
  visitDate: string
  providerName: string
  medications: MedicationInfo[]
  visitSummary: string
  scenarioHint?: string
}

// Medication status tracked during conversation
export interface MedicationStatus {
  medication: string
  filled: boolean | null
  taking: boolean | null
  sideEffects: string[]
}

// Escalation event
export interface EscalationFlag {
  tier: EscalationTier
  triggerText: string
  category: string
  aiAssessment: string
  recommendedAction: string
  timestamp: string
}

// Caregiver info
export interface CaregiverInfo {
  isCaregiver: boolean
  name: string | null
  relationship: string | null
}

// Dashboard state update (sent with every API response)
export interface DashboardUpdate {
  status: ConversationStatus
  currentModule: FollowUpModule
  flags: EscalationFlag[]
  medicationStatus: MedicationStatus[]
  functionalStatus: string | null
  functionalDetails: string | null
  patientQuestions: string[]
  caregiverInfo: CaregiverInfo
}

// Individual transcript entry
export interface TranscriptEntry {
  role: 'agent' | 'patient'
  text: string
  timestamp: number
}

// API request for POST /api/follow-up/message
export interface FollowUpMessageRequest {
  session_id: string | null
  patient_message: string
  patient_context: PatientScenario
  conversation_history: Array<{ role: string; content: string }>
}

// API response from POST /api/follow-up/message
export interface FollowUpMessageResponse {
  session_id: string
  agent_response: string
  current_module: FollowUpModule
  escalation_triggered: boolean
  escalation_details: EscalationFlag | null
  conversation_complete: boolean
  dashboard_update: DashboardUpdate
}

// Post-call summary structure
export interface PostCallSummary {
  date: string
  patientName: string
  visitDate: string
  providerName: string
  followUpMethod: FollowUpMethod
  durationMinutes: number
  medicationStatus: MedicationStatus[]
  symptomUpdate: {
    newSymptoms: string[]
    existingSymptoms: string
  }
  functionalStatus: string
  functionalDetails: string
  informant: string
  patientQuestions: string[]
  escalationFlags: EscalationFlag[]
  aiRecommendation: string
}
