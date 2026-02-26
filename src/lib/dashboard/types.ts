// ──────────────────────────────────────────────────────────────────────────────
// Role-Based Dashboard Shared Types
// Used by both MA Dashboard and Practice Manager Dashboard
// Design doc: docs/plans/2026-02-26-role-based-dashboards-plan.md
// ──────────────────────────────────────────────────────────────────────────────

// --- Union / enum-like types ---------------------------------------------------

export type FlowStage =
  | 'not_arrived'
  | 'checked_in'
  | 'vitals_done'
  | 'ready_for_video'
  | 'in_visit'
  | 'post_visit'
  | 'completed'
  | 'no_show'
  | 'cancelled'

export type VisitType = 'new' | 'follow_up' | 'urgent'

export type ProviderStatus = 'available' | 'in_visit' | 'break' | 'offline'

export type ProviderCredentials = 'MD' | 'DO' | 'NP'

export type Specialty =
  | 'general_neurology'
  | 'headache'
  | 'epilepsy'
  | 'ms_neuroimmunology'
  | 'neuromuscular'
  | 'cerebrovascular'
  | 'sleep'

export type TaskType =
  | 'send_historian_link'
  | 'coordinate_local_ma'
  | 'tech_help'
  | 'prep_records'
  | 'process_refill'
  | 'route_message'
  | 'post_visit_task'
  | 'send_intake_form'
  | 'call_patient'
  | 'check_video'

export type TaskPriority = 'urgent' | 'time_sensitive' | 'routine'

export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type EhrIntegration = 'epic_fhir' | 'cerner_fhir' | 'none'

export type VirtualMARole = 'primary' | 'float'

export type AlertSeverity = 'critical' | 'warning' | 'info'

export type ActivityEventType =
  | 'check_in'
  | 'vitals_done'
  | 'visit_start'
  | 'visit_end'
  | 'note_signed'
  | 'historian_completed'
  | 'no_show'
  | 'cancelled'
  | 'video_connected'
  | 'chart_prep_ready'

// --- Shared interfaces (MA + Practice Manager) ---------------------------------

export interface Provider {
  id: string
  name: string
  credentials: ProviderCredentials
  specialty: Specialty
  status: ProviderStatus
  current_patient_id: string | null
  next_patient_time: string | null
  stats: {
    seen_today: number
    remaining_today: number
    running_behind_minutes: number
  }
}

export interface AIReadiness {
  historian_status: 'not_sent' | 'sent' | 'completed' | 'imported'
  sdne_status: 'not_applicable' | 'pending' | 'completed'
  chart_prep_status: 'not_started' | 'in_progress' | 'ready'
}

export interface PatientScheduleItem {
  id: string
  name: string
  age: number
  sex: 'M' | 'F'
  primary_diagnosis: string
  appointment_time: string
  appointment_duration: 30 | 60
  visit_type: VisitType
  provider_id: string
  location: 'clinic' | 'home'
  clinic_site_id: string | null
  flow_stage: FlowStage
  ai_readiness: AIReadiness
  local_ma_assigned: boolean
  video_link_active: boolean
  chief_complaint: string
}

export interface MATask {
  id: string
  type: TaskType
  patient_id: string
  provider_id: string
  priority: TaskPriority
  status: TaskStatus
  description: string
  due_by: string | null
  created_at: string
}

export interface ClinicSite {
  id: string
  name: string
  location: string
  timezone: string
  providers_today: number
  patients_today: number
  local_ma_on_site: boolean
  local_ma_name: string | null
  ehr_integration: EhrIntegration
}

export interface VirtualMA {
  id: string
  name: string
  assigned_provider_ids: string[]
  role: VirtualMARole
  active_task_count: number
}

// --- Practice Manager types ----------------------------------------------------

export interface PracticeMetrics {
  patients_today: { total: number; seen: number; remaining: number }
  utilization: { value: number; trend: number; trend_direction: 'up' | 'down' | 'flat' }
  avg_wait_time: { minutes: number; trend: number; trend_direction: 'up' | 'down' | 'flat' }
  no_shows: { count: number; rate: number }
  ai_prep_rate: { value: number; trend: number; trend_direction: 'up' | 'down' | 'flat' }
}

export interface ProviderPerformance {
  provider_id: string
  name: string
  credentials: ProviderCredentials
  utilization_pct: number
  seen: number
  total: number
  running_behind_minutes: number
  status_note: string
}

export interface QualityMetric {
  label: string
  value: number
  target: number
  unit: string
  trend: 'up' | 'down' | 'flat'
}

export interface QualityMetrics {
  note_completion: QualityMetric
  note_ehr_paste: QualityMetric
  followup_completion: QualityMetric
  triage_turnaround: QualityMetric
}

export interface ActivityEvent {
  id: string
  time: string
  event_type: ActivityEventType
  description: string
  patient_name: string | null
  provider_name: string | null
  site_name: string | null
}

export interface OperationalAlert {
  id: string
  severity: AlertSeverity
  title: string
  description: string
  related_provider: string | null
  related_patient: string | null
  timestamp: string
}
