/**
 * POST /api/ai/historian/sim/score/summary — in-depth physician summary stage.
 *
 * Body: { persona, transcript: {role,text}[], differential }
 *   `differential` = the SimDifferential from /sim/score/differential.
 * Returns: { physician_summary: { one_liner, hpi, assessment, workup } }
 *
 * Its own request (between differential and finalize) so no single call
 * approaches the ~30s gateway timeout. Synthetic only. Incurs Bedrock cost.
 */

import { NextResponse } from 'next/server'
import { requireSimUser } from '@/lib/historian/simAuth'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

export const maxDuration = 60

export async function POST(request: Request) {
  const denied = await requireSimUser()
  if (denied) return denied

  try {
    const body = await request.json().catch(() => null)
    const persona = typeof body?.persona === 'string' ? body.persona.replace(/\.json$/, '').trim() : ''
    const raw = Array.isArray(body?.transcript) ? body.transcript : []
    const differential = body?.differential ?? null
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

    const { generateSimPhysicianSummary } = await import('@/lib/historian/sim/simPhysicianSummary')
    const physician_summary = await generateSimPhysicianSummary(transcript, differential, chiefComplaint)

    return NextResponse.json({ physician_summary })
  } catch (error: any) {
    console.error('Historian sim score/summary error:', error)
    return NextResponse.json({ error: error?.message || 'Physician summary failed' }, { status: 500 })
  }
}
