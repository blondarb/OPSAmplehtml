/**
 * POST /api/ai/historian/sim/patient-turn — one synthetic-patient turn.
 *
 * Body: { persona: string, conversation: {role,text}[] }
 *   conversation is the transcript so far (role 'assistant' = Henry,
 *   'user' = patient), ending with Henry's latest question.
 * Returns: { text }  (the patient's reply)
 *
 * Thin wrapper over the tested patient agent (generatePatientReply), which
 * role-plays the persona from its ground-truth facts + lay belief +
 * personality. Synthetic-only. Incurs Bedrock cost.
 */

import { NextResponse } from 'next/server'
import { requireSimUser } from '@/lib/historian/simAuth'

export const maxDuration = 60

export async function POST(request: Request) {
  const denied = await requireSimUser()
  if (denied) return denied

  try {
    const body = await request.json().catch(() => null)
    const persona: unknown = body?.persona
    const conversation = Array.isArray(body?.conversation) ? body.conversation : []
    if (typeof persona !== 'string' || !persona.trim()) {
      return NextResponse.json({ error: 'persona is required' }, { status: 400 })
    }

    const { loadPersonaProfile } = await import('@/lib/historian/eval/personaFixtures')
    const { generatePatientReply } = await import('@/lib/historian/synthetic/patientAgent')

    let profile
    try {
      profile = loadPersonaProfile(persona.replace(/\.json$/, ''))
    } catch {
      return NextResponse.json({ error: `Unknown persona "${persona}".` }, { status: 400 })
    }

    const text = await generatePatientReply({ profile, conversation })
    return NextResponse.json({ text })
  } catch (error: any) {
    console.error('Historian sim patient-turn error:', error)
    return NextResponse.json({ error: error?.message || 'Patient turn failed' }, { status: 500 })
  }
}
