import crypto from 'crypto'
import http, { type IncomingMessage } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { NovaSonicSession } from './novaSonicSession.js'
import {
  COMPREHENSIVE_AGE_NUDGE,
  comprehensiveOpeningAction,
} from './comprehensiveOpening.js'
import { TranscribeMedicalSession } from './transcribeMedicalSession.js'
import type { ClientMsg, ServerMsg } from './wsProtocol.js'
import {
  buildContinuationInstructions,
  continuationHistory,
  validateContinuationCheckpoint,
} from './continuationCheckpoint.js'
import {
  ContinuationTestBoundarySchedule,
  continuationTestBoundaryAfterTool,
  continuationTestBoundaryExchanges,
} from './continuationTestSchedule.js'
import { sweepHeartbeatSockets, trackHeartbeat } from './websocketHeartbeat.js'
import {
  HistorianTurnQuarantine,
  PRODUCTION_TURN_CONFIRMATION_TIMEOUT_MS,
  parseApprovedHistorianTurn,
} from './turnAdmission.js'

const KNOWN_HISTORIAN_TOOL_NAMES = new Set([
  'request_history_question',
  'save_interview_output',
  'query_evidence',
  'scale_step',
])

const ADAPTIVE_QUESTION_ISSUE_CODES = new Set([
  'invalid_type',
  'too_long',
  'multiline',
  'question_shape',
  'unsolicited_example',
  'multiple_questions',
  'too_many_sentences',
  'acknowledgement_too_long',
  'formulaic_filler',
  'generic_symptom_reference',
  'diagnostic_assertion',
  'medical_advice',
  'clinical_redirect',
])

function isBoundedClinicalRedirect(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const text = value.trim()
  return (
    text.length > 0 &&
    text.length <= 280 &&
    !/[\r\n]/.test(text) &&
    (text.match(/\?/g) ?? []).length === 1
  )
}

function historianToolCategory(toolName: string): string {
  return KNOWN_HISTORIAN_TOOL_NAMES.has(toolName) ? toolName : 'unknown'
}

// ---------------------------------------------------------------------------
// HTTP server — answers GET /healthz for App Runner health checks; 404 otherwise.
// This handler only ever sees plain HTTP requests (GET /healthz or a 404) —
// the WS auth gate below hooks the `upgrade` path via verifyClient/
// handleProtocols and never touches this function, so /healthz stays
// unauthenticated for the ALB health check.
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
    return
  }
  res.writeHead(404)
  res.end()
})

// ---------------------------------------------------------------------------
// WebSocket upgrade authentication
//
// Browsers cannot set custom headers on a WebSocket handshake, so the caller
// (src/app/api/ai/historian/session/route.ts in the Next.js app) mints a
// short-lived HMAC token and the browser sends it as a WS SUBPROTOCOL
// alongside the fixed 'nova.v1' tag: `Sec-WebSocket-Protocol: nova.v1, <token>`.
//
// Token format: `${base64url(JSON.stringify({exp}))}.${base64url(HMAC_SHA256(secret, payload))}`.
// verifyClient recomputes the HMAC (timing-safe compare) and checks `exp`
// BEFORE the 101 handshake completes; handleProtocols only echoes back
// 'nova.v1' once verifyClient has already accepted the request — ws never
// calls handleProtocols after verifyClient rejects (aborts with 401 first).
//
// FAIL CLOSED: if NOVA_RELAY_SHARED_SECRET is not configured, every
// connection is rejected. There is no "auth disabled" mode.
// ---------------------------------------------------------------------------

const NOVA_PROTOCOL = 'nova.v1'

const SHARED_SECRET = process.env.NOVA_RELAY_SHARED_SECRET || ''
if (!SHARED_SECRET) {
  console.warn(
    '[nova-relay] NOVA_RELAY_SHARED_SECRET is not set — rejecting ALL WebSocket connections (fail closed).'
  )
}

const ALLOWED_ORIGINS = (process.env.NOVA_RELAY_ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

if (ALLOWED_ORIGINS.length === 0) {
  console.warn(
    '[nova-relay] NOVA_RELAY_ALLOWED_ORIGINS is not set — Origin header is not checked; the token is the sole gate.'
  )
}

// Optional, flag-gated (default OFF): runs AWS Transcribe Medical streaming
// transcription in parallel on the same caller audio Nova Sonic receives, as
// a higher-accuracy check on spoken identifiers (MRN/name/DOB) that
// Nova Sonic — speech-to-speech — is prone to dropping digits from. See
// transcribeMedicalSession.ts header comment for the fail-safe contract.
const TRANSCRIBE_MEDICAL_ENABLED =
  process.env.TRANSCRIBE_MEDICAL_ENABLED === 'true' || process.env.TRANSCRIBE_MEDICAL_ENABLED === '1'

if (TRANSCRIBE_MEDICAL_ENABLED) {
  console.log('[nova-relay] Transcribe Medical parallel transcription ENABLED')
}

function base64urlToBuffer(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function bufferToBase64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Validate a relay auth token against `secret`. Recomputes the HMAC over the
 * payload (timing-safe compare against the supplied signature), then checks
 * the embedded `exp` (unix seconds) is still in the future. See the header
 * comment above for the exact token format — it must match the minting logic
 * in the historian session route byte-for-byte.
 */
function isValidToken(token: string, secret: string): boolean {
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return false
  const payloadB64 = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  const expectedSig = bufferToBase64url(
    crypto.createHmac('sha256', secret).update(payloadB64).digest()
  )
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expectedSig)
  // timingSafeEqual throws on length mismatch — guard first, and a length
  // mismatch is itself decisive proof the signature is wrong.
  if (sigBuf.length !== expectedBuf.length) return false
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false

  let payload: { exp?: unknown }
  try {
    payload = JSON.parse(base64urlToBuffer(payloadB64).toString('utf8'))
  } catch {
    return false
  }
  return typeof payload.exp === 'number' && payload.exp > Date.now() / 1000
}

/** Parse the raw `Sec-WebSocket-Protocol` header into its comma-separated values. */
function parseRequestedProtocols(req: IncomingMessage): string[] {
  const header = req.headers['sec-websocket-protocol']
  if (!header) return []
  return header.split(',').map((p) => p.trim()).filter(Boolean)
}

/**
 * Gate the WS upgrade: reject (401, no 101 handshake) unless a secret is
 * configured, the Origin is allowed (when an allowlist is set), and the
 * client supplied a valid, unexpired token as one of its subprotocols.
 */
function verifyClient(info: { origin: string; secure: boolean; req: IncomingMessage }): boolean {
  if (!SHARED_SECRET) return false // fail closed — no secret configured

  if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(info.origin)) {
    console.warn(`[nova-relay] rejected connection: disallowed origin (${info.origin || '(none)'})`)
    return false
  }

  const protocols = parseRequestedProtocols(info.req)
  const token = protocols.find((p) => p !== NOVA_PROTOCOL)
  if (!token || !isValidToken(token, SHARED_SECRET)) {
    console.warn('[nova-relay] rejected connection: missing/invalid/expired token')
    return false
  }

  return true
}

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------

