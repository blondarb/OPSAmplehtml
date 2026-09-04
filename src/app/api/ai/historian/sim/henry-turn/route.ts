/**
 * POST /api/ai/historian/sim/henry-turn — one text-mode Henry turn.
 *
 * Body: { transcript: {role,text}[], sessionType?, referralReason? }
 *   transcript is the conversation so far (role 'assistant' = Henry,
 *   'user' = patient). Call with an empty transcript to get Henry's opener.
 * Returns: { text, done }  (done = Henry signalled the interview complete)
 *
 * Runs on OpenAI (gpt-4o family) — the SAME provider + base model as the
 * production Realtime voice agent (gpt-realtime-2), so sim Henry's knowledge
 * matches production more closely than a cross-provider model would. Same
 * historian system prompt (text-mode override). Stateless: the whole
 * transcript is passed each turn so the browser can drive the conversation as
 * a sequence of short requests. Synthetic-only. Incurs OpenAI cost.
 */

import { NextResponse } from 'next/server'
import { getOpenAIKey } from '@/lib/secrets'
import {
  buildSimHenrySystemPrompt,
  toHenryMessages,
  isSimInterviewDone,
  stripSimEndToken,
} from '@/lib/historian/sim/simHenry'
import type { HistorianSessionType } from '@/lib/historianTypes'

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const transcript = Array.isArray(body?.transcript) ? body.transcript : []
    const sessionType: HistorianSessionType = body?.sessionType || 'new_patient'
    const referralReason: string | undefined =
      typeof body?.referralReason === 'string' && body.referralReason ? body.referralReason : undefined

    const apiKey = await getOpenAIKey()
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured.' }, { status: 500 })
    }

    const system = buildSimHenrySystemPrompt(sessionType, referralReason)
    const model = process.env.HISTORIAN_SIM_HENRY_MODEL || 'gpt-4o'
    const messages = [
      { role: 'system', content: system },
      ...toHenryMessages(transcript),
    ]

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: 400, temperature: 0.6 }),
    })
    if (!res.ok) {
      const errBody = await res.text()
      console.error('[sim/henry-turn] OpenAI error:', res.status, errBody.slice(0, 300))
      return NextResponse.json({ error: `OpenAI returned ${res.status}` }, { status: 502 })
    }
    const data = await res.json()
    const text: string = data?.choices?.[0]?.message?.content ?? ''

    return NextResponse.json({ text: stripSimEndToken(text), done: isSimInterviewDone(text) })
  } catch (error: any) {
    console.error('Historian sim henry-turn error:', error)
    return NextResponse.json({ error: error?.message || 'Henry turn failed' }, { status: 500 })
  }
}
