/**
 * POST /api/ai/historian/session-renew
 *
 * Mints a fresh ephemeral token for an in-progress Realtime session.
 * Called by useRealtimeSession ~90 s before the current token expires
 * so the client can swap the credential without tearing down the WebRTC
 * connection — the conversation continues uninterrupted past the ~8-min cap.
 *
 * Intentionally thin: no consult enrichment, no markHistorianStarted —
 * those already ran at session create. We only need a new client_secret
 * for the same model/config so OpenAI accepts continued use of the session.
 *
 * Body:   { sessionType?: HistorianSessionType }
 * Returns { ephemeralKey, expiresAt }
 */

import { NextResponse } from 'next/server'
import type { HistorianSessionType } from '@/lib/historianTypes'
import { getTurnDetectionConfig, getNoiseReductionConfig } from '@/lib/historianTypes'
import { getOpenAIKey } from '@/lib/secrets'
import { buildHistorianSystemPrompt, getHistorianToolDefinition } from '@/lib/historianPrompts'
import { buildWhisperBiasPrompt, isAsrBiasingEnabled } from '@/lib/asr/clinical-lexicon'
import { getConsult } from '@/lib/consult/pipeline'
import { buildHistorianContextFromConsult } from '@/lib/consult/contextBuilder'
import { loadHistorianAuthorization } from '@/lib/triage/historianAuthorization'
import type { ReferralClarificationQuestion } from '@/lib/historianTypes'
import { authorizeClinicalOrPatientAccess } from '@/lib/patientAccess/routeAuthorization'

function isHistorianSessionType(value: unknown): value is HistorianSessionType {
  return value === 'new_patient' || value === 'follow_up' || value === 'referral_clarification'
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const requestedSessionType = body.sessionType ?? 'new_patient'
    if (!isHistorianSessionType(requestedSessionType)) {
      return NextResponse.json(
        { error: 'Invalid historian session type' },
        { status: 400 },
      )
    }
    const requestedConsultId =
      typeof body.consult_id === 'string' && body.consult_id.trim()
        ? body.consult_id.trim()
        : undefined
    const requestedPatientId =
      typeof body.patient_id === 'string' && body.patient_id.trim()
        ? body.patient_id.trim()
        : undefined
    const clarificationRequested =
      requestedSessionType === 'referral_clarification' ||
      requestedConsultId !== undefined
    const access = await authorizeClinicalOrPatientAccess({
      clinicalAction: 'historian.renew',
      clinicalRoles: ['clinician', 'admin'],
      patientScopes: clarificationRequested
        ? ['patient:clarification:answer']
        : ['patient:historian:renew'],
      ...(requestedPatientId ? { expectedPatientId: requestedPatientId } : {}),
      ...(requestedConsultId ? { expectedConsultId: requestedConsultId } : {}),
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }
    if (
      access.principal === 'patient' &&
      requestedPatientId &&
      requestedPatientId !== access.context.patientId
    ) {
      return NextResponse.json(
        { error: 'Access denied', reason: 'binding_mismatch' },
        { status: 403 },
      )
    }
    const tenantId = access.context.tenantId
    let sessionType: HistorianSessionType = requestedSessionType
    const consultId =
      requestedConsultId ??
      (requestedSessionType === 'referral_clarification' &&
      access.principal === 'patient'
        ? access.context.consultId
        : undefined)
    let referralReason: string | undefined
    let patientContext: string | undefined
    let approvedQuestions: ReferralClarificationQuestion[] | undefined

    if (sessionType === 'referral_clarification' && !consultId) {
      return NextResponse.json(
        {
          error: 'Historian renewal is not authorized',
          reason: 'triage_authorization_missing',
        },
        { status: 409 },
      )
    }

    if (consultId) {
      if (
        access.principal === 'patient' &&
        access.context.consultId !== consultId
      ) {
        return NextResponse.json(
          { error: 'Access denied', reason: 'binding_mismatch' },
          { status: 403 },
        )
      }
      const consult = await getConsult(consultId, tenantId)
      if (!consult?.triage_session_id) {
        return NextResponse.json(
          {
            error: 'Historian renewal is not authorized',
            reason: 'triage_authorization_missing',
          },
          { status: 409 },
        )
      }
      if (
        access.principal === 'patient' &&
        consult.patient_id !== access.context.patientId
      ) {
        return NextResponse.json(
          { error: 'Access denied', reason: 'binding_mismatch' },
          { status: 403 },
        )
      }

      const authorization = await loadHistorianAuthorization(
        consult.triage_session_id,
        tenantId,
      )
      if (!authorization.decision.allowed) {
        return NextResponse.json(
          {
            error: 'Historian renewal is not authorized',
            reason: authorization.decision.reason,
          },
          { status: 409 },
        )
      }

      const context = buildHistorianContextFromConsult(consult)
      referralReason = context.referralReason
      patientContext = context.patientContext
      approvedQuestions = authorization.approvedQuestions
      sessionType = 'referral_clarification'
    }

    // Referral clarification is Nova-only. This OpenAI-specific endpoint must
    // never mint a credential that would let browser code bypass the relay's
    // signed instructions/tool/voice/session-type boundary.
    if (sessionType === 'referral_clarification') {
      return NextResponse.json(
        {
          error: 'OpenAI renewal is not permitted for referral clarification',
          reason: 'referral_clarification_uses_signed_nova',
        },
        { status: 409 },
      )
    }

    const apiKey = await getOpenAIKey()
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured.' },
        { status: 500 },
      )
    }

    const model = process.env.OPENAI_HISTORIAN_REALTIME_MODEL || 'gpt-realtime-2'
    const turnDetection = getTurnDetectionConfig(process.env.HISTORIAN_TURN_DETECTION_MODE)
    const noiseReduction = getNoiseReductionConfig(process.env.HISTORIAN_NOISE_REDUCTION)
    const instructions = buildHistorianSystemPrompt(
      sessionType,
      referralReason,
      patientContext,
      approvedQuestions,
    )
    const tools = getHistorianToolDefinition(sessionType)

    const transcription: { model: string; prompt?: string } = { model: 'whisper-1' }
    if (isAsrBiasingEnabled()) {
      transcription.prompt = buildWhisperBiasPrompt()
    }

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

    let response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: buildBody(true),
    })

    if (!response.ok && noiseReduction) {
      console.warn('[historian/session-renew] retrying without noise_reduction')
      response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: buildBody(false),
      })
    }

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('[historian/session-renew] OpenAI error:', response.status, errorBody)
      return NextResponse.json(
        { error: `OpenAI returned ${response.status}`, openai_error: errorBody },
        { status: response.status },
      )
    }

    const data = await response.json()

    return NextResponse.json({
      ephemeralKey: data.value ?? data.client_secret?.value,
      expiresAt: data.expires_at ?? data.client_secret?.expires_at,
    })
  } catch (error: unknown) {
    console.error('[historian/session-renew] error:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to renew session',
      },
      { status: 500 },
    )
  }
}