// maxPayload caps a single inbound frame (untrusted browser input). Audio
// frames are small base64 PCM; 1 MB leaves ample headroom for instructions /
// tool results while preventing unbounded allocation from a hostile client.
//
// verifyClient/handleProtocols gate the upgrade itself (see block above) —
// only a request with a valid token (and an allowed Origin, if configured)
// ever reaches the 'connection' handler below.
const wss = new WebSocketServer({
  server,
  maxPayload: 1024 * 1024,
  verifyClient,
  handleProtocols: (protocols) => (protocols.has(NOVA_PROTOCOL) ? NOVA_PROTOCOL : false),
})

// Protocol-level ping/pong keeps the outer browser-to-relay WebSocket active
// through managed load balancers and fails closed when the browser disappears.
// Browsers answer WebSocket ping frames automatically; no app message or
// transcript content is involved.
const heartbeatTimer = setInterval(() => sweepHeartbeatSockets(wss.clients), 25_000)
heartbeatTimer.unref()
wss.on('close', () => clearInterval(heartbeatTimer))

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

// Opt-in event-flow trace (RELAY_TRACE=1) for diagnosing stalls. No-op unless set.
const TRACE: (m: string) => void = process.env.RELAY_TRACE
  ? (m: string) => console.log(`[trace ${new Date().toISOString().slice(11, 23)}] ${m}`)
  : () => {}

// Application-owned Nova continuation is an explicit rollout flag. With the
// flag off, the relay retains the current fail-closed single-segment behavior.
const CONTINUATION_ENABLED = process.env.NOVA_APP_CONTINUATION_V1 === 'true'
// Default-off rollout gate for Comprehensive v2. The browser must also request
// it; a requested gate against an unconfigured relay fails closed at start.
const TURN_EVIDENCE_GATE_ENABLED = process.env.NOVA_HISTORIAN_TURN_GATE_V1 === 'true'
function continuationTiming(testEnvName: string, productionMs: number): number {
  if (process.env.NODE_ENV !== 'test') return productionMs
  const candidate = Number(process.env[testEnvName])
  return Number.isFinite(candidate) && candidate >= 1 ? candidate : productionMs
}
const CONTINUATION_DUE_MS = continuationTiming('NOVA_CONTINUATION_TEST_DUE_MS', 210_000)
const CONTINUATION_BARRIER_MS = continuationTiming('NOVA_CONTINUATION_TEST_BARRIER_MS', 240_000)
const CONTINUATION_DEADLINE_MS = continuationTiming('NOVA_CONTINUATION_TEST_DEADLINE_MS', 270_000)
const CANDIDATE_STABILITY_MS = continuationTiming('NOVA_CONTINUATION_TEST_STABILITY_MS', 1_000)
const CONTINUATION_TEST_BOUNDARY_EXCHANGES = continuationTestBoundaryExchanges()
const CONTINUATION_TEST_BOUNDARY_AFTER_TOOL = continuationTestBoundaryAfterTool()
const CONTINUATION_BUFFER_MAX_BASE64_CHARS = 1_280_000 // 30s PCM16@16k, base64 encoded
const OLD_SEGMENT_STOP_TIMEOUT_MS = 5_000
const TURN_CONFIRMATION_TIMEOUT_MS = continuationTiming(
  'NOVA_TURN_CONFIRMATION_TEST_TIMEOUT_MS',
  PRODUCTION_TURN_CONFIRMATION_TIMEOUT_MS,
)

