/**
 * Clara voice test — classify orchestration route.
 *
 * R&D / internal test surface only. Synthetic input only — no PHI, no real
 * Twilio transfer, no Synapse write. Runs Gate 0 (deterministic red-flag
 * intercept, see src/lib/clara/redFlagGate.ts) FIRST and short-circuits on a
 * hit — this must never depend on the LLM. Otherwise runs Clara's exact
 * classifier rulebook (src/lib/clara/claraRulebook.ts, byte-identical to
 * sevaro-voice-agent's ConsultClassificationService.getSystemPrompt()) on
 * Bedrock via the shared invokeBedrock client.
 *
 * Input:  { transcript: string, context?: {...} }
 * Output: { consultType, confidence, urgencyLevel, statLevel, redFlags,
 *           gate0, routing }
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { invokeBedrockJSON } from '@/lib/bedrock'
import { detectRedFlag } from '@/lib/clara/redFlagGate'
import { CLARA_GATE_COOKIE, verifyGateToken } from '@/lib/clara/testGate'
import {
  getClaraSystemPrompt,
  buildClaraUserPrompt,
  validConsultTypes,
  URGENCY_LEVEL,
  CONSULT_TYPE,
  type ClaraClassificationResult,
} from '@/lib/clara/claraRulebook'

// Fast/cheap classifier tier — mirrors the FAQ POC's choice of Haiku 4.5 for
// per-turn classification. Overridable for testing different model tiers
// against the same rulebook without a code change.
const CLASSIFIER_MODEL =
  process.env.BEDROCK_CLARA_CLASSIFIER_MODEL || 'us.anthropic.claude-haiku-4-5-20251001-v1:0'

interface ClaraContext {
  patientName?: string
  mrn?: string | number
  age?: number
  lastKnownWellTime?: string
  isOnAnticoagulant?: boolean
}

interface ClassifyRequestBody {
  transcript?: string
  context?: ClaraContext
}

type Gate0Result = {
  fired: boolean
  category: string | null
  matchedTerms: string[]
}

type RoutingDecision = {
  action: 'escalate_911' | 'transfer_stat1' | 'transfer_stat2' | 'schedule_callback' | 'route_workflow'
  label: string
  slaMinutes: number | null
}

/** SLA MAPPING from Clara's rulebook, translated into a narrated routing decision (no real transfer). */
function buildRouting(consultType: string, statLevel: number | null, urgencyLevel: string): RoutingDecision {
  if (urgencyLevel === URGENCY_LEVEL.CRITICAL) {
    return { action: 'escalate_911', label: 'EMERGENT — immediate on-call neurologist page (would transfer now)', slaMinutes: 0 }
  }
  if (consultType === CONSULT_TYPE.NON_EMERGENT && statLevel === 1) {
    return { action: 'transfer_stat1', label: 'STAT 1 — callback within 15–20 min (would transfer to on-call queue)', slaMinutes: 20 }
  }
  if (consultType === CONSULT_TYPE.NON_EMERGENT && statLevel === 2) {
    return { action: 'transfer_stat2', label: 'STAT 2 — callback within 60 min (would transfer to on-call queue)', slaMinutes: 60 }
  }
  if (consultType === CONSULT_TYPE.ROUNDING || consultType === CONSULT_TYPE.OUTPATIENT) {
    return { action: 'schedule_callback', label: 'Low urgency — would route to scheduling/coordination', slaMinutes: null }
  }
  return { action: 'route_workflow', label: `Would route to ${consultType} workflow`, slaMinutes: null }
}

function gate0EmergencyResult(gate0: Gate0Result) {
  return NextResponse.json({
    consultType: CONSULT_TYPE.EMERGENT,
    confidence: 1,
    rationale: `Gate 0 deterministic red-flag intercept fired (${gate0.category}). No LLM call made — this is a non-bypassable safety floor.`,
    statLevel: null,
    redFlags: gate0.matchedTerms,
    urgencyLevel: URGENCY_LEVEL.CRITICAL,
    needsClarification: false,
    clarificationQuestions: [],
    gate0,
    routing: {
      action: 'escalate_911',
      label: 'Gate 0 red flag — in a real call this would immediately escalate (911 / STAT page), no further triage.',
      slaMinutes: 0,
    },
  })
}

