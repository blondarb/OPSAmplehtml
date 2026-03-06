import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { from } from '@/lib/db-query'

export const maxDuration = 120  // Edge Function runs a 2-stage AI pipeline

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(request: Request) {
  try {
    const { type, patient_id, assessment_id } = await request.json()

    if (!type || !patient_id) {
      return NextResponse.json({ error: 'type and patient_id are required.' }, { status: 400 })
    }

    if (type !== 'longitudinal' && !assessment_id) {
      return NextResponse.json({ error: 'assessment_id is required for non-longitudinal analysis.' }, { status: 400 })
    }


    // Fetch the assessment data from DB based on type
    let assessmentData: Record<string, unknown> = {}

    if (type === 'tremor') {
      const { data, error } = await from('wearable_tremor_assessments')
        .select('*')
        .eq('id', assessment_id)
        .single()
      if (error || !data) {
        return NextResponse.json({ error: 'Tremor assessment not found.' }, { status: 404 })
      }
      assessmentData = {
        tasks: data.tasks,
        composite_score: data.composite_score,
        composite_intensity: data.composite_intensity,
      }
    } else if (type === 'tapping') {
      const { data, error } = await from('wearable_tapping_assessments')
        .select('*')
        .eq('id', assessment_id)
        .single()
      if (error || !data) {
        return NextResponse.json({ error: 'Tapping assessment not found.' }, { status: 404 })
      }
      assessmentData = {
        hands: data.hands,
        composite_score: data.composite_score,
        asymmetry_index: data.asymmetry_index,
      }
    } else if (type === 'fluency') {
      const { data, error } = await from('wearable_fluency_assessments')
        .select('*')
        .eq('id', assessment_id)
        .single()
      if (error || !data) {
        return NextResponse.json({ error: 'Fluency assessment not found.' }, { status: 404 })
      }
      assessmentData = {
        category: data.category,
        transcript: data.transcript,
        word_list: data.word_list,
        quartile_words: data.quartile_words,
      }
    } else if (type !== 'longitudinal') {
      return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 })
    }

    // Call the Supabase Edge Function
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 90000) // 90s timeout

    let edgeResult
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-assessment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'X-OpenAI-Key': process.env.OPENAI_API_KEY || '',
        },
        body: JSON.stringify({
          type,
          patient_id,
          assessment_id: assessment_id || null,
          data: assessmentData,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errBody = await res.text()
        console.error('Edge Function error:', res.status, errBody)
        return NextResponse.json(
          { error: `AI analysis failed: ${errBody}` },
          { status: res.status }
        )
      }

      edgeResult = await res.json()
    } finally {
      clearTimeout(timeout)
    }

    return NextResponse.json({
      success: true,
      type,
      ...edgeResult,
    })

  } catch (error: unknown) {
    console.error('Analyze-assessment API error:', error)
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: 'AI analysis timed out. Please try again.' }, { status: 504 })
    }
    const message = error instanceof Error ? error.message : 'An error occurred during analysis.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
