// ── Wearable Monitoring Types & Constants (Card 6) ──

// ── Literal Union Types ──

export type AlertSeverity = 'urgent' | 'attention' | 'informational'

export type OverallStatus = 'normal' | 'watch' | 'concern' | 'alert'

export type AlertType =
  | 'patient_nudge'
  | 'clinician_notification'
  | 'urgent_escalation'
  | 'log_only'

export type AnomalyType =
  | 'fall_event'
  | 'seizure_like'
  | 'sustained_decline'
  | 'medication_pattern'
  | 'sleep_fragmentation'
  | 'hrv_depression'
  | 'pattern_match'

export type IntegrationStatus = 'live' | 'planned' | 'future'

export type DashboardView = 'triage_team' | 'neurologist'

// ── Data Interfaces (dependency order) ──

// Baseline metrics stored per-patient for anomaly detection
export interface BaselineMetrics {
  resting_hr: number
  hrv_rmssd: number
  avg_steps: number
  sleep_hours: number
  sleep_efficiency: number
  tremor_pct?: number
}

// Patient record with wearable monitoring context
export interface WearablePatient {
  id: string
  name: string
  age: number
  sex: string
  primary_diagnosis: string
  medications: string[]
  wearable_devices: string[]
  baseline_metrics: BaselineMetrics
  monitoring_start_date: string
}

// Daily biometric readings from wearable
export interface DailyMetrics {
  avg_hr: number
  resting_hr: number
  hrv_rmssd: number
  hrv_7day_avg: number
  total_steps: number
  steps_7day_avg: number
  sleep_hours: number
  sleep_deep: number
  sleep_rem: number
  sleep_light: number
  sleep_awake: number
  sleep_efficiency: number
  awakenings: number
  tremor_pct?: number
  dyskinetic_mins?: number
}

// Daily summary combining metrics + AI analysis
export interface DailySummary {
  id: string
  patient_id: string
  date: string
  metrics: DailyMetrics
  anomalies_detected: number
  ai_analysis: string
  overall_status: OverallStatus
}

// Detected anomaly with AI assessment
export interface WearableAnomaly {
  id: string
  patient_id: string
  detected_at: string
  anomaly_type: AnomalyType
  severity: AlertSeverity
  trigger_data: Record<string, unknown>
  ai_assessment: string
  ai_reasoning: string
  clinical_significance: string
  recommended_action: string
  patient_message: string | null
}

// Alert generated from an anomaly
export interface WearableAlert {
  id: string
  anomaly_id: string
  patient_id: string
  created_at: string
  alert_type: AlertType
  severity: AlertSeverity
  title: string
  body: string
  acknowledged: boolean
  escalated_to_md: boolean
  action_taken: string | null
}

// AI analysis response (matches playbook Section 6.4 output format)
export interface AIAnalysisResponse {
  analysis_period: string
  overall_status: OverallStatus
  narrative_summary: string
  anomalies: Array<{
    anomaly_type: AnomalyType
    severity: AlertSeverity
    description: string
    clinical_significance: string
    recommended_action: string
  }>
  trends_observed: string[]
  data_quality_notes: string[]
}

// Demo data bundle (returned by /api/wearable/demo-data)
export interface WearableDemoData {
  patient: WearablePatient
  dailySummaries: DailySummary[]
  anomalies: WearableAnomaly[]
  alerts: WearableAlert[]
}

// Clinical use case table row
export interface ClinicalUseCase {
  diagnosis: string
  wearable_signal: string
  anomaly_to_detect: string
  alert_trigger: string
  suggested_action: string
}

// Wearable device info
export interface WearableDevice {
  name: string
  image_icon: string
  data_types: string[]
  integration_status: IntegrationStatus
  priority: number
}

// ── Display Config Objects ──

export interface SeverityDisplayConfig {
  label: string
  color: string
  bgColor: string
  borderColor: string
}

