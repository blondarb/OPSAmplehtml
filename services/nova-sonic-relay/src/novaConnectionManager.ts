import { NovaSonicSession } from './novaSonicSession.js'
import type { NovaSonicCallbacks, NovaSonicStartOptions, HistoryTurn } from './novaSonicSession.js'
import type { Tool, HistoryRole } from './eventBuilders.js'
import { silencePcmBase64 } from './audioConstants.js'

// ---------------------------------------------------------------------------
// NovaConnectionManager
//
// Amazon Nova 2 Sonic enforces a hard ~8-minute limit per bidirectional
// stream ("Connection limit of 8 minutes, with connection renewal and
// session continuation pattern available in code samples" —
// docs.aws.amazon.com/nova/latest/nova2-userguide/using-conversational-speech.html).
// The historian interview runs 15-20 minutes by design, so every real
// interview hits the cap. PR #234 made that failure graceful (relay closes
// the client ws 1011; the browser ends the interview with the transcript
// already saved) — but that still cuts the interview short.
//
// This class renews the Bedrock connection proactively, well before the cap,
// by opening a second NovaSonicSession seeded with the accumulated
// conversation history and atomically switching over — the client
// WebSocket, and therefore the browser, never sees it happen. It exposes the
// same public surface as NovaSonicSession (start/pushAudio/pushToolResult/
// pushSystemText/stop plus the NovaSonicCallbacks contract) so server.ts's
// handleConnection only needs to swap the constructor it calls.
//
// Renewal timing:
//   - NOVA_RENEW_AFTER_MS (default 7:00) — proactive renewal target. Fires
//     immediately if the connection happens to be at a quiet point already
//     (model not speaking, no tool call outstanding); otherwise waits for
//     the next completionEnd.
//   - NOVA_RENEW_HARD_MS (default 7:45) — if no quiet point has arrived by
//     here, renewal is forced at the next transcript boundary regardless of
//     speaking/tool state, so we never ride all the way into Nova's own
//     8-minute cutoff.
//   - Reactive path: if the CURRENT session's onError fires before a
//     renewal has completed, one renewal attempt is made immediately. If
//     that attempt also fails, the original error is forwarded to the
//     caller's onError — preserving the existing #234 close(1011) behavior
//     exactly (server.ts owns that close; this class only decides whether
//     to attempt a save first).
//   - Renewal attempts are rate-limited to at most one per 60s. This is
//     deliberately NOT bypassed for the "Timed out waiting for audio bytes"
//     error (production 2026-09-08, historian_sessions row 4517ec57): a
//     renewal into another stream that still receives no audio just dies
//     the same way 55s later, so bypassing would loop dead streams forever.
//     The silence keepalive below removes the cause instead.
//   - A renewal that happens BEFORE the assistant has produced any turn
//     (no ASSISTANT text or audio seen yet) does not skip the greeting kickoff and
//     does not append RENEWAL_NOTE — otherwise a very early reactive renewal
//     yields a session in which the interviewer never speaks first.
//
// History accumulation: every USER/ASSISTANT textOutput the wrapped session
// forwards (already stage-filtered to "final" text by NovaSonicSession — see
// its header comment) is appended to a bounded in-memory transcript, capped
// at ~60k characters (oldest turns dropped first), and replayed into each
// renewed connection as non-interactive history content (eventBuilders.ts
// historyContent()).
//
// Silence keepalive (production failure 2026-09-08, CloudWatch
// /ecs/nova-sonic-relay): Nova Sonic fails a stream after 55s without audio
// bytes or interactive content — "Timed out waiting for audio bytes or
// interactive content. Please ensure gaps between audio bytes and
// interactive content are less than 55 seconds." The browser
// (src/lib/voice/providers/novaSonicWsProvider.ts) sends `start` on ws open
// and only THEN asks for the microphone, so a slow permission prompt or
// device setup means Nova gets no audio at all. The one-shot greeting
// kickoff (an interactive USER text turn, see NovaSonicSession.
// sendGreetingKickoff) is sent at t≈0 in the same flush as the init events,
// so it cannot hold the stream open — and in that trace Nova produced no
// greeting text either, consistent with the model gating its spoken
// response on the audio stream actually running. Fix: while no client
// audio has arrived for NOVA_KEEPALIVE_IDLE_MS, push short frames of
// digital silence (byte-identical to a muted mic) into the current
// session's audio channel at real-time cadence, and stop the moment client
// audio resumes. It is bounded by NOVA_KEEPALIVE_MAX_IDLE_MS so a tab the
// patient walked away from before granting the mic does not hold a Bedrock
// stream open indefinitely — past that, Nova's own timeout and the existing
// onError → close(1011) path end the session as before.
// ---------------------------------------------------------------------------

