import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Normalize metrics from iOS app format to web dashboard format
function normalizeMetrics(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    avg_hr: raw.avg_hr ?? 0,
    resting_hr: raw.resting_hr ?? 0,
    hrv_rmssd: raw.hrv_rmssd ?? 0,
    hrv_7day_avg: raw.hrv_7day_avg ?? raw.hrv_rmssd ?? 0,
    total_steps: raw.total_steps ?? raw.daily_steps ?? 0,
    steps_7day_avg: raw.steps_7day_avg ?? raw.total_steps ?? raw.daily_steps ?? 0,
    sleep_hours: raw.sleep_hours ?? 0,
    sleep_deep: raw.sleep_deep ?? 0,
    sleep_rem: raw.sleep_rem ?? 0,
    sleep_light: raw.sleep_light ?? 0,
    sleep_awake: raw.sleep_awake ?? 0,
    sleep_efficiency: raw.sleep_efficiency ?? 0,
    awakenings: raw.awakenings ?? 0,
    tremor_pct: raw.tremor_pct ?? undefined,
    dyskinetic_mins: raw.dyskinetic_mins ?? undefined,
    // Preserve iOS-specific fields for display
    spo2_avg: raw.spo2_avg ?? undefined,
    spo2_min: raw.spo2_min ?? undefined,
    active_calories: raw.active_calories ?? undefined,
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

    const [summariesRes, anomaliesRes, alertsRes] = await Promise.all([
      supabase.from('wearable_daily_summaries').select('*').eq('patient_id', patient.id).order('date', { ascending: true }),
      supabase.from('wearable_anomalies').select('*').eq('patient_id', patient.id).order('detected_at', { ascending: true }),
      supabase.from('wearable_alerts').select('*').eq('patient_id', patient.id).order('created_at', { ascending: true }),
    ])

    // Normalize metrics in each daily summary
    const dailySummaries = (summariesRes.data || []).map((s: Record<string, unknown>) => ({
      ...s,
      metrics: normalizeMetrics(s.metrics as Record<string, unknown>),
    }))

    return NextResponse.json({
      patient,
      dailySummaries,
      anomalies: anomaliesRes.data || [],
      alerts: alertsRes.data || [],
    })
  } catch (error: unknown) {
    console.error('Wearable demo-data API Error:', error)
    const message = error instanceof Error ? error.message : 'An error occurred loading demo data.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
