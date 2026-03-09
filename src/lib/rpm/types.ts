// RPM Multi-Device Dashboard Types

export interface ConnectedDevice {
  id: string
  patient_id: string
  device_type: string // 'apple_watch' | 'oura_ring' | 'withings' | 'dexcom_cgm' | 'whoop_band'
  device_name: string | null
  connection_status: string // 'active' | 'needs_reauth' | 'revoked' | 'pending'
  last_sync_at: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface VitalsReading {
  id: string
  reading_time: string
  reading_type: string // 'blood_pressure' | 'weight' | 'temperature' | 'spo2' | 'heart_rate' | 'body_fat_pct'
  value_json: {
    value?: number
    systolic?: number
    diastolic?: number
    heart_rate?: number
    unit: string
  }
  source_device: string
  attrib: number | null
  created_at: string
}

export interface GlucoseReading {
  id: string
  reading_time: string
  value_mgdl: number
  trend: string // 'rising_rapidly' | 'rising' | 'stable' | 'falling' | 'falling_rapidly' | 'unavailable'
  trend_rate: number | null
  source_device: string
  created_at: string
}

export interface BillingPeriod {
  id: string
  patient_id: string
  period_start: string
  period_end: string
  days_with_data: number
  eligible_for_99454: boolean
  status: string // 'active' | 'closed'
  created_at: string
  updated_at: string
}

export interface ClinicalAlert {
  id: string
  patient_id: string
  detected_at: string
  anomaly_type: string
  severity: string // 'critical' | 'warning' | 'informational'
  trigger_data: Record<string, unknown>
  details: Record<string, unknown>
  clinical_significance: string
  source_device: string
}

export interface GlucoseStats {
  timeInRange: number
  timeLow: number
  timeHigh: number
  timeUrgentLow: number
  timeVeryHigh: number
  averageGlucose: number
  gmi: number
  cv: number
  readingCount: number
}

export interface RPMPatientSummary {
  id: string
  name: string
  age: number
  sex: string
  primary_diagnosis: string
  source: string
}

export function computeGlucoseStats(readings: GlucoseReading[]): GlucoseStats {
  if (readings.length === 0) {
    return { timeInRange: 0, timeLow: 0, timeHigh: 0, timeUrgentLow: 0, timeVeryHigh: 0, averageGlucose: 0, gmi: 0, cv: 0, readingCount: 0 }
  }
  const values = readings.map(r => r.value_mgdl)
  const total = values.length
  const urgentLow = values.filter(v => v < 54).length
  const low = values.filter(v => v >= 54 && v < 70).length
  const inRange = values.filter(v => v >= 70 && v <= 180).length
  const high = values.filter(v => v > 180 && v <= 250).length
  const veryHigh = values.filter(v => v > 250).length
  const avg = values.reduce((a, b) => a + b, 0) / total
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / total
  const sd = Math.sqrt(variance)
  return {
    timeInRange: (inRange / total) * 100,
    timeLow: (low / total) * 100,
    timeHigh: (high / total) * 100,
    timeUrgentLow: (urgentLow / total) * 100,
    timeVeryHigh: (veryHigh / total) * 100,
    averageGlucose: Math.round(avg),
    gmi: +(3.31 + 0.02392 * avg).toFixed(1), // estimated A1C
    cv: +((sd / avg) * 100).toFixed(1),
    readingCount: total,
  }
}

export const DEVICE_LABELS: Record<string, string> = {
  apple_watch: 'Apple Watch',
  oura_ring: 'Oura Ring',
  withings: 'Withings',
  withings_scale: 'Withings Scale',
  dexcom_cgm: 'Dexcom CGM',
  whoop_band: 'WHOOP Band',
}

export const DEVICE_COLORS: Record<string, string> = {
  apple_watch: '#10B981',
  oura_ring: '#8B5CF6',
  withings: '#3B82F6',
  withings_scale: '#3B82F6',
  dexcom_cgm: '#F59E0B',
  whoop_band: '#EC4899',
}

export const SEVERITY_COLORS: Record<string, string> = {
  critical: '#DC2626',
  warning: '#F59E0B',
  informational: '#3B82F6',
}

export const TREND_ARROWS: Record<string, string> = {
  rising_rapidly: '⬆⬆',
  rising: '↑',
  rising_slightly: '↗',
  stable: '→',
  falling_slightly: '↘',
  falling: '↓',
  falling_rapidly: '⬇⬇',
  unavailable: '—',
}
