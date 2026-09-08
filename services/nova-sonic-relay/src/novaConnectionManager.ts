import { NovaSonicSession } from './novaSonicSession.js'
import type { NovaSonicCallbacks, NovaSonicStartOptions, HistoryTurn } from './novaSonicSession.js'
import type { Tool, HistoryRole } from './eventBuilders.js'

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
//   - Renewal attempts are rate-limited to at most one per 60s.
//
// History accumulation: every USER/ASSISTANT textOutput the wrapped session
// forwards (already stage-filtered to "final" text by NovaSonicSession — see
// its header comment) is appended to a bounded in-memory transcript, capped
// at ~60k characters (oldest turns dropped first), and replayed into each
// renewed connection as non-interactive history content (eventBuilders.ts
// historyContent()).
// ---------------------------------------------------------------------------

const DEFAULT_RENEW_AFTER_MS = 420_000 // 7:00
const DEFAULT_RENEW_HARD_MS = 465_000 // 7:45
const DEFAULT_MIN_RENEWAL_INTERVAL_MS = 60_000 // never renew more than once/60s
const DEFAULT_HISTORY_CAP_CHARS = 60_000

const RENEWAL_NOTE =
  '[Connection renewed mid-interview; continue exactly where the conversation left off. Do not greet again or repeat questions.]'

type RenewalReason = 'scheduled' | 'quiet-point' | 'hard-deadline' | 'reactive'

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

  private renewTimer: ReturnType<typeof setTimeout> | null = null
  private hardTimer: ReturnType<typeof setTimeout> | null = null

  constructor(callbacks: NovaSonicCallbacks = {}, options: NovaConnectionManagerOptions = {}) {
    this.externalCallbacks = callbacks
    this.sessionFactory = options.sessionFactory ?? ((cb) => new NovaSonicSession(cb))
    this.renewAfterMs =
      options.renewAfterMs ?? (Number(process.env.NOVA_RENEW_AFTER_MS) || DEFAULT_RENEW_AFTER_MS)
    this.hardRenewMs =
      options.hardRenewMs ?? (Number(process.env.NOVA_RENEW_HARD_MS) || DEFAULT_RENEW_HARD_MS)
    this.minRenewalIntervalMs = options.minRenewalIntervalMs ?? DEFAULT_MIN_RENEWAL_INTERVAL_MS
    this.historyCapChars = options.historyCapChars ?? DEFAULT_HISTORY_CAP_CHARS
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
    this.scheduleTimers()
  }

  pushAudio(base64: string): void {
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
      this.log(`scheduled reason=timer elapsedMs=${elapsedMs}`)
      this.renewalDue = true
      if (this.isQuietPoint()) {
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
    this.log(`started reason=${reason} historyTurns=${historySnapshot.length}`)

    const oldSession = this.currentSession
    const generation = ++this.sessionSeq
    this.pendingGeneration = generation
    const renewedInstructions = `${this.instructions}\n${RENEWAL_NOTE}`
    const newSession = this.sessionFactory(this.makeCallbacksFor(generation))
    this.pendingSession = newSession

    try {
      await newSession.start(renewedInstructions, this.tools, this.voiceId, {
        history: historySnapshot,
        skipGreeting: true,
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
    this.speaking = false
    this.toolCallOutstanding = false
    this.renewing = false
    this.lastRenewalCompletedAt = Date.now()
    this.pendingReactiveError = null
    this.scheduleTimers()

    const elapsedMs = Date.now() - attemptStartedAt
    this.log(`switched historyTurns=${historySnapshot.length} elapsedMs=${elapsedMs}`)

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
        this.externalCallbacks.onTextOutput?.(role, content)
        if (this.forceRenewalAtNextBoundary && !this.renewing) {
          this.forceRenewalAtNextBoundary = false
          void this.startRenewal('hard-deadline')
        }
      },

      onAudioOutput: (base64) => {
        if (!isCurrent()) return
        this.speaking = true
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
        if (this.renewalDue && !this.toolCallOutstanding && !this.renewing) {
          this.renewalDue = false
          void this.startRenewal('quiet-point')
        }
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
