/**
 * POST /api/ai/historian/sim/score/thoroughness — thoroughness stage.
 *
 * Body: { persona, transcript: {role,text}[] }
 * Returns: { thoroughness: { result, modelId, costUsd } }
 *
 * Its own request so the (heavy Sonnet) thoroughness call doesn't share a
 * request with ground-truth adjudication — together they exceeded the ~30s
 * gateway (finalize was 504'ing). Live scoring is now:
 * differential -> summary -> thoroughness -> finalize. Synthetic only.
 */

import { NextResponse } from 'next/server'
import { requireSimUser } from '@/lib/historian/simAuth'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

export const maxDuration = 120

export async function POST(request: Request) {
  const denied = await requireSimUser()
  if (denied) return denied

  try {
    const body = await request.json().catch(() => null)
    const persona = typeof body?.persona === 'string' ? body.persona.replace(/\.json$/, '').trim() : ''
    const raw = Array.isArray(body?.transcript) ? body.transcript : []
    if (!persona) return NextResponse.json({ error: 'persona is required' }, { status: 400 })
    if (raw.length === 0) return NextResponse.json({ error: 'transcript is required' }, { status: 400 })

    const transcript: HistorianTranscriptEntry[] = raw
      .filter((t: any) => t && (t.role === 'assistant' || t.role === 'user') && typeof t.text === 'string')
      .map((t: any, i: number) => ({ role: t.role, text: t.text, timestamp: i, seq: i + 1 }))

    const { buildPersonaTranscript } = await import('@/lib/historian/eval/personaFixtures')
    let chiefComplaint: string | undefined
    try {
      chiefComplaint = buildPersonaTranscript(persona).chiefComplaint || undefined
    } catch {
      chiefComplaint = undefined
    }

    // Non-fatal: if thoroughness fails, return nulls so the run still persists.
    try {
      const { generateThoroughnessEvaluationWithUsage } = await import('@/lib/historian/eval/thoroughnessJudge')
      const { computeCostUsd } = await import('@/lib/historian/eval/constants')
      const { evaluation, usage } = await generateThoroughnessEvaluationWithUsage(transcript, {
        chiefComplaint,
        syndrome: persona,
        structuredOutput: null,
        narrativeSummary: null,
      })
      return NextResponse.json({
        thoroughness: {
          result: evaluation,
          modelId: evaluation.provenance.model_id,
          costUsd: computeCostUsd(evaluation.provenance.model_id, usage),
        },
      })
    } catch (err) {
      console.error('[sim/score/thoroughness] failed (non-fatal):', err)
      return NextResponse.json({ thoroughness: { result: null, modelId: null, costUsd: null } })
    }
  } catch (error: any) {
    console.error('Historian sim score/thoroughness error:', error)
    return NextResponse.json({ error: error?.message || 'Thoroughness failed' }, { status: 500 })
  }
}