export const SEVERITY_DISPLAY: Record<AlertSeverity, SeverityDisplayConfig> = {
  urgent: {
    label: 'Urgent',
    color: '#DC2626',
    bgColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  attention: {
    label: 'Attention',
    color: '#D97706',
    bgColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  informational: {
    label: 'Informational',
    color: '#2563EB',
    bgColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
}

export interface StatusDisplayConfig {
  label: string
  color: string
  bgColor: string
  borderColor: string
  icon: string
}

export const STATUS_DISPLAY: Record<OverallStatus, StatusDisplayConfig> = {
  normal: {
    label: 'Normal',
    color: '#16A34A',
    bgColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    icon: '✓',
  },
  watch: {
    label: 'Watch',
    color: '#2563EB',
    bgColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    icon: '◉',
  },
  concern: {
    label: 'Concern',
    color: '#D97706',
    bgColor: '#FFFBEB',
    borderColor: '#FDE68A',
    icon: '▲',
  },
  alert: {
    label: 'Alert',
    color: '#DC2626',
    bgColor: '#FEF2F2',
    borderColor: '#FECACA',
    icon: '!',
  },
}

export interface AlertTypeDisplayConfig {
  label: string
  description: string
  color: string
}

export const ALERT_TYPE_DISPLAY: Record<AlertType, AlertTypeDisplayConfig> = {
  patient_nudge: {
    label: 'Patient Nudge',
    description: 'Gentle reminder sent to the patient via app notification',
    color: '#2563EB',
  },
  clinician_notification: {
    label: 'Clinician Notification',
    description: 'Routed to triage team dashboard for review',
    color: '#D97706',
  },
  urgent_escalation: {
    label: 'Urgent Escalation',
    description: 'Immediate notification to neurologist with patient context',
    color: '#DC2626',
  },
  log_only: {
    label: 'Log Only',
    description: 'Recorded for trend analysis, no active notification',
    color: '#6B7280',
  },
}

export interface AnomalyTypeDisplayConfig {
  label: string
  description: string
}

export const ANOMALY_TYPE_DISPLAY: Record<AnomalyType, AnomalyTypeDisplayConfig> = {
  fall_event: {
    label: 'Fall Event',
    description: 'Accelerometer-detected fall with impact signature',
  },
  seizure_like: {
    label: 'Seizure-Like Activity',
    description: 'HR spike + accelerometer pattern consistent with seizure',
  },
  sustained_decline: {
    label: 'Sustained Decline',
    description: 'Progressive worsening across multiple metrics over days',
  },
  medication_pattern: {
    label: 'Medication Pattern',
    description: 'Metrics suggest medication timing or dosing changes',
  },
  sleep_fragmentation: {
    label: 'Sleep Fragmentation',
    description: 'Excessive awakenings or disrupted sleep architecture',
  },
  hrv_depression: {
    label: 'HRV Depression',
    description: 'Sustained drop in heart rate variability below baseline',
  },
  pattern_match: {
    label: 'Pattern Match',
    description: 'Recognized clinical pattern across multiple signals',
  },
}

export const INTEGRATION_STATUS_DISPLAY: Record<IntegrationStatus, { label: string; color: string; bgColor: string }> = {
  live: {
    label: 'Live',
    color: '#16A34A',
    bgColor: '#F0FDF4',
  },
  planned: {
    label: 'Planned',
    color: '#2563EB',
    bgColor: '#EFF6FF',
  },
  future: {
    label: 'Future',
    color: '#6B7280',
    bgColor: '#F9FAFB',
  },
}

// ── Wearable Devices ──

export const WEARABLE_DEVICES: WearableDevice[] = [
  {
    name: 'Samsung Galaxy Watch',
    image_icon: 'galaxy-watch',
    data_types: ['HR', 'HRV', 'Steps', 'Sleep', 'SpO2', 'Accelerometer', 'Fall Detection'],
    integration_status: 'live',
    priority: 1,
  },
  {
    name: 'Apple Watch',
    image_icon: 'apple-watch',
    data_types: ['HR', 'HRV', 'Steps', 'Sleep', 'SpO2', 'Accelerometer', 'Fall Detection', 'ECG'],
    integration_status: 'planned',
    priority: 2,
  },
  {
    name: 'Oura Ring',
    image_icon: 'oura-ring',
    data_types: ['HR', 'HRV', 'Sleep', 'Temperature', 'SpO2', 'Activity'],
    integration_status: 'future',
    priority: 3,
  },
]

// ── Clinical Use Cases (8 diagnoses from playbook Section 3) ──

export const CLINICAL_USE_CASES: ClinicalUseCase[] = [
  {
    diagnosis: "Parkinson's Disease",
    wearable_signal: 'Tremor %, dyskinetic minutes, step count, gait variability, fall detection',
    anomaly_to_detect: 'Increased tremor %, rising dyskinetic minutes, gait deterioration, fall events',
    alert_trigger: 'Tremor > 20% above baseline for 3+ days, any fall event, step count < 50% of baseline',
    suggested_action: 'Review medication timing; consider dose adjustment; assess fall risk; PT referral',
  },
  {
    diagnosis: 'Epilepsy',
    wearable_signal: 'HR spike + accelerometer pattern (seizure proxy), post-ictal sleep changes',
    anomaly_to_detect: 'Seizure-like events (HR surge + rhythmic movement), prolonged post-event inactivity',
    alert_trigger: 'Any seizure-like event detected, cluster of 2+ events in 24 hours',
    suggested_action: 'Verify with patient/caregiver; review seizure diary; assess AED levels; consider EEG',
  },
  {
    diagnosis: 'Multiple Sclerosis',
    wearable_signal: 'Fatigue index (steps + sleep efficiency), HR response to activity (heat sensitivity proxy)',
    anomaly_to_detect: 'Sustained fatigue increase, disproportionate HR rise with activity, sleep quality decline',
    alert_trigger: 'Fatigue index > 30% above baseline for 5+ days, activity drop > 40%',
    suggested_action: 'Screen for relapse vs. pseudorelapse; assess infection/UTI; consider MRI; review DMT adherence',
  },
  {
    diagnosis: 'Migraine',
    wearable_signal: 'HRV trends, sleep disruption patterns, activity level changes',
    anomaly_to_detect: 'Prodrome pattern: HRV dip + sleep disruption 24-48 hours before attack',
    alert_trigger: 'Recognized prodrome pattern detected, migraine frequency > 4/month',
    suggested_action: 'Patient nudge to take abortive early; review preventive adequacy; sleep hygiene counseling',
  },
  {
    diagnosis: 'Essential Tremor',
    wearable_signal: 'Tremor % tracking throughout the day, activity patterns',
    anomaly_to_detect: 'Tremor worsening trend, medication wear-off patterns, functional impact',
    alert_trigger: 'Tremor % increasing > 15% over 2 weeks, clear medication wear-off pattern',
    suggested_action: 'Review medication response; assess functional impact; consider dose timing adjustment',
  },
  {
    diagnosis: 'Restless Leg Syndrome',
    wearable_signal: 'Sleep fragmentation metrics, nighttime movement patterns, awakenings count',
    anomaly_to_detect: 'Excessive nighttime leg movements, sleep efficiency decline, increased awakenings',
    alert_trigger: 'Sleep efficiency < 70% for 5+ nights, awakenings > 2x baseline',
    suggested_action: 'Assess iron levels; review dopaminergic therapy; evaluate augmentation; sleep hygiene review',
  },
  {
    diagnosis: 'Narcolepsy',
    wearable_signal: 'Daytime inactivity episodes, sleep architecture analysis, step pattern gaps',
    anomaly_to_detect: 'Daytime microsleep episodes (sudden inactivity), fragmented nighttime sleep, irregular patterns',
    alert_trigger: 'Daytime inactivity episodes > 3/day, nighttime sleep efficiency < 65%',
    suggested_action: 'Review stimulant timing and dosing; assess sodium oxybate response; driving safety counseling',
  },
  {
    diagnosis: 'Peripheral Neuropathy',
    wearable_signal: 'Gait variability, fall risk indicators, activity level trending, step count',
    anomaly_to_detect: 'Increasing gait instability, declining activity levels, fall events',
    alert_trigger: 'Step count declining > 25% over 2 weeks, any fall event, gait variability increasing',
    suggested_action: 'Assess neuropathy progression; review glycemic control; PT/OT referral; assistive device evaluation',
  },
]

// ── String Constants ──

export const WEARABLE_DISCLAIMER_TEXT =
  'This system analyzes consumer wearable device data to identify patterns that may be clinically relevant. Consumer wearables are not medical devices and their measurements may not be accurate. All alerts are intended to support, not replace, clinical judgment.'

export const WEARABLE_POC_BANNER_TEXT =
  'Proof of Concept: This wearable monitoring dashboard uses simulated data to demonstrate AI-assisted pattern detection for neurological conditions. No real patient data is displayed.'

export const WEARABLE_DATA_QUALITY_NOTE =
  'Data quality depends on consistent device wear. Gaps in wear time may affect anomaly detection accuracy. Encourage patients to wear devices during sleep for best results.'
