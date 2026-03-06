import { NextResponse } from 'next/server'
import { invokeBedrockJSON } from '@/lib/bedrock'
import { getUser } from '@/lib/cognito/server'
import { FUSION_SYSTEM_PROMPT, buildFusionUserPrompt } from '@/lib/triage/extractionPrompt'
import type { FusionResult } from '@/lib/triage/types'


export const maxDuration = 60

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

    const userPrompt = buildFusionUserPrompt(extractions, {
      patientAge: patient_age,
      patientSex: patient_sex,
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    let aiResponse: Omit<FusionResult, 'fusion_group_id'>
    try {
      const result = await invokeBedrockJSON<typeof aiResponse>({
        system: FUSION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 3000,
        temperature: 0.2,
        signal: controller.signal,
      })
      aiResponse = result.parsed
    } catch (parseErr) {
      if (parseErr instanceof Error && parseErr.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Fusion is taking longer than expected. Please try again.' },
          { status: 504 }
        )
      }
      console.error('Failed to parse fusion response:', parseErr)
      return NextResponse.json(
        { error: 'The fusion system returned an invalid response. Please try again.' },
        { status: 500 }
      )
    } finally {
      clearTimeout(timeout)
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
