import { NextResponse } from 'next/server'
import { invokeBedrockClinicalJSON } from '@/lib/bedrock'
import { FUSION_SYSTEM_PROMPT, buildFusionUserPrompt } from '@/lib/triage/extractionPrompt'
import type { FusionResult } from '@/lib/triage/types'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'


export const maxDuration = 60

export async function POST(request: Request) {
  const access = await authorizeClinicalAccess({
    action: 'triage.fuse',
    allowedRoles: ['clinician', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: 'Access denied', reason: access.reason },
      { status: access.status },
    )
  }

  try {
    const body = await request.json()
    const { extractions, patient_age, patient_sex } = body

    if (!extractions || !Array.isArray(extractions) || extractions.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 extractions are required for fusion.' },
        { status: 400 }
      )
    }
    if (
      extractions.length > 20 ||
      extractions.some(
        (extraction: unknown) =>
          !extraction ||
          typeof extraction !== 'object' ||
          typeof (extraction as Record<string, unknown>).extracted_summary !==
            'string' ||
          ((extraction as Record<string, unknown>).extracted_summary as string)
            .length > 10_000,
      )
    ) {
      return NextResponse.json(
        { error: 'Fusion sources exceed the verified input limits.' },
        { status: 400 },
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
      const result = await invokeBedrockClinicalJSON<typeof aiResponse>({
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
      console.error('[triage/fuse] clinical output failed validation')
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
    console.error('[triage/fuse] request failed')

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Fusion is taking longer than expected. Please try again.' },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: 'An error occurred during fusion' },
      { status: 500 },
    )
  }
}
