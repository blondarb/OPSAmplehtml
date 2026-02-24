import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { WEARABLE_ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt } from '@/lib/wearable/systemPrompt'

export const maxDuration = 60

const AI_MODEL = 'gpt-5.2'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { patient_id, analysis_window_days = 7 } = body

    if (!patient_id) {
      return NextResponse.json({ error: 'patient_id is required.' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: patient } = await supabase
      .from('wearable_patients').select('*').eq('id', patient_id).single()
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found.' }, { status: 404 })
    }

    const { data: summaries } = await supabase
      .from('wearable_daily_summaries').select('*')
      .eq('patient_id', patient_id)
      .order('date', { ascending: false })
      .limit(analysis_window_days)

    const { data: existingAnomalies } = await supabase
      .from('wearable_anomalies').select('anomaly_type, severity, detected_at')
      .eq('patient_id', patient_id)
      .order('detected_at', { ascending: false })
      .limit(10)

    // Get OpenAI API key — check env first, then Supabase fallback
    let apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      try {
        const { data: setting } = await supabase.rpc('get_openai_key')
        apiKey = setting
      } catch { /* fallback not available */ }
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'AI API key not configured.' }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey })
    const sortedSummaries = (summaries || []).reverse()
    const dates = sortedSummaries.map(s => s.date)

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
    let completion
    try {
      completion = await openai.chat.completions.create(
        {
          model: AI_MODEL,
          messages: [
            { role: 'system', content: WEARABLE_ANALYSIS_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          max_completion_tokens: 4000,
          temperature: 0.2,
        },
        { signal: controller.signal }
      )
    } finally {
      clearTimeout(timeout)
    }

    const rawContent = completion.choices[0]?.message?.content
    if (!rawContent) {
      return NextResponse.json({ error: 'AI returned empty response.' }, { status: 500 })
    }

    let analysis
    try {
      analysis = JSON.parse(rawContent)
    } catch {
      return NextResponse.json({ error: 'AI returned invalid JSON.' }, { status: 500 })
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
