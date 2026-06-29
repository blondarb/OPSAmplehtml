/**
 * Neuro FAQ Voice — answer orchestration route.
 *
 * POC SKELETON — review before any non-internal use.
 *
 * Runs the full gate sequence (safety_architecture.md §1):
 *   Gate 0/1  deterministic guardrails (red-flag + out-of-scope)
 *   Gate 2    LLM classifier (cheap model)
 *   Gate 3    corpus retrieval (refusal-by-default if no match)
 *   Gate 4    grounded answer (Sonnet, corpus-only)
 *   Gate 5    output scrub
 *
 * Input:  { utterance: string }
 * Output: { kind, text, escalation, faqId?, label?, reason? }
 *
 * NOTE: This intentionally does NOT use OpenAI. Per Decision D8 the POC runs on
 * the AWS pipeline (Bedrock) so the safety logic is built once on the production
 * substrate. Audio in is handled client-side by AWS Transcribe Medical
 * (useStreamingDictation); audio out by /api/ai/faq/tts (Polly).
 */

import { NextResponse } from 'next/server'
import { invokeBedrock, BEDROCK_MODEL } from '@/lib/bedrock'
import {
  checkGuardrails,
  EMERGENCY_RESPONSE,
  SELF_HARM_APPEND,
  REFUSE_AND_ROUTE_RESPONSE,
  GENERAL_INFO_TAG,
} from '@/lib/faq/faq-guardrails'
import { retrieveFaq, formatEntriesForPrompt } from '@/lib/faq/faq-retrieval'
import {
  CLASSIFIER_SYSTEM_PROMPT,
  buildAnswerSystemPrompt,
  type ClassifierLabel,
} from '@/lib/faq/faqPrompts'

// Cheap, fast model for the per-turn classifier. Verified ACTIVE in us-east-2
// (aws bedrock list-inference-profiles, 2026-06-29). Haiku 4.5.
const CLASSIFIER_MODEL =
  process.env.BEDROCK_FAQ_CLASSIFIER_MODEL || 'us.anthropic.claude-haiku-4-5-20251001-v1:0'

type AnswerResult = {
  kind: 'emergency' | 'refuse' | 'answer'
  text: string
  escalation: boolean
  faqId?: string
  label?: ClassifierLabel
  reason?: string
}

// Gate 5 — strip advice-shaped phrasing the prompt may have let through.
const ADVICE_PATTERNS = [/in your case/i, /\byou should\b/i, /i recommend/i, /your diagnosis/i]
function scrubOutput(text: string): { text: string; failedClosed: boolean } {
  if (ADVICE_PATTERNS.some((p) => p.test(text))) {
    return { text: REFUSE_AND_ROUTE_RESPONSE, failedClosed: true }
  }
  let out = text.trim()
  if (!out.includes('general information')) out += `\n\n${GENERAL_INFO_TAG}`
  return { text: out, failedClosed: false }
}

export async function POST(request: Request) {
  try {
    const { utterance } = await request.json()
    if (!utterance || typeof utterance !== 'string') {
      return NextResponse.json({ error: 'utterance required' }, { status: 400 })
    }

    // ── Gate 0 / Gate 1 — deterministic ─────────────────────────────────────
    const guard = checkGuardrails(utterance)
    if (guard.kind === 'red_flag') {
      const text = EMERGENCY_RESPONSE + (guard.selfHarm ? SELF_HARM_APPEND : '')
      return NextResponse.json<AnswerResult>({
        kind: 'emergency', text, escalation: true, reason: guard.reason,
      })
    }
    if (guard.kind === 'out_of_scope') {
      return NextResponse.json<AnswerResult>({
        kind: 'refuse', text: REFUSE_AND_ROUTE_RESPONSE, escalation: false, reason: guard.reason,
      })
    }

    // ── Gate 2 — LLM classifier (cheap model) ───────────────────────────────
    let label: ClassifierLabel = 'OUT_OF_SCOPE' // fail-closed default
    try {
      const cls = await invokeBedrock({
        system: CLASSIFIER_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: utterance }],
        model: CLASSIFIER_MODEL,
        maxTokens: 16,
        temperature: 0,
      })
      const raw = cls.text.trim().toUpperCase()
      if (['RED_FLAG', 'OUT_OF_SCOPE', 'SOFT_BOUNDARY', 'ANSWERABLE_FAQ'].includes(raw)) {
        label = raw as ClassifierLabel
      }
    } catch (e) {
      console.error('[faq/answer] classifier error (failing closed to refuse):', e)
    }

    if (label === 'RED_FLAG') {
      return NextResponse.json<AnswerResult>({
        kind: 'emergency', text: EMERGENCY_RESPONSE, escalation: true, label, reason: 'classifier',
      })
    }
    if (label === 'OUT_OF_SCOPE') {
      return NextResponse.json<AnswerResult>({
        kind: 'refuse', text: REFUSE_AND_ROUTE_RESPONSE, escalation: false, label,
      })
    }

    // ── Gate 3 — corpus retrieval (refusal-by-default) ──────────────────────
    const entries = retrieveFaq(utterance)
    if (entries.length === 0) {
      return NextResponse.json<AnswerResult>({
        kind: 'refuse', text: REFUSE_AND_ROUTE_RESPONSE, escalation: false, label, reason: 'no_grounding',
      })
    }

    // ── Gate 4 — grounded answer (Sonnet, corpus-only) ──────────────────────
    const answer = await invokeBedrock({
      system: buildAnswerSystemPrompt(formatEntriesForPrompt(entries), label === 'SOFT_BOUNDARY'),
      messages: [{ role: 'user', content: utterance }],
      model: BEDROCK_MODEL,
      maxTokens: 220,
      temperature: 0.2,
    })

    // ── Gate 5 — output scrub ───────────────────────────────────────────────
    const { text, failedClosed } = scrubOutput(answer.text)
    return NextResponse.json<AnswerResult>({
      kind: failedClosed ? 'refuse' : 'answer',
      text,
      escalation: false,
      faqId: entries[0]?.id,
      label,
      reason: failedClosed ? 'scrub_failed_closed' : undefined,
    })
  } catch (error: any) {
    console.error('[faq/answer] error:', error)
    // Fail closed: on any error, route to a human rather than risk a bad answer.
    return NextResponse.json<AnswerResult>(
      { kind: 'refuse', text: REFUSE_AND_ROUTE_RESPONSE, escalation: false, reason: 'server_error' },
      { status: 200 },
    )
  }
}
