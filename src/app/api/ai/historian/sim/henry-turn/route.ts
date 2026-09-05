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
    // Default to gpt-4o-mini: far higher rate limits (the account kept 429'ing
    // on gpt-4o) and cheaper. Still OpenAI/GPT-4o family. Set
    // HISTORIAN_SIM_HENRY_MODEL=gpt-4o for closer production fidelity once the
    // account's gpt-4o rate limits are raised.
    const model = process.env.HISTORIAN_SIM_HENRY_MODEL || 'gpt-4o-mini'
    const messages = [
      { role: 'system', content: system },
      ...toHenryMessages(transcript),
    ]

    // Retry transient rate-limit / server errors (429/5xx) with backoff — the
    // live loop fires many turns in quick succession and occasionally trips
    // OpenAI's per-minute limit. Honor Retry-After when present.
    const RETRYABLE = new Set([429, 500, 502, 503, 504])
    const MAX_ATTEMPTS = 4
    let data: any = null
    let lastStatus = 0
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: 400, temperature: 0.6 }),
      })
      if (res.ok) {
        data = await res.json()
        break
      }
      lastStatus = res.status
      const errBody = await res.text()
      console.error(`[sim/henry-turn] OpenAI ${res.status} (attempt ${attempt + 1}):`, errBody.slice(0, 200))
      if (!RETRYABLE.has(res.status) || attempt === MAX_ATTEMPTS - 1) {
        return NextResponse.json(
          { error: `OpenAI returned ${res.status}${res.status === 429 ? ' (rate limit — try again)' : ''}` },
          { status: 502 },
        )
      }
      const retryAfter = Number(res.headers.get('retry-after'))
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 800 * 2 ** attempt
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 8000)))
    }
    if (!data) {
      return NextResponse.json({ error: `OpenAI unavailable (${lastStatus})` }, { status: 502 })
    }
    const text: string = data?.choices?.[0]?.message?.content ?? ''

    return NextResponse.json({ text: stripSimEndToken(text), done: isSimInterviewDone(text) })
  } catch (error: any) {
    console.error('Historian sim henry-turn error:', error)
    return NextResponse.json({ error: error?.message || 'Henry turn failed' }, { status: 500 })
  }
}
