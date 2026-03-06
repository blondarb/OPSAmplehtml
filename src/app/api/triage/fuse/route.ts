import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { FUSION_SYSTEM_PROMPT, buildFusionUserPrompt } from '@/lib/triage/extractionPrompt'
import type { FusionResult } from '@/lib/triage/types'
import { getOpenAIKey } from '@/lib/db-query'


export const maxDuration = 60

const AI_MODEL = 'gpt-5.2'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { extractions, patient_age, patient_sex } = body

    if (!extractions || !Array.isArray(extractions) || extractions.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 extractions are required for fusion.' },
        { status: 400 }
      )
    }

    // Get API key
    let apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      try {
        const { data: setting } = await getOpenAIKey()
        apiKey = setting
      } catch { /* demo mode */ }
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured.' }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey })

    const userPrompt = buildFusionUserPrompt(extractions, {
      patientAge: patient_age,
      patientSex: patient_sex,
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    let completion
    try {
      completion = await openai.chat.completions.create(
        {
          model: AI_MODEL,
          messages: [
            { role: 'system', content: FUSION_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          max_completion_tokens: 3000,
          temperature: 0.2,
        },
        { signal: controller.signal }
      )
    } finally {
      clearTimeout(timeout)
    }

    const rawContent = completion.choices[0]?.message?.content
    if (!rawContent) {
      return NextResponse.json(
        { error: 'The fusion system returned no response. Please try again.' },
        { status: 500 }
      )
    }

    let aiResponse: Omit<FusionResult, 'fusion_group_id'>
    try {
      aiResponse = JSON.parse(rawContent)
    } catch {
      console.error('Failed to parse fusion response:', rawContent)
      return NextResponse.json(
        { error: 'The fusion system returned an invalid response. Please try again.' },
        { status: 500 }
      )
    }

    const result: FusionResult = {
      fusion_group_id: crypto.randomUUID(),
      fused_summary: aiResponse.fused_summary,
      fusion_confidence: aiResponse.fusion_confidence,
      sources_used: aiResponse.sources_used,
      conflicts_resolved: aiResponse.conflicts_resolved,
      timeline_reconstructed: aiResponse.timeline_reconstructed,
    }

    return NextResponse.json(result)
  } catch (error: unknown) {
    console.error('Fusion API Error:', error)

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Fusion is taking longer than expected. Please try again.' },
        { status: 504 }
      )
    }

    const message = error instanceof Error ? error.message : 'An error occurred during fusion'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