export async function POST(request: Request) {
  try {
    // Defense-in-depth: this route sits outside middleware's Cognito check
    // (all /api/* routes are public there), so it independently re-verifies
    // the same Clara test-gate cookie the page requires. See testGate.ts.
    const cookieStore = await cookies()
    if (!verifyGateToken(cookieStore.get(CLARA_GATE_COOKIE)?.value)) {
      return NextResponse.json({ error: 'Not authorized for the Clara test surface.' }, { status: 401 })
    }

    const body: ClassifyRequestBody = await request.json().catch(() => ({}))
    const transcript = typeof body.transcript === 'string' ? body.transcript : ''
    if (!transcript.trim()) {
      return NextResponse.json({ error: 'transcript required' }, { status: 400 })
    }

    // ── Gate 0 — deterministic, no model, non-bypassable ────────────────────
    const flagResult = detectRedFlag(transcript)
    const gate0: Gate0Result = {
      fired: flagResult.isRedFlag,
      category: flagResult.category,
      matchedTerms: flagResult.matchedTerms,
    }
    if (gate0.fired) {
      return gate0EmergencyResult(gate0)
    }

    // ── Clara's rulebook on Bedrock ──────────────────────────────────────────
    // invokeBedrockJSON (not the raw invokeBedrock) strips the markdown code
    // fences Claude sometimes wraps JSON in despite the jsonMode instruction,
    // and retries a JSON repair pass if the response was truncated at
    // max_tokens — both observed live against Haiku 4.5 during verification.
    // maxTokens is higher than the upstream OpenAI-tuned 400 (see
    // claraRulebook.ts) because Claude's JSON responses run more verbose.
    const userPrompt = buildClaraUserPrompt(transcript, body.context)
    let parsed: ClaraClassificationResult
    try {
      const bedrockResult = await invokeBedrockJSON<ClaraClassificationResult>({
        system: getClaraSystemPrompt(),
        messages: [{ role: 'user', content: userPrompt }],
        model: CLASSIFIER_MODEL,
        maxTokens: 700,
        temperature: 0.4,
      })
      parsed = bedrockResult.parsed
    } catch (parseErr) {
      console.error('[clara/classify] classifier call/parse failed, failing closed:', parseErr)
      return NextResponse.json(
        {
          error: parseErr instanceof Error ? parseErr.message : 'Classifier returned unparseable output — failing closed.',
          gate0,
        },
        { status: 502 },
      )
    }

    // Normalize casing — Claude occasionally returns e.g. "OUTPATIENT" even
    // though the rulebook's own enum interpolations are lowercase
    // ('outpatient'). This is a parsing-layer accommodation only; it does not
    // touch the rulebook text itself (must stay byte-identical).
    const normalizedConsultType = typeof parsed.consultType === 'string' ? parsed.consultType.toLowerCase() : parsed.consultType
    if (!normalizedConsultType || !validConsultTypes.has(normalizedConsultType as CONSULT_TYPE)) {
      console.error('[clara/classify] invalid consultType from model:', parsed.consultType)
      return NextResponse.json(
        { error: `Classifier returned invalid consultType: ${parsed.consultType}`, gate0, raw: parsed },
        { status: 502 },
      )
    }
    // Same normalization for urgencyLevel (also occasionally returned
    // uppercase) — the UI and buildRouting() both key off the lowercase
    // URGENCY_LEVEL values.
    const normalizedUrgency = typeof parsed.urgencyLevel === 'string' ? parsed.urgencyLevel.toLowerCase() : parsed.urgencyLevel
    parsed = { ...parsed, consultType: normalizedConsultType, urgencyLevel: normalizedUrgency }

    const routing = buildRouting(parsed.consultType, parsed.statLevel ?? null, parsed.urgencyLevel)

    return NextResponse.json({
      ...parsed,
      gate0,
      routing,
    })
  } catch (error: unknown) {
    console.error('[clara/classify] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to classify transcript' },
      { status: 500 },
    )
  }
}
