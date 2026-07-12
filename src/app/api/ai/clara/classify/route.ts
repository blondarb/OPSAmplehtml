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
import { detectRedFlag, isSubacuteStrokeReport } from '@/lib/clara/redFlagGate'
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
  /** True when a seizure-category hit was intentionally NOT escalated because the
   *  call is a Ceribell/EEG-read burden report (deferred to the rulebook). */
  deescalated?: boolean
  deescalationReason?: string
}

// Ceribell / rapid-EEG / seizure-burden READ context — a report of EEG
// monitoring data, not (necessarily) active status epilepticus.
const CERIBELL_EEG_READ_CONTEXT =
  /\b(ceribell|cerebell|rapid\s+eeg|headband\s+eeg|seizure\s+burden|burden\s+of\s+\d|continuous\s+eeg|eeg\s+(?:read|monitor|interpret|study|follow))/i
// Active clinical emergency that KEEPS the emergency floor even in an EEG context.
// "cannot|couldn't breathe" added 2026-07-12 (cross-model review of the
// sevaro-voice-agent port, SSOT pair): the word boundary in `not\s+breathing`
// does NOT match inside "cannot", so an ASR "cannot breathe" slipped past
// this override and a Ceribell burden-read would have deferred despite an
// airway complaint. Airway/consciousness-collapse terms extended 2026-07-12
// (red-team) to match the acute_emergency Gate-0 bank exactly — otherwise a
// "cluster of seizures" (category=seizure) + "apneic"/"unrousable"/
// "desaturating" case (airway signs NOT the bare word "airway") could still
// defer to the rulebook despite an active airway emergency.
const ACTIVE_SEIZURE_EMERGENCY =
  /\b(airway|not\s+breathing|stopped\s+breathing|apne(?:a|ic)|desaturat\w*|turning\s+blue|cyanotic|(?:can'?t|cannot|couldn'?t)\s+breathe|un(?:rousable|arousable|responsive)|(?:can'?t|cannot|couldn'?t|won'?t|not\s+(?:been\s+)?able\s+to)\s+rouse|seizing|convulsing|having\s+a\s+seizure|won'?t\s+stop|not\s+stopping|coding|escalat|intubat)/i

type RoutingDecision = {
  action: 'escalate_911' | 'transfer_md1' | 'transfer_md2' | 'transfer_stat1' | 'transfer_stat2' | 'route_eeg_reader' | 'refer_pcp' | 'schedule_callback' | 'route_workflow'
  label: string
  slaMinutes: number | null
}

/** SLA MAPPING from Clara's rulebook, translated into a narrated routing decision (no real transfer). */
function buildRouting(
  consultType: string,
  statLevel: number | null,
  urgencyLevel: string,
  seizureBurdenPct: number | null,
): RoutingDecision {
  // EMERGENT is the ONLY 911/status-epilepticus page path. urgencyLevel 'critical'
  // does NOT by itself mean emergent — the rulebook also marks a Ceribell
  // ≥20%-burden read as 'critical'. Key escalation off consultType, not urgency
  // (Steve, 2026-07-11).
  if (consultType === CONSULT_TYPE.EMERGENT) {
    return { action: 'escalate_911', label: 'EMERGENT — immediate on-call neurologist page (would transfer now)', slaMinutes: 0 }
  }
  // Ceribell rapid-EEG routing — Sevaro EEG-dept protocol (Marion Fossum, EEG Lead;
  // OneDrive + site On-Call Guides) as confirmed by Steve Arbogast, DO (2026-07-11):
  // ≥20% seizure burden → the EMERGENT on-call neurologist AND the EEG reader,
  // engaged SIMULTANEOUSLY (both brought in at once, not sequentially).
  // ≤19% (or study complete) → the RN calls the study in NON-emergently; routine EEG read.
  // Prefer the actual burden % when the model returned one; fall back to urgency
  // (critical/high ≈ ≥20%).
  if (consultType === CONSULT_TYPE.CERIBELL_EEG) {
    const highBurden =
      (typeof seizureBurdenPct === 'number' && seizureBurdenPct >= 20) ||
      urgencyLevel === URGENCY_LEVEL.CRITICAL ||
      urgencyLevel === URGENCY_LEVEL.HIGH
    return highBurden
      ? { action: 'transfer_md1', label: 'Ceribell ≥20% burden → EMERGENT on-call neurologist (MD1) + EEG reader, engaged simultaneously (per EEG-dept protocol)', slaMinutes: 0 }
      : { action: 'route_eeg_reader', label: 'Ceribell <20% burden → EEG reader (routine); does NOT go to the non-emergent MD', slaMinutes: null }
  }
  if (consultType === CONSULT_TYPE.EEG_READ) {
    return { action: 'route_eeg_reader', label: 'EEG read → EEG reader', slaMinutes: null }
  }
  if (consultType === CONSULT_TYPE.NON_EMERGENT && statLevel === 1) {
    return { action: 'transfer_stat1', label: 'STAT 1 — callback within 15–20 min (on-call STAT queue)', slaMinutes: 20 }
  }
  if (consultType === CONSULT_TYPE.NON_EMERGENT && statLevel === 2) {
    return { action: 'transfer_stat2', label: 'STAT 2 — callback within 60 min (on-call STAT queue)', slaMinutes: 60 }
  }
  if (consultType === CONSULT_TYPE.NON_EMERGENT) {
    // statLevel null = PLAIN non-emergent (Steve 2026-07-12): explicitly
    // routine / no ER-urgency signals — non-emergent provider, no timed SLA.
    // (Previously fell through to the generic "would route to workflow" label.)
    return { action: 'route_workflow', label: 'Non-emergent → non-emergent provider (routine queue, no STAT SLA)', slaMinutes: null }
  }
  if (consultType === CONSULT_TYPE.CT_RETURN) {
    // Steve, 2026-07-11: CT-return branches on whether we already have this patient.
    // WITH a prior record → back to the neurologist who saw them (Clara confirms name+MRN,
    // then just notifies — no need to re-gather). WITHOUT a prior record → this is likely a
    // fresh emergent stroke → MD1 (Clara gathers name/DOB/location on the call). The prior-
    // record lookup lives in the dispatch layer; Clara asks the "seen before?" question live.
    return { action: 'transfer_md1', label: 'CT-return → prior provider IF this patient was already seen (confirm name+MRN, then notify); if NO prior record → probable emergent stroke → MD1 (gather name/DOB/location). Clara asks "seen before?" live.', slaMinutes: null }
  }
  if (consultType === CONSULT_TYPE.ROUNDING) {
    return { action: 'transfer_md2', label: 'Rounding / scheduled inpatient follow-up (incl. rounding on new patients) → MD2 (rounding physician)', slaMinutes: null }
  }
  if (consultType === CONSULT_TYPE.OUTPATIENT) {
    return { action: 'refer_pcp', label: 'Outpatient — Sevaro has NO outpatient coverage; direct the caller to the patient’s primary care provider', slaMinutes: null }
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
    // Clinical rule (Steve, 2026-07-11): a Ceribell / rapid-EEG call reporting a
    // seizure BURDEN is monitoring data, not active status epilepticus. In a clear
    // Ceribell/EEG-read context with no active-emergency language, don't let the
    // deterministic seizure floor pre-empt the rulebook — it already routes
    // ≥20% burden → CRITICAL Ceribell-EEG (emergent on-call neurologist + EEG reader,
    // simultaneously). The floor still fires for stroke/thunderclap/self-harm and for
    // seizures described with active-seizing / airway / escalation language.
    // SSOT: the production Clara service (sevaro-voice-agent) needs this same
    // policy layer around its own Gate-0.
    if (gate0.fired) {
      const ceribellBurdenRead =
        gate0.category === 'seizure' &&
        CERIBELL_EEG_READ_CONTEXT.test(transcript) &&
        !ACTIVE_SEIZURE_EMERGENCY.test(transcript)
      // Clinical rule (Sam's live finding, Steve relayed 2026-07-12): BE-FAST
      // terms in an EXPLICITLY multi-day presentation ("two days of right-sided
      // weakness", "LKW two days ago") are a completed/subacute stroke — the
      // rulebook already tiers that correctly (stroke >24h → NON_EMERGENT
      // STAT 2, callback ≤60 min) and must not be pre-empted by the floor.
      // Fail-safe scope lives in isSubacuteStrokeReport (stroke bank only;
      // explicit ≥2-day timeframe; no acute/worsening/"code stroke" language;
      // no other-bank hit after stripping negated "no hemorrhage" imaging
      // idiom). SSOT: the production Clara service (sevaro-voice-agent) needs
      // this same policy layer around its own Gate-0.
      const subacuteStroke = isSubacuteStrokeReport(transcript)
      if (!ceribellBurdenRead && !subacuteStroke) {
        return gate0EmergencyResult(gate0)
      }
      gate0.deescalated = true
      gate0.deescalationReason = ceribellBurdenRead
        ? 'Seizure terms detected in a Ceribell/EEG-read burden report with no active-emergency language — deferring to the rulebook (≥20% burden → emergent on-call neurologist + EEG reader, simultaneously).'
        : 'BE-FAST terms in an explicitly multi-day (subacute) presentation with no acute/worsening language — deferring to the rulebook (stroke >24h → NON_EMERGENT STAT 2 per its stroke-timing rule).'
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

    // Normalize casing AND separator — Claude occasionally returns the enum NAME
    // instead of the value: "OUTPATIENT", or (the intermittent Ceribell 502)
    // "CERIBELL_EEG" / "NON_EMERGENT" / "CT_RETURN" / "EEG_READ" with underscores,
    // where the valid values are hyphenated ('ceribell-eeg', 'non-emergent', …).
    // Lowercase + underscore→hyphen maps both forms onto the canonical value.
    // Parsing-layer accommodation only; does not touch the (byte-identical) rulebook.
    const normalizedConsultType =
      typeof parsed.consultType === 'string' ? parsed.consultType.toLowerCase().replace(/_/g, '-') : parsed.consultType
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

    const routing = buildRouting(
      parsed.consultType,
      parsed.statLevel ?? null,
      parsed.urgencyLevel,
      typeof parsed.seizureBurdenPercentage === 'number' ? parsed.seizureBurdenPercentage : null,
    )

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
