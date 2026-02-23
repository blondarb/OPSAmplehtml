export type BillingProgram = 'tcm' | 'ccm'
export type BillingStatus = 'not_reviewed' | 'pending_review' | 'ready_to_bill' | 'billed'

export interface BillingEntry {
  id: string
  session_id: string
  created_at: string
  updated_at: string
  patient_id: string | null
  patient_name: string
  service_date: string
  billing_month: string
  program: BillingProgram
  cpt_code: string
  cpt_rate: number
  prep_minutes: number
  call_minutes: number
  documentation_minutes: number
  coordination_minutes: number
  total_minutes: number
  meets_threshold: boolean
  billing_status: BillingStatus
  reviewed_by: string | null
  reviewed_at: string | null
  notes: string | null
  tcm_discharge_date: string | null
  tcm_contact_within_2_days: boolean | null
  tcm_f2f_scheduled: boolean | null
  // Joined from session
  follow_up_method?: string
  escalation_level?: string
  conversation_status?: string
}

export interface BillingMonthlySummary {
  totalSessions: number
  billableSessions: number
  totalBillableMinutes: number
  estimatedRevenue: number
}

export interface AnalyticsSummary {
  totalCalls: number
  completionRate: number
  avgDuration: number
  estimatedRevenue: number
}

export interface AnalyticsData {
  summary: AnalyticsSummary
  volumeByPeriod: Array<{ period: string; count: number }>
  completionTrend: Array<{ period: string; rate: number }>
  escalationDistribution: { urgent: number; same_day: number; next_visit: number; informational: number }
  medicationAdherence: { filledRate: number; takingRate: number; sideEffectRate: number }
  functionalStatus: { better: number; same: number; worse: number }
  modeDistribution: { sms: number; voice: number }
  recentEscalations: Array<{
    id: string
    patientName: string
    tier: string
    category: string
    date: string
    acknowledged: boolean
    sessionId: string
  }>
}
