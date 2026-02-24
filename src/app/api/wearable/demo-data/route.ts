import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: patients, error: pErr } = await supabase
      .from('wearable_patients')
      .select('*')
      .eq('name', 'Linda Martinez')
      .limit(1)
    if (pErr) throw pErr
    if (!patients || patients.length === 0) {
      return NextResponse.json({ error: 'Demo patient not found. Run npm run seed:wearable first.' }, { status: 404 })
    }
    const patient = patients[0]

    const [summariesRes, anomaliesRes, alertsRes] = await Promise.all([
      supabase.from('wearable_daily_summaries').select('*').eq('patient_id', patient.id).order('date', { ascending: true }),
      supabase.from('wearable_anomalies').select('*').eq('patient_id', patient.id).order('detected_at', { ascending: true }),
      supabase.from('wearable_alerts').select('*').eq('patient_id', patient.id).order('created_at', { ascending: true }),
    ])

    return NextResponse.json({
      patient,
      dailySummaries: summariesRes.data || [],
      anomalies: anomaliesRes.data || [],
      alerts: alertsRes.data || [],
    })
  } catch (error: unknown) {
    console.error('Wearable demo-data API Error:', error)
    const message = error instanceof Error ? error.message : 'An error occurred loading demo data.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
