import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Normalize metrics from iOS app format to web dashboard format
function normalizeMetrics(raw: Record<string, unknown>): Record<string, unknown> {
  const avgHr = Number(raw.avg_hr) || 0
  const rawRestingHr = Number(raw.resting_hr)
  const restingHr = (rawRestingHr > 0) ? rawRestingHr : null  // 0 means HealthKit had no data

  const sleepHours = Number(raw.sleep_hours) || 0
  const sleepEfficiency = Number(raw.sleep_efficiency) || 0
  const noSleepData = sleepHours === 0 && sleepEfficiency === 0

  // Check if sleep stage breakdown is available
  const sleepDeep = Number(raw.sleep_deep) || 0
  const sleepRem = Number(raw.sleep_rem) || 0
  const sleepLight = Number(raw.sleep_light) || 0
  const sleepAwake = Number(raw.sleep_awake) || 0
  const hasStages = (sleepDeep + sleepRem + sleepLight + sleepAwake) > 0

  const totalSteps = Number(raw.total_steps) || Number(raw.daily_steps) || 0

  return {
    avg_hr: avgHr,
    resting_hr: restingHr,
    hrv_rmssd: Number(raw.hrv_rmssd) || 0,
    hrv_7day_avg: 0,       // placeholder — computed in rolling avg pass
    total_steps: totalSteps,
    steps_7day_avg: 0,     // placeholder — computed in rolling avg pass
    // Sleep fields
    sleep_hours: noSleepData ? null : sleepHours,
    sleep_deep: noSleepData ? null : (hasStages ? sleepDeep : null),
    sleep_rem: noSleepData ? null : (hasStages ? sleepRem : null),
    sleep_light: noSleepData ? null : (hasStages ? sleepLight : null),
    sleep_awake: noSleepData ? null : (hasStages ? sleepAwake : null),
    sleep_total: noSleepData ? null : (!hasStages && sleepHours > 0 ? sleepHours : null),
    sleep_efficiency: noSleepData ? null : sleepEfficiency,
    awakenings: noSleepData ? null : (Number(raw.awakenings) || 0),
    // Disease-specific (preserve as-is)
    tremor_pct: raw.tremor_pct != null ? Number(raw.tremor_pct) : undefined,
    dyskinetic_mins: raw.dyskinetic_mins != null ? Number(raw.dyskinetic_mins) : undefined,
    // iOS-specific
    spo2_avg: raw.spo2_avg != null ? Number(raw.spo2_avg) : undefined,
    spo2_min: raw.spo2_min != null ? Number(raw.spo2_min) : undefined,
    active_calories: raw.active_calories != null ? Number(raw.active_calories) : undefined,
  }
}

// Compute rolling 7-day averages for steps and HRV
function computeRollingAverages(summaries: Array<Record<string, unknown>>): void {
  for (let i = 0; i < summaries.length; i++) {
    const metrics = summaries[i].metrics as Record<string, unknown>
    const windowStart = Math.max(0, i - 6)
    const window = summaries.slice(windowStart, i + 1)

    // Steps rolling avg
    const stepValues = window
      .map(s => Number((s.metrics as Record<string, unknown>).total_steps) || 0)
      .filter(v => v > 0)
    metrics.steps_7day_avg = stepValues.length > 0
      ? Math.round(stepValues.reduce((a, b) => a + b, 0) / stepValues.length)
      : 0

    // HRV rolling avg
    const hrvValues = window
      .map(s => Number((s.metrics as Record<string, unknown>).hrv_rmssd) || 0)
      .filter(v => v > 0)
    metrics.hrv_7day_avg = hrvValues.length > 0
      ? Math.round(hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length * 10) / 10
      : 0
  }
}

// Auto-compute baselines from actual data when patient baselines are all zeros
function computeBaselineFromData(
  patient: Record<string, unknown>,
  summaries: Array<Record<string, unknown>>
): Record<string, unknown> {
  const baseline = (patient.baseline_metrics as Record<string, unknown>) || {}

  // Check if baselines are all zeros
  const hasBaseline = (Number(baseline?.resting_hr) || 0) > 0 ||
                      (Number(baseline?.hrv_rmssd) || 0) > 0 ||
                      (Number(baseline?.avg_steps || baseline?.daily_steps) || 0) > 0 ||
                      (Number(baseline?.sleep_hours) || 0) > 0

  if (hasBaseline || summaries.length < 3) {
    return baseline
  }

  // Compute from actual data, excluding zeros/nulls
  const avg = (vals: number[]) => {
    const valid = vals.filter(v => v > 0)
    return valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length * 10) / 10 : 0
  }

  const metrics = summaries.map(s => s.metrics as Record<string, unknown>)

  return {
    ...baseline,
    resting_hr: avg(metrics.map(m => Number(m.resting_hr) || 0)),
    hrv_rmssd: avg(metrics.map(m => Number(m.hrv_rmssd) || 0)),
    avg_steps: avg(metrics.map(m => Number(m.total_steps) || 0)),
    sleep_hours: avg(metrics.map(m => Number(m.sleep_hours) || 0)),
    sleep_efficiency: avg(metrics.map(m => Number(m.sleep_efficiency) || 0)),
    tremor_pct: baseline?.tremor_pct,
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const patientId = request.nextUrl.searchParams.get('patient_id')

    let patient
    if (patientId) {
      const { data, error } = await supabase
        .from('wearable_patients')
        .select('*')
        .eq('id', patientId)
        .single()
      if (error) throw error
      patient = data
    } else {
      const { data, error } = await supabase
        .from('wearable_patients')
        .select('*')
        .eq('name', 'Linda Martinez')
        .limit(1)
      if (error) throw error
      if (!data || data.length === 0) {
        return NextResponse.json(
          { error: 'Demo patient not found. Run npm run seed:wearable first.' },
          { status: 404 }
        )
      }
      patient = data[0]
    }

    const [summariesRes, anomaliesRes, alertsRes, assessmentsRes] = await Promise.all([
      supabase.from('wearable_daily_summaries').select('*').eq('patient_id', patient.id).order('date', { ascending: true }),
      supabase.from('wearable_anomalies').select('*').eq('patient_id', patient.id).order('detected_at', { ascending: true }),
      supabase.from('wearable_alerts').select('*').eq('patient_id', patient.id).order('created_at', { ascending: true }),
      supabase.from('wearable_tremor_assessments').select('*').eq('patient_id', patient.id).order('assessed_at', { ascending: true }),
    ])

    // Normalize metrics in each daily summary
    const dailySummaries = (summariesRes.data || []).map((s: Record<string, unknown>) => ({
      ...s,
      metrics: normalizeMetrics(s.metrics as Record<string, unknown>),
    }))

    // Compute rolling 7-day averages for steps and HRV
    computeRollingAverages(dailySummaries)

    // Auto-compute baselines if patient's are all zeros
    const effectiveBaseline = computeBaselineFromData(patient, dailySummaries)
    const patientWithBaseline = { ...patient, baseline_metrics: effectiveBaseline }

    return NextResponse.json({
      patient: patientWithBaseline,
      dailySummaries,
      anomalies: anomaliesRes.data || [],
      alerts: alertsRes.data || [],
      assessments: assessmentsRes.data || [],
    })
  } catch (error: unknown) {
    console.error('Wearable demo-data API Error:', error)
    const message = error instanceof Error ? error.message : 'An error occurred loading demo data.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
