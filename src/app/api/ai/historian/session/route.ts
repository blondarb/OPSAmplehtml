import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { buildHistorianSystemPrompt, getHistorianToolDefinition, getHistorianToolsForProvider } from '@/lib/historianPrompts'
import type { HistorianSessionType } from '@/lib/historianTypes'
import type { HistorianInterviewMode, HistorianInterviewPromptVersion } from '@/lib/historianTypes'
import { getTurnDetectionConfig, getNoiseReductionConfig } from '@/lib/historianTypes'
import { getOpenAIKey } from '@/lib/secrets'
import { getConsult, markHistorianStarted } from '@/lib/consult/pipeline'
import {
  buildHistorianContextFromConsult,
  deriveConsultReferralFocus,
} from '@/lib/consult/contextBuilder'
import { buildWhisperBiasPrompt, isAsrBiasingEnabled } from '@/lib/asr/clinical-lexicon'
import { mintFlushToken } from '@/lib/historian/flushToken'
import { allowedAppOrigins, checkPublicRouteAbuse } from '@/lib/api/publicRouteGuard'
import { authorizeClinicalAccess, clinicalAccessDeniedMessage } from '@/lib/auth/clinicalAccess'
import { resolveReferralPayload } from './referralPayload'
import {
  markHistorianInvitationStarted,
  resolveHistorianPatientGrant,
} from '@/lib/historian/invitationStore'
import { HISTORIAN_GRANT_COOKIE, readCookieValue } from '@/lib/historian/invitationTokens'

/**
 * Mint a short-lived relay auth token for the Nova Sonic WS relay
 * (services/nova-sonic-relay). Browsers cannot set custom headers on a
 * WebSocket handshake, so this token travels as a WS SUBPROTOCOL
 * (`['nova.v1', token]`) instead — see novaSonicWsProvider.ts.
 *
 * Format: `${base64url(JSON.stringify({exp}))}.${base64url(HMAC_SHA256(secret, payload))}`.
 * MUST match the relay's verification logic in
 * services/nova-sonic-relay/src/server.ts byte-for-byte. 120s TTL covers
 * session start (mint -> WS connect) with headroom — the relay only checks
 * `exp` at handshake time, not for the life of the call.
 *
 * Returns null if NOVA_RELAY_SHARED_SECRET is unset — the caller then omits
 * `relayToken` from the response, and the relay (fail-closed) rejects the
 * resulting connection. That is the correct behavior, not a bug: an
 * unconfigured secret must never silently disable auth.
 */
function mintNovaRelayToken(): string | null {
  const secret = process.env.NOVA_RELAY_SHARED_SECRET
  if (!secret) {
    console.warn('[historian/session] NOVA_RELAY_SHARED_SECRET is not set — issuing no relay token; the relay will reject the connection.')
    return null
  }
  const payloadB64 = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 120 }))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  const sig = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `${payloadB64}.${sig}`
}

