import { NextResponse } from 'next/server'
import { invokeBedrockJSON, invokeBedrock, BEDROCK_MODEL } from '@/lib/bedrock'
import { from } from '@/lib/db-query'

export const maxDuration = 120  // 2-stage AI pipeline

// ── System prompts for the 2-stage clinical narrative pipeline ──

const STAGE1_SYSTEM = `You are a clinical data extraction AI. Analyze raw wearable assessment data and produce a structured clinical summary.

For each assessment type, extract:
- key_findings: Array of 3-5 concise clinical findings
- pattern_analysis: What patterns are evident in the data
- baseline_comparison: How results compare to expected norms
- clinical_considerations: What a neurologist should consider
- trend_context: How this fits into the patient's trajectory
- severity_flags: Array of { metric, level, note } where level is "green" | "yellow" | "orange" | "red"

Respond with ONLY valid JSON matching this schema:
{
  "key_findings": ["string"],
  "pattern_analysis": "string",
  "baseline_comparison": "string",
  "clinical_considerations": "string",
  "trend_context": "string",
  "severity_flags": [{ "metric": "string", "level": "green|yellow|orange|red", "note": "string" }]
}`

const STAGE2_SYSTEM = `You are a clinical narrative generator for neurology. Given a structured summary of wearable assessment data, write a concise clinical narrative suitable for chart documentation.

Requirements:
- Write 2-4 sentences in clinical documentation style
- Reference specific metrics and their clinical significance
- Note any concerning patterns or severity flags
- Use language appropriate for a neurology progress note
- Do NOT diagnose or recommend specific medications
- DO flag findings that warrant clinical attention

Respond with ONLY the narrative text (no JSON, no markdown).`

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
    } else if (type === 'longitudinal') {
      // Longitudinal: gather all recent assessments for the patient
      const [tremors, tappings, fluencies] = await Promise.all([
        from('wearable_tremor_assessments').select('*').eq('patient_id', patient_id).order('assessed_at', { ascending: false }).limit(5),
        from('wearable_tapping_assessments').select('*').eq('patient_id', patient_id).order('assessed_at', { ascending: false }).limit(5),
        from('wearable_fluency_assessments').select('*').eq('patient_id', patient_id).order('assessed_at', { ascending: false }).limit(5),
      ])
      assessmentData = {
        tremor_assessments: tremors.data || [],
        tapping_assessments: tappings.data || [],
        fluency_assessments: fluencies.data || [],
      }
    } else {
      return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 })
    }

    // ── Stage 1: Structured extraction ──
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 90000)

    let structuredSummary: Record<string, unknown>
    let clinicalNarrative: string

    try {
      const stage1 = await invokeBedrockJSON<Record<string, unknown>>({
        system: STAGE1_SYSTEM,
        messages: [{
          role: 'user',
          content: `Assessment type: ${type}\n\nRaw data:\n${JSON.stringify(assessmentData, null, 2)}`,
        }],
        maxTokens: 2000,
        temperature: 0.2,
        signal: controller.signal,
      })
      structuredSummary = stage1.parsed

      // ── Stage 2: Clinical narrative ──
      const stage2 = await invokeBedrock({
        system: STAGE2_SYSTEM,
        messages: [{
          role: 'user',
          content: `Assessment type: ${type}\n\nStructured summary:\n${JSON.stringify(structuredSummary, null, 2)}`,
        }],
        maxTokens: 500,
        temperature: 0.3,
        signal: controller.signal,
      })
      clinicalNarrative = stage2.text.trim()
    } finally {
      clearTimeout(timeout)
    }

    // ── Store in wearable_clinical_narratives ──
    const { error: insertError } = await from('wearable_clinical_narratives')
      .insert({
        patient_id,
        narrative_type: type,
        assessment_id: assessment_id || null,
        structured_summary: structuredSummary,
        clinical_narrative: clinicalNarrative,
        model_versions: { stage1: BEDROCK_MODEL, stage2: BEDROCK_MODEL },
      })

    if (insertError) {
      console.error('Failed to store narrative:', insertError)
      // Non-fatal — still return the result even if storage fails
    }

    return NextResponse.json({
      success: true,
      type,
      structured_summary: structuredSummary,
      clinical_narrative: clinicalNarrative,
      model_versions: { stage1: BEDROCK_MODEL, stage2: BEDROCK_MODEL },
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
