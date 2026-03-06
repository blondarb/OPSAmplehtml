import { NextResponse } from 'next/server'
import { invokeBedrockJSON } from '@/lib/bedrock'
import { WEARABLE_ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt } from '@/lib/wearable/systemPrompt'
import { from } from '@/lib/db-query'


export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { patient_id, analysis_window_days = 7 } = body

    if (!patient_id) {
      return NextResponse.json({ error: 'patient_id is required.' }, { status: 400 })
    }

    const { data: patient } = await from('wearable_patients').select('*').eq('id', patient_id).single()
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found.' }, { status: 404 })
    }

    const { data: summaries } = await from('wearable_daily_summaries').select('*')
      .eq('patient_id', patient_id)
      .order('date', { ascending: false })
      .limit(analysis_window_days)

    const { data: existingAnomalies } = await from('wearable_anomalies').select('anomaly_type, severity, detected_at')
      .eq('patient_id', patient_id)
      .order('detected_at', { ascending: false })
      .limit(10)

    const sortedSummaries = (summaries || []).reverse()
    const dates = sortedSummaries.map((s: any) => s.date)

    const userPrompt = buildAnalysisUserPrompt({
      name: patient.name,
      age: patient.age,
      sex: patient.sex,
      primary_diagnosis: patient.primary_diagnosis,
      medications: patient.medications || [],
      baseline_metrics: patient.baseline_metrics || {},
      start_date: dates[0] || '',
      end_date: dates[dates.length - 1] || '',
      daily_summaries: sortedSummaries,
      rule_based_alerts: existingAnomalies || [],
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 45000)

    let analysis: Record<string, unknown>
    try {
      const result = await invokeBedrockJSON({
        system: WEARABLE_ANALYSIS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 4000,
        temperature: 0.2,
        signal: controller.signal,
      })
      analysis = result.parsed
    } finally {
      clearTimeout(timeout)
    }

    return NextResponse.json(analysis)

  } catch (error: unknown) {
    console.error('Wearable analyze API Error:', error)
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: 'AI analysis timed out. Please try again.' }, { status: 504 })
    }
    const message = error instanceof Error ? error.message : 'An error occurred during analysis.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