export async function POST(request: Request) {
  try {
    // Audit 2026-08-04 N1. This route mints PAID OpenAI Realtime credentials
    // and is reachable anonymously from the public /patient/historian demo
    // URL. Cheap abuse brake (origin allowlist + per-IP window) so a scraped
    // path can't drain the Realtime quota out from under a live partner demo.
    // Not a substitute for the deferred platform auth net.
    const guard = checkPublicRouteAbuse(request, 'historian-session', {
      limit: 12,
      windowMs: 5 * 60 * 1000,
      allowedOrigins: allowedAppOrigins(),
    })
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        {
          status: guard.status,
          ...(guard.retryAfterSeconds
            ? { headers: { 'Retry-After': String(guard.retryAfterSeconds) } }
            : {}),
        },
      )
    }

    const body = await request.json()

    // Historian Validation Suite Task 1: server-minted session id + its
    // matching transcript-flush bearer token. Hoisted to the top (was
    // previously minted further down, after the provider branch) so
    // textMode (below) can return it without duplicating this logic —
    // 100% behavior-preserving for every existing caller: nothing later in
    // this function reads sessionId/flushToken before they're used, and
    // nothing before this point used to run before they were minted either.
    let sessionId: string = crypto.randomUUID()
    let flushToken: string | undefined
    try {
      flushToken = mintFlushToken(sessionId)
    } catch (flushTokenErr) {
      console.warn(
        '[historian/session] mintFlushToken failed (non-fatal — durable transcript flush unavailable this session):',
        flushTokenErr instanceof Error ? flushTokenErr.message : String(flushTokenErr),
      )
      flushToken = undefined
    }

    // Historian Validation Suite Task 6 (synthetic conversation driver):
    // textMode returns ONLY {sessionId, flushToken} — no OpenAI
    // client_secrets call, no Nova relay token, no consult-context lookup.
    // The driver sources instructions/tools directly from
    // buildHistorianSystemPrompt()/getHistorianToolDefinition() (the exact
    // functions this route calls below) and drives its own OpenAI Realtime
    // WebSocket connection, so none of the voice-credential machinery below
    // is relevant to it. Accepts either `body.textMode === true` or the
    // query string `?textMode=1`/`?textMode=true`. Purely additive — every
    // existing (non-textMode) caller falls through to the unchanged code
    // below exactly as before.
    const requestUrl = new URL(request.url)
    const textModeParam = requestUrl.searchParams.get('textMode')
    const textMode = body.textMode === true || textModeParam === '1' || textModeParam === 'true'
    if (textMode) {
      return NextResponse.json({ sessionId, flushToken })
    }

    // A remote patient is authorized by a one-time clinician invitation that
    // has already been exchanged for an HttpOnly browser grant. Resolve that
    // binding before trusting any client fields. If a grant cookie is present
    // but invalid/expired, fail closed instead of silently falling back to the
    // anonymous demo path.
    const invitationBinding = await resolveHistorianPatientGrant(request)
    if (readCookieValue(request, HISTORIAN_GRANT_COOKIE) && !invitationBinding) {
      return NextResponse.json(
        { error: 'This interview session is invalid or has expired.' },
        { status: 401 },
      )
    }
    if (invitationBinding?.status === 'completed') {
      return NextResponse.json(
        { error: 'This interview has already been completed.' },
        { status: 409 },
      )
    }
    if (invitationBinding?.status === 'in_progress') {
      return NextResponse.json(
        { error: 'This interview was interrupted and cannot be restarted safely. Please ask the clinic for a new link.' },
        { status: 409 },
      )
    }
    if (invitationBinding) {
      sessionId = invitationBinding.sessionId
      try {
        flushToken = mintFlushToken(sessionId)
      } catch (flushTokenErr) {
        console.warn(
          '[historian/session] mintFlushToken failed for invited session:',
          flushTokenErr instanceof Error ? flushTokenErr.message : String(flushTokenErr),
        )
        flushToken = undefined
      }
    }

    const sessionType: HistorianSessionType = invitationBinding?.sessionType || body.sessionType || 'new_patient'
    const interviewMode: HistorianInterviewMode =
      invitationBinding?.interviewMode ||
      (body.interviewMode === 'comprehensive' ? 'comprehensive' : 'standard')
    const interviewPromptVersion: HistorianInterviewPromptVersion =
      invitationBinding?.interviewPromptVersion ||
      (interviewMode === 'comprehensive' ? 'comprehensive-v1' : 'standard-v1')
    let authorizedTenantId: string | null = invitationBinding?.tenantId ?? null
    if (interviewMode === 'comprehensive' && !invitationBinding) {
      const access = await authorizeClinicalAccess({
        action: 'historian.start',
        allowedRoles: ['clinician', 'admin'],
      })
      if (!access.ok) {
        return NextResponse.json(
          { error: clinicalAccessDeniedMessage(access.reason), reason: access.reason },
          { status: access.status },
        )
      }
      authorizedTenantId = access.context.tenantId
    }
    let referralReason: string | undefined = invitationBinding?.referralReason || body.referralReason
    let patientContext: string | undefined = invitationBinding ? undefined : body.patientContext

    // A referral payload (from /consult or the note entry point on
    // /patient/historian) overrides caller-supplied context and supplies the
    // directive focus. Malformed payloads resolve to null and the interview
    // proceeds exactly as it does today.
    const referralContext = invitationBinding ? null : resolveReferralPayload(body)
    let referralFocus: string | null = null
    if (referralContext) {
      referralReason = referralContext.referralReason
      patientContext = referralContext.patientContext
      referralFocus = referralContext.referralFocus
    }

    // Fall back to the plain referral reason when no richer focus was derived.
    //
    // The REFERRAL-DIRECTED PRIORITY block in buildHistorianSystemPrompt is
    // gated on `referralFocus` — it is what makes the interview OPEN with why
    // the patient was referred. Only a triage handoff or a pasted referral
    // produced one, so a canned demo scenario (which carries `referralReason`)
    // got a generic opener: a patient who said "I don't know why I'm here" was
    // never told. Observed 2026-08-06 on a live demo scenario.
    //
    // referralReason is already the scenario's own one-line reason, which is
    // exactly what the directive block wants. Trimmed-empty is treated as
    // absent so a blank string can't produce "referred for: ".
    // RE-ENABLED 2026-08-06 after the block that gated it was reworded.
    //
    // This fallback makes a canned demo scenario open by naming why the patient
    // was referred — a patient who says "I don't know why I'm here" gets told.
    // It was disabled for a few hours because the REFERRAL-DIRECTED PRIORITY
    // block it switches on was BLOCKED BY BEDROCK'S CONTENT FILTER, which
    // killed every Nova voice session it touched before the model spoke.
    //
    // The offending paragraph (the "if the patient asks why they were
    // referred" one in historianPrompts.ts) has been reworded and re-verified
    // against the live relay: 0/3 blocked, while the original still blocks.
    // See the load-bearing-wording comment there before editing that text.
    //
    // referralReason is the scenario's own one-line reason, which is exactly
    // what the directive block wants. Trimmed-empty is treated as absent so a
    // blank string cannot render "referred for: ".
    if (!referralFocus && referralReason?.trim()) {
      referralFocus = referralReason.trim()
    }

    // Provider selection: explicit client `provider` field wins, else the
    // server-side VOICE_PROVIDER env var, else default to 'openai' — today's
    // production path. Only 'nova' opts into the WS-relay/Bedrock path; any
    // other/missing value falls back to openai (fail-safe default).
    const requestedProvider = (
      invitationBinding?.provider ?? body.provider ?? process.env.VOICE_PROVIDER ?? 'openai'
    ) as string
    // Comprehensive v1 is a Nova-only controlled pilot. Resolve this on the
    // server so a stale client/default cannot silently run the wrong provider.
    // Standard retains the existing explicit-client/env/default behavior.
    const provider: 'nova' | 'openai' = interviewMode === 'comprehensive'
      ? 'nova'
      : requestedProvider === 'nova' ? 'nova' : 'openai'

    // Phase 1 pipeline: enrich the historian context with triage + intake from
    // the consult record. Caller-provided values are overridden when a consult
    // is found — the pipeline data is more authoritative.
    const consultId: string | undefined = invitationBinding?.consultId || body.consult_id
    if (consultId) {
      try {
        const consult = await getConsult(consultId)
        if (consult) {
          const consultContext = buildHistorianContextFromConsult(consult)
          referralReason = consultContext.referralReason
          patientContext = consultContext.patientContext
          // Keep the directive steer in step with the context we just adopted —
          // without this, /consult sessions would get referral context but no
          // referral-directed priority.
          referralFocus = deriveConsultReferralFocus(consult)
          await markHistorianStarted(consultId, authorizedTenantId || 'default')
        }
      } catch (pipelineErr) {
        console.error('[historian/session] consult context build error (non-fatal):', pipelineErr)
      }
    }

    if (invitationBinding) {
      const markedStarted = await markHistorianInvitationStarted(invitationBinding)
      if (!markedStarted) {
        return NextResponse.json(
          { error: 'This interview could not be started. Please ask the clinic for a new link.' },
          { status: 409 },
        )
      }
    }

    // (sessionId/flushToken were minted up front, above the textMode check —
    // both provider branches below use those same values.)

    // ── Nova path: no OpenAI client_secrets call. Return relay config + the
    // Nova-native tool specs (Bedrock Converse toolSpec shape). The hook
    // builds a NovaSonicWsProvider from this — no ephemeral key needed.
    if (provider === 'nova') {
      const instructions = buildHistorianSystemPrompt(sessionType, referralReason, patientContext, undefined, referralFocus, interviewMode)
      return NextResponse.json({
        provider: 'nova',
        instructions,
        tools: getHistorianToolsForProvider('nova', sessionType),
        relayUrl: process.env.NOVA_SONIC_RELAY_URL,
        voiceId: process.env.NOVA_SONIC_VOICE_ID,
        // Short-lived relay auth token (see mintNovaRelayToken above).
        // Omitted (undefined -> dropped by JSON.stringify) when the shared
        // secret isn't configured — the relay fail-closed-rejects the
        // resulting connection.
        relayToken: mintNovaRelayToken() ?? undefined,
        // base_instructions kept for client parity (localizer push channel).
        base_instructions: instructions,
        consult_id: consultId || null,
        // Additive (Task 1): server-minted historian_sessions id + its
        // matching transcript-flush bearer token.
        sessionId,
        flushToken,
        interviewMode,
        interviewPromptVersion,
      })
    }

    // ── OpenAI path (unchanged client_secrets flow below) ──
    const apiKey = await getOpenAIKey()
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured.' },
        { status: 500 },
      )
    }

    const instructions = buildHistorianSystemPrompt(sessionType, referralReason, patientContext, undefined, referralFocus, interviewMode)
    const tools = getHistorianToolDefinition(sessionType)
    const model = process.env.OPENAI_HISTORIAN_REALTIME_MODEL || 'gpt-realtime-2'
    const turnDetection = getTurnDetectionConfig(process.env.HISTORIAN_TURN_DETECTION_MODE)
    // Filter background noise before it reaches the VAD + model so noisy rooms
    // stop false-triggering turn-taking and freezing the AI (Riya 2026-06-29).
    // Hot-revert with HISTORIAN_NOISE_REDUCTION=off.
    const noiseReduction = getNoiseReductionConfig(process.env.HISTORIAN_NOISE_REDUCTION)

    // Bias ASR toward neurology vocabulary (drug names, anatomy, scales) so the
    // high-stakes words general ASR misses transcribe correctly. Hot-revertable
    // via ASR_VOCAB_BIASING. See docs/plans/2026-06-07-asr-vocabulary-biasing-spec.md
    const transcription: { model: string; prompt?: string } = { model: 'whisper-1' }
    if (isAsrBiasingEnabled()) {
      transcription.prompt = buildWhisperBiasPrompt()
    }

    // Build the session body; include noise_reduction only when enabled.
    const buildBody = (withNoiseReduction: boolean) =>
      JSON.stringify({
        session: {
          type: 'realtime',
          model,
          instructions,
          audio: {
            input: {
              turn_detection: turnDetection,
              transcription,
              ...(withNoiseReduction && noiseReduction
                ? { noise_reduction: noiseReduction }
                : {}),
            },
            output: { voice: 'verse' },
          },
          tools,
        },
      })

    const callOpenAI = (body: string) =>
      // OpenAI's current GA endpoint (replaces the deprecated /v1/realtime/sessions).
      fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
      })

    let response = await callOpenAI(buildBody(true))
    // Fail-open safety: if OpenAI rejects the request and noise_reduction was
    // included, retry once WITHOUT it. This enhancement can never break session
    // creation — worst case the historian behaves exactly as it did before.
    if (!response.ok && noiseReduction) {
      const firstErr = await response.text()
      console.warn(
        '[historian/session] retrying without noise_reduction after error:',
        response.status,
        firstErr.slice(0, 200),
      )
      response = await callOpenAI(buildBody(false))
    }

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('[historian/session] OpenAI client_secrets error:', response.status, errorBody)
      // Pass the raw OpenAI error body through — do NOT collapse to a generic
      // string. Today's "Failed to create realtime session: 400" hides root causes.
      return NextResponse.json(
        {
          error: `OpenAI Realtime API returned ${response.status}`,
          openai_error: errorBody,
          status: response.status,
        },
        { status: response.status },
      )
    }

    const data = await response.json()

    return NextResponse.json({
      // Tells the client which provider minted this session so the hook
      // instantiates the matching VoiceProvider (added for the voice-provider
      // abstraction; every other field below is unchanged from before it).
      provider: 'openai',
      tools,
      // Shape unchanged from client's perspective
      ephemeralKey: data.value ?? data.client_secret?.value,
      // OpenAI's own Realtime session id. Renamed from the historical
      // `sessionId` (verified 2026-07: no client or test reads this field
      // by that name — useRealtimeSession.ts's startSession destructure
      // never included it) to free up `sessionId` for the server-minted
      // historian_sessions UUID below (Task 1: durable transcript).
      providerSessionId: data.session_id ?? data.id,
      expiresAt: data.expires_at ?? data.client_secret?.expires_at,
      consult_id: consultId || null,
      // Additive (Task 1): server-minted historian_sessions id + its
      // matching transcript-flush bearer token. Same values as the Nova
      // branch above — minted once per POST regardless of provider.
      sessionId,
      flushToken,
      interviewMode,
      interviewPromptVersion,
      // Pass the resolved model + turn detection mode back so the client knows
      // exactly which configuration is active (for debugging + analytics)
      model,
      turn_detection_mode: turnDetection.type,
      // Phase 5 of 2026-05-27 historian upgrade: expose the resolved
      // instructions so the client can re-serialize them when pushing
      // Localizer context updates (BASE_PROMPT + delta).
      base_instructions: instructions,
    })
  } catch (error: unknown) {
    console.error('[historian/session] API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create historian session' },
      { status: 500 },
    )
  }
}
