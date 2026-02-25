// ── Command Center Types (Clinician Command Center) ──

// -- Enums / union types --

export type ViewMode = 'my_patients' | 'all_patients'
export type TimeRange = 'today' | 'yesterday' | 'last_7_days'

export type ActionType =
  | 'message' | 'call' | 'order' | 'refill' | 'pa_followup'
  | 'scale_reminder' | 'care_gap' | 'appointment' | 'pcp_summary'

export type Confidence = 'high' | 'medium' | 'low'
export type ActionStatus = 'pending' | 'approved' | 'dismissed' | 'executed'
export type PatientUrgency = 'urgent' | 'attention' | 'watch' | 'stable'
export type CategoryFilter =
  | 'all' | 'messages' | 'refills' | 'results' | 'wearables'
  | 'followups' | 'triage' | 'ehr' | 'scales'

// -- Zone 1: AI Briefing --

export interface BriefingResponse {
  narrative: string
  reasoning: string[]
  urgent_count: number
  generated_at: string
}

export interface BriefingRequest {
  physician_id: string | null
  view_mode: ViewMode
  time_range: TimeRange
}

// -- Zone 2: Status Tiles --

export interface TileMetric {
  total: number
  sublabel: string
  trend?: 'up' | 'down' | 'flat'
}

export interface MetricsResponse {
  schedule: TileMetric & { new: number; cancelled: number }
  messages: TileMetric & { urgent: number; oldest_days: number }
  refills: TileMetric & { overdue: number }
  results: TileMetric & { oldest_days: number }
  wearables: TileMetric & { urgent: number }
  followups: TileMetric & { same_day: number }
  triage: TileMetric & { emergent: number }
  ehr: TileMetric & { results_to_sign: number }
}

export interface StatusTileConfig {
  key: keyof MetricsResponse
  label: string
  icon: string       // Lucide icon name
  color: string      // accent hex
  category: CategoryFilter
}

// -- Zone 3: AI Action Queue --

export interface ActionItem {
  id: string
  action_type: ActionType
  confidence: Confidence
  patient_id: string | null
  patient_name: string
  title: string
  description: string
  drafted_content: string | null
  batch_id: string | null
  status: ActionStatus
  created_at: string
}

export interface BatchGroup {
  batch_id: string
  action_type: ActionType
  count: number
  all_high_confidence: boolean
  label: string
  action_ids: string[]
}

export interface ActionsResponse {
  actions: ActionItem[]
  batch_groups: BatchGroup[]
}

// -- Zone 4: Priority Patient Queue --

export interface PendingItems {
  messages: number
  refills: number
  results: number
  wearables: number
  followups: number
  triage: number
  scales: number
  ehr: number
}

export interface PatientQueueItem {
  id: string
  name: string
  age: number
  sex: string
  primary_diagnosis: string
  urgency: PatientUrgency
  pending_items: PendingItems
  ai_micro_summary: string
  last_contact: {
    date: string
    method: string
  }
  sources: string[]  // 'sevaro' | 'ehr' | 'wearable'
}

export interface PatientSummaryResponse {
  ai_summary: string
  pending_items: {
    category: string
    description: string
    age: string
  }[]
  recent_events: {
    date: string
    event: string
    source: string
  }[]
  quick_links: {
    chart: string
    wearable: string
    followup: string
  }
}

export interface PatientsResponse {
  patients: PatientQueueItem[]
}

// -- Component prop types --

export interface CommandCenterState {
  viewMode: ViewMode
  timeRange: TimeRange
  categoryFilter: CategoryFilter
  urgencyFilter: PatientUrgency | 'all'
  searchQuery: string
}
