import { NextResponse } from 'next/server'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'
import { computeCoverageGaps } from '@/lib/historian/eval/coverageGate'

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown
  try {
    const raw = await req.text()
    if (raw.length > 200_000) {
      return NextResponse.json({ error: 'Body exceeds 200000 characters' }, { status: 400 })
    }
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'transcript array is required' }, { status: 400 })
  }
  const { transcript, chiefComplaint } = body as Record<string, unknown>
  if (!Array.isArray(transcript) || transcript.length > 400 ||
      (chiefComplaint !== undefined && typeof chiefComplaint !== 'string') ||
      !transcript.every(turn => turn && typeof turn === 'object' &&
        (turn.role === 'assistant' || turn.role === 'user') && typeof turn.text === 'string' &&
        typeof turn.timestamp === 'number' && Number.isFinite(turn.timestamp) &&
        (turn.seq === undefined || (Number.isInteger(turn.seq) && turn.seq >= 0)))) {
    return NextResponse.json({ error: 'Invalid transcript or chiefComplaint (maximum 400 turns)' }, { status: 400 })
  }
  try {
    return NextResponse.json(computeCoverageGaps(transcript as HistorianTranscriptEntry[], chiefComplaint))
  } catch {
    return NextResponse.json({ error: 'Coverage check failed' }, { status: 500 })
  }
}
