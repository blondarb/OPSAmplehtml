/**
 * POST /api/ai/historian/sim/score/differential — stage 1 of live scoring.
 *
 * Body: { persona, transcript: {role,text}[] }
 * Returns: { differential: FinalDifferential }
 *
 * Split out from the old monolithic /sim/score so each scoring request stays
 * under the ~30s Amplify gateway timeout (the full pipeline in one request
 * 504'd on long live transcripts). This runs only the differential pass;
 * /sim/score/finalize does thoroughness + ground-truth + persist.
 *
 * Synthetic only. Incurs Bedrock cost.
 */

import { NextResponse } from 'next/server'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

export const maxDuration = 120

export async function POST(request: Request) {
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
      return NextResponse.json({ error: `Unknown persona "${persona}".` }, { status: 400 })
    }

    const { generateFinalDifferential } = await import('@/lib/historian/eval/finalDifferential')
    const differential = await generateFinalDifferential(transcript, chiefComplaint)

    return NextResponse.json({ differential })
  } catch (error: any) {
    console.error('Historian sim score/differential error:', error)
    return NextResponse.json({ error: error?.message || 'Differential scoring failed' }, { status: 500 })
  }
}
