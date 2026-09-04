/**
 * POST /api/ai/historian/sim/henry-turn — one text-mode Henry turn.
 *
 * Body: { transcript: {role,text}[], sessionType?, referralReason? }
 *   transcript is the conversation so far (role 'assistant' = Henry,
 *   'user' = patient). Call with an empty transcript to get Henry's opener.
 * Returns: { text, done }  (done = Henry signalled the interview complete)
 *
 * Stateless: the whole transcript is passed each turn, so the browser can
 * drive a full conversation as a sequence of short requests — no long-running
 * server session, no durable worker. Synthetic-only. Incurs Bedrock cost.
 */

import { NextResponse } from 'next/server'
import { requireSimUser } from '@/lib/historian/simAuth'
import { invokeBedrock } from '@/lib/bedrock'
import {
  buildSimHenrySystemPrompt,
  toHenryMessages,
  isSimInterviewDone,
  stripSimEndToken,
} from '@/lib/historian/sim/simHenry'
import type { HistorianSessionType } from '@/lib/historianTypes'

export const maxDuration = 60

export async function POST(request: Request) {
  const denied = await requireSimUser()
  if (denied) return denied

  try {
    const body = await request.json().catch(() => null)
    const transcript = Array.isArray(body?.transcript) ? body.transcript : []
    const sessionType: HistorianSessionType = body?.sessionType || 'new_patient'
    const referralReason: string | undefined =
      typeof body?.referralReason === 'string' && body.referralReason ? body.referralReason : undefined

    const system = buildSimHenrySystemPrompt(sessionType, referralReason)
    const messages = toHenryMessages(transcript)

    const { text } = await invokeBedrock({
      system,
      messages,
      maxTokens: 400,
      temperature: 0.6,
    })

    return NextResponse.json({ text: stripSimEndToken(text), done: isSimInterviewDone(text) })
  } catch (error: any) {
    console.error('Historian sim henry-turn error:', error)
    return NextResponse.json({ error: error?.message || 'Henry turn failed' }, { status: 500 })
  }
}