const DEFAULT_RENEW_AFTER_MS = 420_000 // 7:00
const DEFAULT_RENEW_HARD_MS = 465_000 // 7:45
const DEFAULT_MIN_RENEWAL_INTERVAL_MS = 60_000 // never renew more than once/60s
const DEFAULT_HISTORY_CAP_CHARS = 60_000
const DEFAULT_KEEPALIVE_IDLE_MS = 2_000 // no client audio for this long → start silence
const DEFAULT_KEEPALIVE_TICK_MS = 250 // one silence frame per tick while idle
const DEFAULT_KEEPALIVE_FRAME_MS = 250 // frame length = tick → real-time cadence
const DEFAULT_KEEPALIVE_MAX_IDLE_MS = 180_000 // give up after 3 min with no client audio

function envMs(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const RENEWAL_NOTE =
  '[Connection renewed mid-interview; continue exactly where the conversation left off. Do not greet again or repeat questions.]'

type RenewalReason = 'scheduled' | 'quiet-point' | 'hard-deadline' | 'reactive'

// ---------------------------------------------------------------------------
// sanitizeHistoryForNova
//
// Production failure (verified 2026-09-08, CloudWatch /ecs/nova-sonic-relay):
// a renewal fired at the hard deadline, seeded the new session with the raw
// accumulated history — whose first turn is Henry's ASSISTANT greeting — and
// Nova immediately failed the new stream with "First message in chat history
// should not be Assistant." Nova is designed for alternating user/assistant
// turns (AWS Nova user guide / speech-troubleshooting docs: "ensure the
// first message in the chat history originates from the user"), and the
// manager's own accumulation can also produce back-to-back same-role turns
// (e.g. a stacked ASSISTANT/ASSISTANT pair when the model asks a follow-up
// with no intervening USER turn). This pure function repairs both before the
// history is replayed into a renewed connection.
// ---------------------------------------------------------------------------

/**
 * Sanitize accumulated history so it is safe to seed into a fresh Nova
 * session: (a) drop leading turns until the first USER turn, (b) merge
 * consecutive same-role turns (joining text with a single space), and
 * (c) drop empty-text turns. Pure — does not mutate the input.
 */
export function sanitizeHistoryForNova(turns: HistoryTurn[]): HistoryTurn[] {
  const nonEmpty = turns.filter((turn) => turn.text.length > 0)

  let start = 0
  while (start < nonEmpty.length && nonEmpty[start].role !== 'USER') {
    start++
  }
  const trimmed = nonEmpty.slice(start)

  const merged: HistoryTurn[] = []
  for (const turn of trimmed) {
    const last = merged[merged.length - 1]
    if (last && last.role === turn.role) {
      last.text = `${last.text} ${turn.text}`
    } else {
      merged.push({ role: turn.role, text: turn.text })
    }
  }
  return merged
}

/** The subset of NovaSonicSession's public surface this class depends on — narrowed so tests can inject a fake without importing the real (Bedrock-backed) class. */
export interface NovaSonicSessionLike {
  start(instructions: string, tools: Tool[], voiceId?: string, options?: NovaSonicStartOptions): Promise<void>
  pushAudio(base64: string): void
  pushToolResult(toolUseId: string, jsonString: string): void
  pushSystemText(text: string): void
  stop(): Promise<void>
}

export interface NovaConnectionManagerOptions {
  /** Factory for the underlying session — overridable in tests. Defaults to `(callbacks) => new NovaSonicSession(callbacks)`. */
  sessionFactory?: (callbacks: NovaSonicCallbacks) => NovaSonicSessionLike
  renewAfterMs?: number
  hardRenewMs?: number
  minRenewalIntervalMs?: number
  historyCapChars?: number
  /** Kill switch for the silence keepalive. Defaults to `true` unless NOVA_KEEPALIVE_DISABLED=1. */
  keepaliveEnabled?: boolean
  /** No client audio for this long → start pushing silence. Default NOVA_KEEPALIVE_IDLE_MS or 2000. */
  keepaliveIdleMs?: number
  /** Cadence of the idle check / silence frames. Default 250. */
  keepaliveTickMs?: number
  /** Length of each silence frame. Default 250 (= tick, i.e. real-time). */
  keepaliveFrameMs?: number
  /** Stop keeping a session alive once client audio has been absent this long. Default NOVA_KEEPALIVE_MAX_IDLE_MS or 180000. */
  keepaliveMaxIdleMs?: number
}

export class NovaConnectionManager {
  private readonly externalCallbacks: NovaSonicCallbacks
  private readonly sessionFactory: (callbacks: NovaSonicCallbacks) => NovaSonicSessionLike
  private readonly renewAfterMs: number
  private readonly hardRenewMs: number
  private readonly minRenewalIntervalMs: number
  private readonly historyCapChars: number

  // Conversation state, carried across renewals.
  private instructions = ''
  private tools: Tool[] = []
  private voiceId: string | undefined
  private readonly history: HistoryTurn[] = []
  private historyChars = 0

  // Session bookkeeping. Generation numbers (not object identity) let a
  // session's callbacks — bound at construction, before the session object
  // itself necessarily exists yet — cheaply tell whether they're still
  // "current" by the time an event actually arrives.
  private sessionSeq = -1
  private currentGeneration = -1
  private pendingGeneration: number | null = null
  private currentSession: NovaSonicSessionLike | null = null
  private pendingSession: NovaSonicSessionLike | null = null

  private connectionStartTime = 0
  private speaking = false
  private toolCallOutstanding = false
  private renewing = false
  private renewalDue = false
  private forceRenewalAtNextBoundary = false
  private lastRenewalCompletedAt: number | null = null
  private pendingReactiveError: unknown = null
  private stopped = false
  // True once the model has produced any ASSISTANT text or audio on any
  // generation — the greeting has happened, so a renewal is a continuation.
  private assistantHasSpoken = false

  private renewTimer: ReturnType<typeof setTimeout> | null = null
  private hardTimer: ReturnType<typeof setTimeout> | null = null

  // Silence keepalive state — see the header comment.
  private readonly keepaliveEnabled: boolean
  private readonly keepaliveIdleMs: number
  private readonly keepaliveTickMs: number
  private readonly keepaliveFrameMs: number
  private readonly keepaliveMaxIdleMs: number
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null
  private keepaliveFrame = ''
  private keepaliveActive = false
  private keepaliveGaveUp = false
  private keepaliveFramesSent = 0
  private streamOpenedAt = 0
  private lastClientAudioAt: number | null = null

  constructor(callbacks: NovaSonicCallbacks = {}, options: NovaConnectionManagerOptions = {}) {
    this.externalCallbacks = callbacks
    this.sessionFactory = options.sessionFactory ?? ((cb) => new NovaSonicSession(cb))
    this.renewAfterMs =
      options.renewAfterMs ?? (Number(process.env.NOVA_RENEW_AFTER_MS) || DEFAULT_RENEW_AFTER_MS)
    this.hardRenewMs =
      options.hardRenewMs ?? (Number(process.env.NOVA_RENEW_HARD_MS) || DEFAULT_RENEW_HARD_MS)
    this.minRenewalIntervalMs = options.minRenewalIntervalMs ?? DEFAULT_MIN_RENEWAL_INTERVAL_MS
    this.historyCapChars = options.historyCapChars ?? DEFAULT_HISTORY_CAP_CHARS
    this.keepaliveEnabled = options.keepaliveEnabled ?? process.env.NOVA_KEEPALIVE_DISABLED !== '1'
    this.keepaliveIdleMs = options.keepaliveIdleMs ?? envMs('NOVA_KEEPALIVE_IDLE_MS', DEFAULT_KEEPALIVE_IDLE_MS)
    this.keepaliveTickMs = options.keepaliveTickMs ?? DEFAULT_KEEPALIVE_TICK_MS
    this.keepaliveFrameMs = options.keepaliveFrameMs ?? DEFAULT_KEEPALIVE_FRAME_MS
    this.keepaliveMaxIdleMs =
      options.keepaliveMaxIdleMs ?? envMs('NOVA_KEEPALIVE_MAX_IDLE_MS', DEFAULT_KEEPALIVE_MAX_IDLE_MS)
  }

  // -------------------------------------------------------------------------
  // Public surface — mirrors NovaSonicSession so server.ts can swap in this
  // class with no other changes.
  // -------------------------------------------------------------------------

  async start(instructions: string, tools: Tool[], voiceId?: string): Promise<void> {
    this.instructions = instructions
    this.tools = tools
    this.voiceId = voiceId

    const generation = ++this.sessionSeq
    this.currentGeneration = generation
    const session = this.sessionFactory(this.makeCallbacksFor(generation))
    this.currentSession = session

    await session.start(instructions, tools, voiceId)

    this.connectionStartTime = Date.now()
    this.streamOpenedAt = this.connectionStartTime
    this.scheduleTimers()
    this.startKeepalive()
  }

  pushAudio(base64: string): void {
    this.lastClientAudioAt = Date.now()
    if (this.keepaliveActive) {
      this.keepaliveActive = false
      this.log(`keepalive stopped reason=client-audio framesSent=${this.keepaliveFramesSent}`)
    }
    this.currentSession?.pushAudio(base64)
  }

  pushToolResult(toolUseId: string, jsonString: string): void {
    this.toolCallOutstanding = false
    this.currentSession?.pushToolResult(toolUseId, jsonString)
  }

  pushSystemText(text: string): void {
    this.currentSession?.pushSystemText(text)
  }

  /** Stop everything — including a renewal that's mid-flight (both the current/old session and the not-yet-switched-in pending one). */
  async stop(): Promise<void> {
    this.stopped = true
    this.clearTimers()
    this.stopKeepalive()

    const tasks: Array<Promise<void>> = []
    if (this.currentSession) tasks.push(this.currentSession.stop().catch(() => {}))
    if (this.pendingSession && this.pendingSession !== this.currentSession) {
      tasks.push(this.pendingSession.stop().catch(() => {}))
    }
    await Promise.all(tasks)
  }

  /** Test/debug helper — a snapshot of the accumulated (bounded) history. */
  getHistorySnapshot(): HistoryTurn[] {
    return this.history.slice()
  }

  // -------------------------------------------------------------------------
  // History accumulation
  // -------------------------------------------------------------------------

  private appendHistory(role: HistoryRole, text: string): void {
    if (!text) return
    this.history.push({ role, text })
    this.historyChars += text.length
    while (this.historyChars > this.historyCapChars && this.history.length > 0) {
      const dropped = this.history.shift()!
      this.historyChars -= dropped.text.length
    }
  }

  // -------------------------------------------------------------------------
  // Timer scheduling
  // -------------------------------------------------------------------------

  private clearTimers(): void {
    if (this.renewTimer) {
      clearTimeout(this.renewTimer)
      this.renewTimer = null
    }
    if (this.hardTimer) {
      clearTimeout(this.hardTimer)
      this.hardTimer = null
    }
  }

  private scheduleTimers(): void {
    this.clearTimers()
    if (this.stopped) return

    this.renewTimer = setTimeout(() => {
      const elapsedMs = Date.now() - this.connectionStartTime
      const quiet = this.isQuietPoint()
      this.log(
        `scheduled reason=timer elapsedMs=${elapsedMs} quiet=${quiet} speaking=${this.speaking} toolOutstanding=${this.toolCallOutstanding}`,
      )
      this.renewalDue = true
      if (quiet) {
        void this.startRenewal('scheduled')
      }
    }, this.renewAfterMs)
    // A ref-counted timer would keep a test/dev process alive unnecessarily.
    this.renewTimer?.unref?.()

    this.hardTimer = setTimeout(() => {
      if (this.renewing || !this.currentSession) return
      const elapsedMs = Date.now() - this.connectionStartTime
      this.log(`scheduled reason=hard-deadline elapsedMs=${elapsedMs}`)
      this.forceRenewalAtNextBoundary = true
    }, this.hardRenewMs)
    this.hardTimer?.unref?.()
  }

  private isQuietPoint(): boolean {
    return !this.speaking && !this.toolCallOutstanding
  }

  // -------------------------------------------------------------------------
  // Silence keepalive — see the header comment. One manager-level interval
  // (not per session) so it carries across renewals untouched: it always
  // targets whichever session is current, and `lastClientAudioAt` is a
  // property of the client, not of any one Bedrock stream.
  // -------------------------------------------------------------------------

  private startKeepalive(): void {
    if (!this.keepaliveEnabled || this.stopped || this.keepaliveTimer) return
    this.keepaliveFrame = silencePcmBase64(this.keepaliveFrameMs)
    this.keepaliveTimer = setInterval(() => this.keepaliveTick(), this.keepaliveTickMs)
    this.keepaliveTimer.unref?.()
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer)
      this.keepaliveTimer = null
    }
    this.keepaliveActive = false
  }

  private keepaliveTick(): void {
    if (this.stopped || !this.currentSession) return
    const idleMs = Date.now() - (this.lastClientAudioAt ?? this.streamOpenedAt)
    if (idleMs < this.keepaliveIdleMs) return

    if (idleMs >= this.keepaliveMaxIdleMs) {
      if (!this.keepaliveGaveUp) {
        this.keepaliveGaveUp = true
        this.keepaliveActive = false
        this.log(
          `keepalive gave-up idleMs=${idleMs} maxIdleMs=${this.keepaliveMaxIdleMs} framesSent=${this.keepaliveFramesSent} (no client audio; letting Nova time out)`,
        )
      }
      return
    }
    this.keepaliveGaveUp = false

    if (!this.keepaliveActive) {
      this.keepaliveActive = true
      this.log(
        `keepalive started reason=${this.lastClientAudioAt === null ? 'no-client-audio-yet' : 'client-audio-gap'} idleMs=${idleMs}`,
      )
    }
    this.keepaliveFramesSent++
    this.currentSession.pushAudio(this.keepaliveFrame)
  }

  /**
   * Shared by the onTurnEnd and onCompletionEnd callbacks (see
   * makeCallbacksFor): if a renewal is due and the connection is otherwise
   * quiet (no outstanding tool call, no renewal already in flight), start
   * it now. Factored into one method so the two quiet-point signals cannot
   * drift out of sync with each other.
   */
  private checkQuietPointRenewal(): void {
    if (this.renewalDue && !this.toolCallOutstanding && !this.renewing) {
      this.renewalDue = false
      void this.startRenewal('quiet-point')
    }
  }

  // -------------------------------------------------------------------------
  // Renewal
  // -------------------------------------------------------------------------

  private async startRenewal(reason: RenewalReason): Promise<boolean> {
    if (this.stopped || this.renewing || !this.currentSession) return false
    if (
      this.lastRenewalCompletedAt !== null &&
      Date.now() - this.lastRenewalCompletedAt < this.minRenewalIntervalMs
    ) {
      return false
    }

    this.renewing = true
    this.renewalDue = false
    this.forceRenewalAtNextBoundary = false

    const attemptStartedAt = Date.now()
    const historySnapshot = this.history.slice()
    const sanitizedHistory = sanitizeHistoryForNova(historySnapshot)
    // Only a session in which the interviewer has already spoken is a
    // "continuation"; otherwise the renewed stream must still open with the
    // greeting kickoff, or nobody ever speaks first.
    const assistantHasSpoken = this.assistantHasSpoken
    this.log(
      `started reason=${reason} historyTurns=${historySnapshot.length} seeded=${sanitizedHistory.length} skipGreeting=${assistantHasSpoken}`,
    )

    const oldSession = this.currentSession
    const generation = ++this.sessionSeq
    this.pendingGeneration = generation
    const renewedInstructions = assistantHasSpoken
      ? `${this.instructions}\n${RENEWAL_NOTE}`
      : this.instructions
    const newSession = this.sessionFactory(this.makeCallbacksFor(generation))
    this.pendingSession = newSession

    try {
      await newSession.start(renewedInstructions, this.tools, this.voiceId, {
        history: sanitizedHistory,
        skipGreeting: assistantHasSpoken,
      })
    } catch (e) {
      this.renewing = false
      this.pendingGeneration = null
      this.pendingSession = null
      this.log(`failed reason=${reason} error=${e instanceof Error ? e.message : String(e)}`)
      if (!this.stopped) {
        // Retry at the next opportunity — rate-limited by minRenewalIntervalMs.
        this.renewalDue = true
      }
      if (this.pendingReactiveError) {
        const err = this.pendingReactiveError
        this.pendingReactiveError = null
        this.externalCallbacks.onError?.(err)
      }
      return false
    }

    // Atomic switch — new stream is open; route everything to it and let the
    // old one drain/close in the background.
    this.currentGeneration = generation
    this.currentSession = newSession
    this.pendingSession = null
    this.pendingGeneration = null
    this.connectionStartTime = Date.now()
    // streamOpenedAt is deliberately NOT reset here: it anchors the keepalive
    // idle clock for a client that has never sent audio, and resetting it on
    // renewal would let an abandoned tab loop keepalive → timeout → reactive
    // renewal → keepalive indefinitely instead of ending at the max-idle cap.
    this.speaking = false
    this.toolCallOutstanding = false
    this.renewing = false
    this.lastRenewalCompletedAt = Date.now()
    this.pendingReactiveError = null
    this.scheduleTimers()

    const elapsedMs = Date.now() - attemptStartedAt
    this.log(
      `switched historyTurns=${historySnapshot.length} seeded=${sanitizedHistory.length} elapsedMs=${elapsedMs}`,
    )

    oldSession.stop().catch(() => {})

    return true
  }

  // -------------------------------------------------------------------------
  // Per-session callback wiring
  // -------------------------------------------------------------------------

  private makeCallbacksFor(generation: number): NovaSonicCallbacks {
    const isCurrent = (): boolean => generation === this.currentGeneration
    const isPending = (): boolean => generation === this.pendingGeneration

    return {
      onTextOutput: (role, content) => {
        if (!isCurrent()) return
        const upper = role?.toUpperCase()
        if (upper === 'USER' || upper === 'ASSISTANT') {
          this.appendHistory(upper, content)
        }
        if (upper === 'ASSISTANT') this.assistantHasSpoken = true
        this.externalCallbacks.onTextOutput?.(role, content)
        if (this.forceRenewalAtNextBoundary && !this.renewing) {
          this.forceRenewalAtNextBoundary = false
          void this.startRenewal('hard-deadline')
        }
      },

      onAudioOutput: (base64) => {
        if (!isCurrent()) return
        this.speaking = true
        this.assistantHasSpoken = true
        this.externalCallbacks.onAudioOutput?.(base64)
      },

      onToolUse: (toolUse) => {
        if (!isCurrent()) return
        this.toolCallOutstanding = true
        this.externalCallbacks.onToolUse?.(toolUse)
      },

      onCompletionEnd: () => {
        if (!isCurrent()) return
        this.speaking = false
        this.externalCallbacks.onCompletionEnd?.()
        this.checkQuietPointRenewal()
      },

      // Per-turn quiet point — see NovaSonicCallbacks.onTurnEnd. Handled
      // identically to onCompletionEnd (same speaking-reset + renewal check)
      // so the two signals can't drift; the shared logic lives in
      // checkQuietPointRenewal(). In production this fires far more
      // reliably than completionEnd, so it's the primary signal in
      // practice — completionEnd stays wired as a secondary check.
      onTurnEnd: () => {
        if (!isCurrent()) return
        this.speaking = false
        this.externalCallbacks.onTurnEnd?.()
        this.checkQuietPointRenewal()
      },

      onBargeIn: () => {
        if (!isCurrent()) return
        this.speaking = false
        this.externalCallbacks.onBargeIn?.()
      },

      onError: (err) => {
        if (isPending()) {
          // The not-yet-switched-in renewal attempt failed to open — its own
          // catch in startRenewal() already handles this outcome (logging +
          // retry scheduling + forwarding any queued reactive error). This
          // callback fires too (NovaSonicSession.start()'s catch calls
          // onError before rethrowing), so just avoid double-reporting.
          return
        }
        if (isCurrent()) {
          if (!this.renewing) {
            void this.startRenewal('reactive').then((switched) => {
              if (!switched) {
                this.externalCallbacks.onError?.(err)
              }
            })
          } else {
            // A proactive renewal is already mid-flight and the OLD session
            // died too. Remember this error so that — if the in-flight
            // renewal ALSO fails — we still fall back to closing, instead of
            // silently leaving the caller with no live session and no error.
            this.pendingReactiveError = err
          }
          return
        }
        // A stale, already-superseded session's error (e.g. late noise from
        // its own best-effort stop()) — expected, not actionable.
        console.error(
          '[nova-renew] stale session error (ignored, already superseded):',
          err instanceof Error ? err.message : err,
        )
      },
    }
  }

  private log(message: string): void {
    console.log(`[nova-renew] ${message}`)
  }
}