wss.on('connection', (ws) => {
  trackHeartbeat(ws)
  // Random, non-patient trace id for correlating one relay connection's
  // metadata-only lifecycle. Never accept an id from the browser and never
  // log transcript, audio, tool arguments, invitation/session ids, or tokens.
  const traceId = crypto.randomUUID().slice(0, 12)
  const logSessionEvent = (
    event: string,
    details: Record<string, string | number | boolean | null> = {},
  ): void => {
    console.log(`[nova-session] ${JSON.stringify({ traceId, event, ...details })}`)
  }
  logSessionEvent('connection_open')
  // Track whether the AI is currently speaking so we can wrap turns with
  // aiSpeechStart / aiSpeechStop. This is an approximation: we emit
  // aiSpeechStart on the first audio chunk after silence, and aiSpeechStop on
  // the assistant AUDIO END_TURN marker (with completionEnd as a fallback) or
  // bargeIn. Nova 2 can delay completionEnd well after audible output ends.
  let aiSpeaking = false
  let interviewMode: 'standard' | 'comprehensive' = 'standard'
  let comprehensiveOpeningSettled = false
  let modelTerminalSent = false
  let clientStopping = false
  let sessionStarted = false
  let activeSegmentId = 1
  let segmentStartedAt = 0
  let lastAudioSeq = 0
  let sequencedAudio = false
  let outputQuarantined = false
  let rotationInProgress = false
  let dueSent = false
  let testBoundaryPending = false
  let continuationDeadlineAtMs = 0
  let dueTimer: ReturnType<typeof setTimeout> | null = null
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null
  const pendingTools = new Map<string, string>()
  let turnEvidenceControllerActive = false
  let adaptiveTurnControllerActive = false
  const controlledTurnActive = () =>
    turnEvidenceControllerActive || adaptiveTurnControllerActive
  let speechSuppressed = false
  const turnQuarantine = new HistorianTurnQuarantine(2_560_000)
  let pendingTurnAudioEndSegment: number | null = null
  let pendingTurnAudioEndAtMs = 0
  let turnConfirmationTimer: ReturnType<typeof setTimeout> | null = null
  let adaptiveInterruptedTurn = false
  let duplicateQuestionReauthorizationCount = 0
  let firstAudioObserved = false
  let userTranscriptBlockCount = 0
  let admittedTurnCount = 0
  let startConfig: {
    instructions: string
    tools: Parameters<NovaSonicSession['start']>[1]
    voiceId?: string
  } | null = null
  let bufferedAudio: Array<{ audioSeq: number; pcm: string }> = []
  let bufferedAudioChars = 0
  let lastContinuationCheckpoint: import('./wsProtocol.js').VoiceContinuationCheckpoint | null = null
  let openingSession: NovaSonicSession | null = null
  let barrier: {
    id: string
    segmentId: number
    lastAudioSeq: number
    deadlineAtMs: number
  } | null = null
  const testBoundarySchedule = new ContinuationTestBoundarySchedule(
    CONTINUATION_TEST_BOUNDARY_EXCHANGES,
    CONTINUATION_TEST_BOUNDARY_AFTER_TOOL,
  )

  function terminateModelSession(reason: 'nova_stream_error' | 'nova_stream_ended'): void {
    if (modelTerminalSent) return
    modelTerminalSent = true
    outputQuarantined = true
    clearTurnConfirmationTimer()
    void openingSession?.stop().catch(() => {})
    send(ws, { t: 'sessionEnded', reason })
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1011, reason)
    }
  }

  function rejectHistorianTurn(
    reason: string,
    diagnostics = turnQuarantine.diagnostics(),
  ): void {
    if (clientStopping || modelTerminalSent) return
    // Metadata only: never log or return the rejected response text/audio.
    console.error(`[nova-session] ${JSON.stringify({
      traceId,
      event: 'turn_rejected',
      reason,
      segmentId: activeSegmentId,
      ...diagnostics,
    })}`)
    speechSuppressed = true
    clearTurnConfirmationTimer()
    turnQuarantine.discard()
    send(ws, {
      t: 'error',
      message: 'The voice response did not satisfy the patient interview safety contract.',
    })
    terminateModelSession('nova_stream_error')
  }

  function clearContinuationTimers(): void {
    if (dueTimer) clearTimeout(dueTimer)
    if (deadlineTimer) clearTimeout(deadlineTimer)
    dueTimer = null
    deadlineTimer = null
  }

  function continuationApplicable(): boolean {
    return (
      CONTINUATION_ENABLED &&
      interviewMode === 'comprehensive' &&
      sequencedAudio &&
      !speechSuppressed
    )
  }

  function maybeSendContinuationDue(segmentId = activeSegmentId): void {
    if (
      testBoundarySchedule.enabled()
    ) return
    if (clientStopping || modelTerminalSent || !continuationApplicable() || dueSent || segmentId !== activeSegmentId || !segmentStartedAt) return
    if (Date.now() - segmentStartedAt < CONTINUATION_DUE_MS) return
    dueSent = true
    continuationDeadlineAtMs = segmentStartedAt + CONTINUATION_DEADLINE_MS
    send(ws, { t: 'continuationDue', segmentId, deadlineAtMs: continuationDeadlineAtMs })
  }

  function maybeSendTestBoundaryDue(): void {
    if (
      clientStopping ||
      modelTerminalSent ||
      !continuationApplicable() ||
      dueSent
    ) return
    dueSent = true
    testBoundaryPending = true
    continuationDeadlineAtMs = Date.now() + CONTINUATION_DEADLINE_MS
    send(ws, {
      t: 'continuationDue',
      segmentId: activeSegmentId,
      deadlineAtMs: continuationDeadlineAtMs,
    })
    deadlineTimer = setTimeout(() => {
      if (modelTerminalSent || speechSuppressed || !testBoundaryPending) return
      failContinuation('deadline', barrier?.id)
    }, CONTINUATION_DEADLINE_MS)
  }

  function armContinuationClock(): void {
    clearContinuationTimers()
    dueSent = false
    testBoundaryPending = false
    continuationDeadlineAtMs = 0
    segmentStartedAt = Date.now()
    const segmentId = activeSegmentId
    if (
      clientStopping ||
      modelTerminalSent ||
      speechSuppressed ||
      !CONTINUATION_ENABLED ||
      interviewMode !== 'comprehensive'
    ) return
    if (
      !testBoundarySchedule.enabled()
    ) {
      dueTimer = setTimeout(() => maybeSendContinuationDue(segmentId), CONTINUATION_DUE_MS)
      deadlineTimer = setTimeout(() => {
        if (segmentId !== activeSegmentId || modelTerminalSent || speechSuppressed) return
        failContinuation('deadline', barrier?.id)
      }, CONTINUATION_DEADLINE_MS)
    }
  }

  function failContinuation(
    reason: Extract<ServerMsg, { t: 'continuationFailed' }>['reason'],
    barrierId?: string,
  ): void {
    if (clientStopping || modelTerminalSent) return
    clearContinuationTimers()
    outputQuarantined = true
    rotationInProgress = false
    send(ws, { t: 'continuationFailed', barrierId, reason })
    terminateModelSession('nova_stream_error')
  }

  function startAiSpeech(): void {
    if (outputQuarantined) return
    if (!aiSpeaking) {
      aiSpeaking = true
      TRACE('-> aiSpeechStart')
      send(ws, { t: 'aiSpeechStart', segmentId: activeSegmentId })
    }
  }

  function stopAiSpeech(): void {
    if (aiSpeaking) {
      aiSpeaking = false
      TRACE('-> aiSpeechStop')
      if (!outputQuarantined) send(ws, { t: 'aiSpeechStop', segmentId: activeSegmentId })
    }
  }

  function maybeOpenBarrier(): void {
    if (
      !continuationApplicable() ||
      !dueSent ||
      barrier ||
      rotationInProgress ||
      aiSpeaking ||
      pendingTools.size > 0 ||
      (controlledTurnActive() && (turnQuarantine.hasAuthorization() || turnQuarantine.hasContent())) ||
      speechSuppressed ||
      clientStopping ||
      modelTerminalSent ||
      (!testBoundaryPending && Date.now() - segmentStartedAt < CONTINUATION_BARRIER_MS)
    ) return
    const id = crypto.randomUUID()
    const deadlineAtMs = continuationDeadlineAtMs || segmentStartedAt + CONTINUATION_DEADLINE_MS
    barrier = {
      id,
      segmentId: activeSegmentId,
      lastAudioSeq,
      deadlineAtMs,
    }
    outputQuarantined = true
    send(ws, {
      t: 'continuationBarrier',
      barrierId: id,
      segmentId: activeSegmentId,
      lastAudioSeq,
      deadlineAtMs,
    })
  }

  function clearTurnConfirmationTimer(): void {
    if (turnConfirmationTimer) clearTimeout(turnConfirmationTimer)
    turnConfirmationTimer = null
    pendingTurnAudioEndSegment = null
    pendingTurnAudioEndAtMs = 0
  }

  function finishAssistantBoundary(): void {
    stopAiSpeech()
    if (testBoundarySchedule.observeAssistantBoundary()) {
      maybeSendTestBoundaryDue()
    }
    maybeOpenBarrier()
  }

  /**
   * Nova emits FINAL transcription sentence by sentence after AUDIO END_TURN
   * and may delay completionEnd indefinitely on a continuous stream. Nova's
   * paired speculative/final block counts plus full-text equality prove every
   * planned sentence was confirmed. A partial first FINAL sentence cannot
   * trigger this boundary.
   */
  function tryFinalizeControlledTurn(segmentId: number): boolean {
    if (
      pendingTurnAudioEndSegment !== segmentId ||
      segmentId !== activeSegmentId ||
      !turnQuarantine.hasConfirmedTextMatch()
    ) return false

    const diagnostics = turnQuarantine.diagnostics()
    const confirmationWaitMs = pendingTurnAudioEndAtMs > 0
      ? Math.max(0, Date.now() - pendingTurnAudioEndAtMs)
      : 0
    clearTurnConfirmationTimer()
    const admitted = turnQuarantine.finalize()
    if (!admitted.allowed) {
      rejectHistorianTurn(admitted.reason, diagnostics)
      return true
    }

    admittedTurnCount += 1
    duplicateQuestionReauthorizationCount = 0
    logSessionEvent('turn_admitted', {
      segmentId,
      turn: admittedTurnCount,
      mode: admitted.mode,
      streamedBeforeFinal: admitted.alreadyReleased === true,
      confirmationWaitMs,
      ...diagnostics,
    })
    if (admitted.alreadyReleased) {
      // Audio ended before Nova emitted its delayed FINAL transcript. The
      // browser boundary was already closed at AUDIO END_TURN; FINAL merely
      // confirms the exact application-approved question after the fact.
      maybeOpenBarrier()
    } else {
      startAiSpeech()
      send(ws, {
        t: 'assistantTranscript',
        text: admitted.text,
        segmentId,
        ...(admitted.obligationId ? { obligationId: admitted.obligationId } : {}),
      })
      for (const pcm of admitted.audio) send(ws, { t: 'audio', pcm, segmentId })
      finishAssistantBoundary()
    }
    return true
  }

  function observeControlledAudioEnd(segmentId: number): void {
    if (pendingTurnAudioEndSegment !== null) {
      rejectHistorianTurn('overlapping_audio_end')
      return
    }
    pendingTurnAudioEndSegment = segmentId
    pendingTurnAudioEndAtMs = Date.now()
    logSessionEvent('turn_audio_end', {
      segmentId,
      ...turnQuarantine.diagnostics(),
    })
    if (turnQuarantine.hasApprovedQuestionStreaming()) {
      // Do not make the patient wait for Nova's delayed FINAL transcription
      // before the browser learns that audible speech has ended.
      finishAssistantBoundary()
    }
    if (tryFinalizeControlledTurn(segmentId)) return
    turnConfirmationTimer = setTimeout(() => {
      if (pendingTurnAudioEndSegment !== segmentId || modelTerminalSent || clientStopping) return
      const diagnostics = turnQuarantine.diagnostics()
      const result = turnQuarantine.finalize()
      rejectHistorianTurn(
        result.allowed ? 'turn_confirmation_timeout' : result.reason,
        diagnostics,
      )
    }, TURN_CONFIRMATION_TIMEOUT_MS)
  }

  type CandidateControl = {
    preparing: boolean
    failed: boolean
    failure?: string
  }

  function createSession(
    segmentId: number,
    candidate?: CandidateControl,
  ): NovaSonicSession {
    const rejectCandidateActivity = (activity: string): boolean => {
      if (!candidate?.preparing) return false
      candidate.failed = true
      candidate.failure ??= activity
      return true
    }
    return new NovaSonicSession({
    onTextOutput(role, content) {
      if (rejectCandidateActivity(`unexpected_${role.toLowerCase()}_text`)) return
      if (segmentId !== activeSegmentId || outputQuarantined) return
      TRACE(`-> text[${role}] chars=${content.length}`)
      if (role.toUpperCase() === 'USER') {
        userTranscriptBlockCount += 1
        // Structural timing only. Never log transcript text or identifiers.
        logSessionEvent('user_transcript_block', {
          segmentId,
          block: userTranscriptBlockCount,
        })
        send(ws, { t: 'userTranscript', text: content, segmentId })
        // Comprehensive v2's application ledger owns every next question,
        // including age. The legacy relay nudge would race that approval and
        // could create an unauthorised second response.
        if (!controlledTurnActive()) {
          const action = comprehensiveOpeningAction(
            interviewMode,
            comprehensiveOpeningSettled,
            content,
          )
          if (action !== 'ignore') {
            comprehensiveOpeningSettled = true
            if (action === 'ask_age') session.pushSystemText(COMPREHENSIVE_AGE_NUDGE)
          }
        }
      } else {
        if (controlledTurnActive()) {
          if (adaptiveInterruptedTurn) return
          if (!speechSuppressed) {
            if (!turnQuarantine.bufferText(content)) {
              rejectHistorianTurn('speculative_text_after_release')
              return
            }
            tryFinalizeControlledTurn(segmentId)
          }
          return
        }
        send(ws, { t: 'assistantTranscript', text: content, segmentId })
      }
    },

    onAssistantFinalText(content) {
      if (rejectCandidateActivity('unexpected_assistant_final_text')) return
      if (segmentId !== activeSegmentId || outputQuarantined) return
      if (controlledTurnActive() && !speechSuppressed) {
        if (adaptiveInterruptedTurn) return
        turnQuarantine.bufferFinalText(content)
        tryFinalizeControlledTurn(segmentId)
      }
    },

    onAudioOutput(base64) {
      if (rejectCandidateActivity('unexpected_audio')) return
      if (segmentId !== activeSegmentId || outputQuarantined) return
      if (controlledTurnActive()) {
        if (speechSuppressed || adaptiveInterruptedTurn) return
        // AUDIO END_TURN is the authorization boundary for the quarantined
        // response. Any later PCM is ambiguous protocol output and must never
        // be released under the preceding question approval while we wait for
        // Nova's delayed FINAL text copy.
        if (pendingTurnAudioEndSegment === segmentId) {
          rejectHistorianTurn('audio_after_turn_boundary')
          return
        }
        if (
          adaptiveTurnControllerActive &&
          turnQuarantine.hasApprovedQuestionAuthorization()
        ) {
          if (!turnQuarantine.hasApprovedQuestionStreaming()) {
            const release = turnQuarantine.beginApprovedQuestionStreaming()
            if (!release.allowed) {
              rejectHistorianTurn(release.reason)
              return
            }
            logSessionEvent('adaptive_question_stream_started', {
              segmentId,
              ...turnQuarantine.diagnostics(),
            })
            startAiSpeech()
            send(ws, {
              t: 'assistantTranscript',
              text: release.text,
              segmentId,
              obligationId: release.obligationId,
            })
          }
          if (!turnQuarantine.observeStreamedAudio(base64)) {
            rejectHistorianTurn('audio_stream_overflow')
            return
          }
          send(ws, { t: 'audio', pcm: base64, segmentId })
          return
        }
        if (!turnQuarantine.bufferAudio(base64)) {
          rejectHistorianTurn('audio_buffer_overflow')
        }
        return
      }
      startAiSpeech()
      send(ws, { t: 'audio', pcm: base64, segmentId })
    },

    onAssistantAudioEnd() {
      if (rejectCandidateActivity('unexpected_assistant_end')) return
      if (segmentId !== activeSegmentId) return
      TRACE('-> assistantAudioEnd')
      if (controlledTurnActive()) {
        if (adaptiveInterruptedTurn) {
          adaptiveInterruptedTurn = false
          duplicateQuestionReauthorizationCount = 0
          clearTurnConfirmationTimer()
          turnQuarantine.discard()
          maybeOpenBarrier()
          return
        }
        if (speechSuppressed) {
          clearTurnConfirmationTimer()
          turnQuarantine.discard()
          return
        }
        observeControlledAudioEnd(segmentId)
        return
      }
      finishAssistantBoundary()
    },

    onToolUse({ toolName, toolUseId, content }) {
      if (rejectCandidateActivity('unexpected_tool')) return
      if (segmentId !== activeSegmentId) return
      if (adaptiveInterruptedTurn) {
        rejectHistorianTurn('tool_during_interrupted_turn')
        return
      }
      if (controlledTurnActive() && turnQuarantine.hasContent()) {
        rejectHistorianTurn('speech_before_tool')
        return
      }
      TRACE(`-> toolUse ${historianToolCategory(toolName)} id=${toolUseId} contentChars=${String(content).length}`)
      // Never log raw model-controlled tool names. A malformed name could
      // contain patient-derived text. This fixed category is structural only.
      logSessionEvent('tool_requested', {
        segmentId,
        toolCategory: historianToolCategory(toolName),
      })
      if (
        adaptiveTurnControllerActive &&
        toolName === 'request_history_question' &&
        !turnQuarantine.hasContent()
      ) {
        const currentApproval = turnQuarantine.currentApprovedQuestion()
        if (currentApproval) {
          // A mid-stream USER-role note (or a provider duplicate) can make
          // Nova request another question after one exact question is already
          // authorized but before its first text/audio arrives. Never ask the
          // browser to authorize a second obligation. Rebind one duplicate
          // tool call to the existing exact approval; a second duplicate is a
          // protocol loop and still fails closed.
          if (duplicateQuestionReauthorizationCount >= 1) {
            rejectHistorianTurn('duplicate_question_retry_limit')
            return
          }
          duplicateQuestionReauthorizationCount += 1
          logSessionEvent('duplicate_question_reauthorized', { segmentId })
          session.pushToolResult(toolUseId, JSON.stringify({
            success: true,
            status: 'approved',
            obligation_id: currentApproval.obligationId,
            approved_text: currentApproval.approvedText,
            allow_example: currentApproval.allowExample,
          }))
          return
        }
      }
      let input: unknown = content
      try {
        input = JSON.parse(content)
      } catch {
        // content is not JSON — pass through as a raw string
      }
      pendingTools.set(toolUseId, toolName)
      testBoundarySchedule.observeTool(toolName)
      if (barrier) {
        // A late normal tool means the assistant boundary was not actually
        // quiescent. ToolUseIds are segment-scoped, so never migrate it.
        failContinuation('pending_tool', barrier.id)
        return
      }
      send(ws, { t: 'toolCall', toolName, toolUseId, input, segmentId })
    },

    onCompletionEnd() {
      if (rejectCandidateActivity('unexpected_completion')) return
      if (segmentId !== activeSegmentId || outputQuarantined) return
      if (adaptiveInterruptedTurn) {
        adaptiveInterruptedTurn = false
        clearTurnConfirmationTimer()
        turnQuarantine.discard()
        maybeOpenBarrier()
        return
      }
      if (controlledTurnActive() && pendingTurnAudioEndSegment === segmentId) {
        logSessionEvent('turn_completion_end', {
          segmentId,
          ...turnQuarantine.diagnostics(),
        })
        tryFinalizeControlledTurn(segmentId)
        return
      }
      if (controlledTurnActive() && turnQuarantine.hasContent()) {
        rejectHistorianTurn('completion_before_audio_end')
        return
      }
      TRACE('-> completionEnd')
      stopAiSpeech()
      send(ws, { t: 'completion', segmentId })
    },

    onBargeIn() {
      if (rejectCandidateActivity('unexpected_barge_in')) return
      if (segmentId !== activeSegmentId || outputQuarantined) return
      if (turnEvidenceControllerActive && (turnQuarantine.hasContent() || turnQuarantine.hasAuthorization())) {
        rejectHistorianTurn('ambiguous_barge_in')
        return
      }
      if (adaptiveTurnControllerActive && (turnQuarantine.hasContent() || turnQuarantine.hasAuthorization())) {
        adaptiveInterruptedTurn = true
        clearTurnConfirmationTimer()
        turnQuarantine.discard()
        logSessionEvent('adaptive_turn_interrupted', { segmentId })
      }
      TRACE('-> bargeIn')
      stopAiSpeech()
      send(ws, { t: 'bargeIn', segmentId })
    },

    onError(err) {
      if (rejectCandidateActivity('stream_error')) {
        console.error('[nova-session] candidate stream error before promotion:', err)
        return
      }
      if (segmentId !== activeSegmentId) return
      // Nova's bidi exceptions (modelStreamErrorException / internalServerException)
      // arrive as PLAIN OBJECTS, so a bare String(err) collapses to "[object
      // Object]" and the real cause is lost. Extract a meaningful message and log
      // the full error server-side so the relay log captures the actual failure.
      const anyErr = err as { name?: string; message?: string } | null
      let message: string
      if (err instanceof Error) {
        message = err.message
      } else if (anyErr && typeof anyErr === 'object' && (anyErr.message || anyErr.name)) {
        message = [anyErr.name, anyErr.message].filter(Boolean).join(': ')
      } else {
        try { message = JSON.stringify(err) } catch { message = String(err) }
      }
      console.error('[nova-session] stream error:', message, err)
      if (barrier || segmentId > 1) {
        failContinuation('stream_start_failed', barrier?.id)
        return
      }
      send(ws, { t: 'error', message })
      terminateModelSession('nova_stream_error')
    },

    onUnexpectedStreamEnd() {
      if (rejectCandidateActivity('stream_ended')) {
        console.error('[nova-session] candidate stream ended before promotion')
        return
      }
      if (segmentId !== activeSegmentId) return
      console.error('[nova-session] Bedrock stream ended before the client requested stop')
      if (barrier || segmentId > 1) {
        failContinuation('stream_start_failed', barrier?.id)
        return
      }
      terminateModelSession('nova_stream_ended')
    },
  })
  }

  let session = createSession(activeSegmentId)

  // Optional, flag-gated (default OFF) parallel AWS Transcribe Medical stream
  // on the same caller audio — see transcribeMedicalSession.ts. Wrapped in
  // try/catch so any construction/start failure never blocks the Nova Sonic
  // session above: on any throw here, we log and continue Nova-only.
  let transcribe: TranscribeMedicalSession | null = null
  if (TRANSCRIBE_MEDICAL_ENABLED) {
    try {
      transcribe = new TranscribeMedicalSession({
        onTranscript: (text, isPartial) => send(ws, { t: 'medicalTranscript', text, isPartial }),
        onError: (e) =>
          console.error('[transcribe-medical] error (continuing Nova-only):', e instanceof Error ? e.message : e),
      })
      transcribe.start().catch(() => {})
    } catch (e) {
      console.error('[transcribe-medical] setup failed (continuing Nova-only):', e instanceof Error ? e.message : e)
      transcribe = null
    }
  }

  ws.on('message', (raw) => {
    let msg: ClientMsg
    try {
      msg = JSON.parse(raw.toString()) as ClientMsg
    } catch {
      send(ws, { t: 'error', message: 'bad message' })
      return
    }

    if (msg.t !== 'audio') TRACE(`<- ${msg.t}`)
    if (clientStopping) return

    try {
      switch (msg.t) {
        case 'start':
          if (sessionStarted) {
            send(ws, { t: 'error', message: 'session already started' })
            break
          }
          sessionStarted = true
          interviewMode = msg.interviewMode === 'comprehensive' ? 'comprehensive' : 'standard'
          if (
            (msg.turnEvidenceController === true || msg.adaptiveTurnController === true) &&
            !TURN_EVIDENCE_GATE_ENABLED
          ) {
            rejectHistorianTurn('requested_gate_unavailable')
            break
          }
          turnEvidenceControllerActive =
            msg.turnEvidenceController === true &&
            TURN_EVIDENCE_GATE_ENABLED &&
            interviewMode === 'comprehensive'
          adaptiveTurnControllerActive =
            msg.adaptiveTurnController === true &&
            TURN_EVIDENCE_GATE_ENABLED &&
            interviewMode === 'comprehensive'
          speechSuppressed = false
          adaptiveInterruptedTurn = false
          duplicateQuestionReauthorizationCount = 0
          clearTurnConfirmationTimer()
          turnQuarantine.discard()
          comprehensiveOpeningSettled = false
          startConfig = {
            instructions: msg.instructions,
            tools: msg.tools as Parameters<NovaSonicSession['start']>[1],
            voiceId: msg.voiceId,
          }
          TRACE(`<- start (tools=${(msg.tools as unknown[] | undefined)?.length ?? 0})`)
          logSessionEvent('start_received', {
            interviewMode,
            turnEvidenceControllerRequested: msg.turnEvidenceController === true,
            turnEvidenceControllerActive,
            adaptiveTurnControllerRequested: msg.adaptiveTurnController === true,
            adaptiveTurnControllerActive,
          })
          // start() surfaces any stream-open failure via the session's onError
          // callback (mapped to {t:'error'} above). This .catch only prevents an
          // unhandled rejection from the un-awaited promise — it must NOT send a
          // second error, or the browser receives the same failure twice.
          session.start(startConfig.instructions, startConfig.tools, startConfig.voiceId)
            .then(() => {
              if (!clientStopping && !modelTerminalSent && session.isActive()) {
                logSessionEvent('model_stream_active', { segmentId: activeSegmentId })
                armContinuationClock()
              }
            })
            .catch(() => {})
          break

        case 'audio':
          if (!firstAudioObserved) {
            firstAudioObserved = true
            logSessionEvent('first_microphone_audio', { segmentId: activeSegmentId })
          }
          if (typeof msg.audioSeq === 'number') {
            if (!Number.isInteger(msg.audioSeq) || msg.audioSeq !== lastAudioSeq + 1) {
              failContinuation('audio_sequence', barrier?.id)
              break
            }
            sequencedAudio = true
            lastAudioSeq = msg.audioSeq
            maybeSendContinuationDue()
          } else if (sequencedAudio || barrier) {
            failContinuation('audio_sequence', barrier?.id)
            break
          }
          if (barrier) {
            if (typeof msg.audioSeq !== 'number') {
              failContinuation('audio_sequence', barrier.id)
              break
            }
            bufferedAudio.push({ audioSeq: msg.audioSeq, pcm: msg.pcm })
            bufferedAudioChars += msg.pcm.length
            if (bufferedAudioChars > CONTINUATION_BUFFER_MAX_BASE64_CHARS) {
              failContinuation('buffer_overflow', barrier.id)
              break
            }
          } else {
            session.pushAudio(msg.pcm)
          }
          transcribe?.pushAudio(msg.pcm)
          break

        case 'userTurnEnd':
          // Nova Sonic performs its own turn detection; userTurnEnd is reserved
          // for future explicit VAD signaling. No-op for now.
          break

        case 'toolResult':
          if (msg.segmentId != null && msg.segmentId !== activeSegmentId) {
            failContinuation('checkpoint_mismatch', barrier?.id)
            break
          }
          if (!pendingTools.has(msg.toolUseId)) {
            failContinuation('checkpoint_mismatch', barrier?.id)
            break
          }
          {
            const toolName = pendingTools.get(msg.toolUseId)!
            let parsedOutput: unknown = msg.output
            try { parsedOutput = JSON.parse(msg.output) } catch {}
            let approvedQuestion: ReturnType<typeof parseApprovedHistorianTurn> = null
            if (controlledTurnActive() && toolName === 'request_history_question') {
              approvedQuestion = parseApprovedHistorianTurn(parsedOutput)
              const outputRecord = parsedOutput && typeof parsedOutput === 'object'
                ? parsedOutput as Record<string, unknown>
                : null
              const suppressedTerminalResult =
                speechSuppressed &&
                outputRecord?.success === false &&
                outputRecord.status === 'interview_terminal' &&
                Object.keys(outputRecord).length === 2
              const adaptiveProposalRejected =
                adaptiveTurnControllerActive &&
                outputRecord?.success === false &&
                outputRecord.status === 'proposal_rejected' &&
                Array.isArray(outputRecord.issue_codes) &&
                outputRecord.issue_codes.length > 0 &&
                outputRecord.issue_codes.length <= ADAPTIVE_QUESTION_ISSUE_CODES.size &&
                new Set(outputRecord.issue_codes).size === outputRecord.issue_codes.length &&
                outputRecord.issue_codes.every((code) => (
                  typeof code === 'string' && ADAPTIVE_QUESTION_ISSUE_CODES.has(code)
                )) &&
                (outputRecord.issue_codes.includes('clinical_redirect')
                  ? outputRecord.issue_codes.length === 1 &&
                    isBoundedClinicalRedirect(outputRecord.required_text)
                  : outputRecord.required_text === undefined) &&
                Object.keys(outputRecord).every((key) => (
                  key === 'success' ||
                  key === 'status' ||
                  key === 'issue_codes' ||
                  key === 'required_text'
                ))
              if (approvedQuestion) {
                if (!turnQuarantine.approveQuestion(approvedQuestion)) {
                  rejectHistorianTurn('overlapping_question_approval')
                  break
                }
                duplicateQuestionReauthorizationCount = 0
                logSessionEvent('question_authorized', { segmentId: activeSegmentId })
              } else if (
                outputRecord?.status !== 'coverage_ready' &&
                !adaptiveProposalRejected &&
                !suppressedTerminalResult
              ) {
                rejectHistorianTurn('invalid_question_approval')
                break
              }
            }
            if (
              controlledTurnActive() &&
              toolName === 'save_interview_output' &&
              !speechSuppressed &&
              parsedOutput &&
              typeof parsedOutput === 'object' &&
              (parsedOutput as Record<string, unknown>).success === true &&
              !turnQuarantine.allowControl('terminal_statement')
            ) {
              rejectHistorianTurn('closing_authorization_conflict')
              break
            }
            session.pushToolResult(msg.toolUseId, msg.output)
            pendingTools.delete(msg.toolUseId)
            if (approvedQuestion && !adaptiveTurnControllerActive) {
              // Comprehensive v2 receives an application-authored question,
              // so retain its explicit reinforcement. In adaptive v3 the
              // approved text is already Nova's exact proposal (including an
              // exact Claude redirect resubmission). Sending another USER-role
              // message here can be mistaken for a new patient turn and cause
              // a duplicate tool call before speech.
              session.pushSystemText(
                `[APPLICATION-OWNED APPROVED QUESTION] Speak exactly the approved_text from the tool result now. Do not add, remove, explain, acknowledge, or ask anything else. approved_text=${JSON.stringify(approvedQuestion.approvedText)}`,
              )
            }
          }
          TRACE(`<- toolResult id=${msg.toolUseId} (content redacted)`)
          if (!barrier) maybeOpenBarrier()
          break

        case 'systemText':
          if (barrier) {
            failContinuation('checkpoint_mismatch', barrier.id)
            break
          }
          if (controlledTurnActive() && !speechSuppressed) {
            const controlMode = msg.text.startsWith('[The patient has not said anything')
              ? 'unresponsive_check_in'
              : msg.text.startsWith('[The patient still has not responded')
                ? 'unresponsive_sign_off'
                : null
            if (controlMode && !turnQuarantine.allowControl(controlMode)) {
              rejectHistorianTurn('control_turn_authorization_conflict')
              break
            }
          }
          TRACE(`<- systemText (injected as USER) chars=${msg.text.length}`)
          session.pushSystemText(msg.text)
          break

        case 'suppressOutput':
          speechSuppressed = true
          clearTurnConfirmationTimer()
          turnQuarantine.discard()
          // Terminal suppression permanently retires continuation for this
          // session. In particular, a due/deadline timer must not race the
          // silent save, and removing a pre-commit barrier restores the old
          // active stream as the sole tool owner without replaying patient PCM.
          clearContinuationTimers()
          dueSent = false
          testBoundaryPending = false
          continuationDeadlineAtMs = 0
          if (barrier && !rotationInProgress) {
            barrier = null
            outputQuarantined = false
            bufferedAudio = []
            bufferedAudioChars = 0
          }
          stopAiSpeech()
          break

        case 'continuationDefer':
          if (speechSuppressed) break
          if (!barrier || barrier.id !== msg.barrierId || rotationInProgress) {
            failContinuation('checkpoint_mismatch', msg.barrierId)
            break
          }
          if (!session.isActive()) {
            failContinuation('stream_start_failed', msg.barrierId)
            break
          }
          {
            const replay = bufferedAudio
            bufferedAudio = []
            bufferedAudioChars = 0
            barrier = null
            outputQuarantined = false
            for (const chunk of replay) session.pushAudio(chunk.pcm)
          }
          break

        case 'continuationCommit': {
          if (speechSuppressed) break
          if (
            !barrier ||
            barrier.id !== msg.barrierId ||
            pendingTools.size !== 0 ||
            rotationInProgress
          ) {
            failContinuation('checkpoint_mismatch', msg.barrierId)
            break
          }
          const checked = validateContinuationCheckpoint(msg.checkpoint, {
            segmentId: barrier.segmentId,
            previous: lastContinuationCheckpoint,
          })
          if (!checked.ok) {
            failContinuation(checked.reason, barrier.id)
            break
          }
          if (!startConfig) {
            failContinuation('stream_start_failed', barrier.id)
            break
          }
          rotationInProgress = true
          const committedBarrier = barrier
          const oldSession = session
          void (async () => {
            const nextSegmentId = committedBarrier.segmentId + 1
            const candidate: CandidateControl = { preparing: true, failed: false }
            const nextSession = createSession(nextSegmentId, candidate)
            openingSession = nextSession
            TRACE(`continuation candidate segment ${nextSegmentId} opening`)

            const recoverOldSegment = async (): Promise<void> => {
              // Recovery is permitted only before the atomic promotion. First
              // prove the failed candidate is retired; otherwise two possibly
              // live streams would make replay ownership ambiguous.
              candidate.preparing = false
              const candidateStopped = await nextSession.stopWithin(OLD_SEGMENT_STOP_TIMEOUT_MS)
              if (
                !candidateStopped ||
                clientStopping ||
                modelTerminalSent ||
                ws.readyState !== WebSocket.OPEN ||
                Date.now() >= committedBarrier.deadlineAtMs ||
                session !== oldSession ||
                activeSegmentId !== committedBarrier.segmentId ||
                barrier?.id !== committedBarrier.id ||
                !oldSession.isActive()
              ) {
                failContinuation('stream_start_failed', committedBarrier.id)
                return
              }

              // Clear ownership before replay. No await occurs between this
              // state transition and the push loop, so each buffered audioSeq
              // is returned to the old stream exactly once.
              const replay = bufferedAudio
              bufferedAudio = []
              bufferedAudioChars = 0
              openingSession = null
              barrier = null
              outputQuarantined = false
              rotationInProgress = false
              for (const chunk of replay) oldSession.pushAudio(chunk.pcm)
              send(ws, {
                t: 'continuationRecovered',
                barrierId: committedBarrier.id,
                segmentId: committedBarrier.segmentId,
                lastAudioSeq: committedBarrier.lastAudioSeq,
                transcriptThroughSeq: checked.checkpoint.transcriptThroughSeq,
                reason: 'candidate_start_failed',
              })
            }

            try {
              await nextSession.start(
                buildContinuationInstructions(startConfig!.instructions, checked.checkpoint),
                startConfig!.tools,
                startConfig!.voiceId,
                {
                  sendGreetingKickoff: false,
                  conversationHistory: continuationHistory(checked.checkpoint),
                },
              )
            } catch {
              TRACE(`continuation candidate segment ${nextSegmentId} start rejected`)
              await recoverOldSegment()
              return
            }

            TRACE(`continuation candidate segment ${nextSegmentId} stream opened`)

            const transportReady = await nextSession.waitUntilTransportReady(
              CANDIDATE_STABILITY_MS,
            )
            TRACE(
              `continuation candidate segment ${nextSegmentId} readiness=${transportReady && !candidate.failed}`,
            )
            if (!transportReady || candidate.failed) {
              await recoverOldSegment()
              return
            }

            // Stop/terminal/deadline can win while the candidate is opening or
            // stabilizing. Never promote or drain after any such owner change.
            if (
              clientStopping ||
              modelTerminalSent ||
              ws.readyState !== WebSocket.OPEN ||
              Date.now() >= committedBarrier.deadlineAtMs ||
              barrier?.id !== committedBarrier.id ||
              session !== oldSession ||
              activeSegmentId !== committedBarrier.segmentId
            ) {
              await nextSession.stop().catch(() => {})
              openingSession = null
              if (!clientStopping && !modelTerminalSent && ws.readyState === WebSocket.OPEN) {
                failContinuation('deadline', committedBarrier.id)
              }
              return
            }

            // Atomic no-return promotion: candidate becomes the sole owner,
            // ready is queued before any candidate-origin activity, and the
            // buffered PCM is drained once. The frozen old stream is retired
            // afterward and cannot emit through the generation gate.
            candidate.preparing = false
            openingSession = null
            session = nextSession
            lastContinuationCheckpoint = checked.checkpoint
            activeSegmentId = nextSegmentId
            comprehensiveOpeningSettled = true
            aiSpeaking = false
            outputQuarantined = false
            rotationInProgress = false
            barrier = null
            const replay = bufferedAudio
            bufferedAudio = []
            bufferedAudioChars = 0
            send(ws, {
              t: 'continuationReady',
              barrierId: committedBarrier.id,
              fromSegmentId: committedBarrier.segmentId,
              segmentId: nextSegmentId,
              lastAudioSeq: committedBarrier.lastAudioSeq,
              transcriptThroughSeq: checked.checkpoint.transcriptThroughSeq,
            })
            for (const chunk of replay) nextSession.pushAudio(chunk.pcm)
            armContinuationClock()

            const oldStopped = await oldSession.stopWithin(OLD_SEGMENT_STOP_TIMEOUT_MS)
            if (!oldStopped && !clientStopping && !modelTerminalSent) {
              failContinuation('stream_start_failed', committedBarrier.id)
            }
          })()
          break
        }

        case 'stop':
          if (clientStopping) break
          clientStopping = true
          logSessionEvent('client_stop', {
            segmentId: activeSegmentId,
            firstAudioObserved,
            admittedTurnCount,
          })
          clearContinuationTimers()
          clearTurnConfirmationTimer()
          outputQuarantined = true
          transcribe?.stop().catch(() => {})
          {
            const activeAtStop = session
            const openingAtStop = openingSession
            openingSession = null
            Promise.allSettled([
              activeAtStop.stop(),
              ...(openingAtStop && openingAtStop !== activeAtStop ? [openingAtStop.stop()] : []),
            ]).then(() => {
              ws.close()
            })
          }
          break

        default: {
          // Exhaustive check — TypeScript will catch unhandled variants at
          // compile time; at runtime guard against malformed messages.
          const t = (msg as { t: string }).t
          send(ws, { t: 'error', message: `unknown message type: ${t}` })
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      send(ws, { t: 'error', message })
    }
  })

  ws.on('close', (code) => {
    clientStopping = true
    logSessionEvent('connection_closed', {
      code,
      sessionStarted,
      firstAudioObserved,
      admittedTurnCount,
      modelTerminalSent,
    })
    clearContinuationTimers()
    clearTurnConfirmationTimer()
    // Best-effort teardown — ignore any errors from stop().
    session.stop().catch(() => {})
    if (openingSession && openingSession !== session) openingSession.stop().catch(() => {})
    openingSession = null
    transcribe?.stop().catch(() => {})
  })
})

// ---------------------------------------------------------------------------
// Start listening
// ---------------------------------------------------------------------------

const configuredPort = Number(process.env.PORT)
const PORT = Number.isInteger(configuredPort) && (
  configuredPort > 0 || (configuredPort === 0 && process.env.NODE_ENV === 'test')
) ? configuredPort : 8081
// Bind explicitly to 0.0.0.0 (IPv4). Node's default `listen(PORT)` binds the
// IPv6 unspecified address (::), which App Runner's IPv4 TCP health check
// cannot reach in its container network — the app runs but the deploy fails
// the health check with no application logs. Explicit IPv4 bind fixes it.
server.listen(PORT, '0.0.0.0', () => {
  console.log(`relay on port ${PORT}`)
})

// Exported for the relay's in-process protocol integration test only.
export { server, wss }
