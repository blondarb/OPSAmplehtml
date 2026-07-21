/**
 * Minimal text-modality client for OpenAI's Realtime API over a raw
 * WebSocket (Historian Validation Suite Task 6 — synthetic patient
 * conversation driver).
 *
 * This talks to the SAME wire protocol as
 * src/lib/voice/providers/openaiWebrtcProvider.ts (that file's WebRTC data
 * channel and this file's raw WebSocket carry the identical Realtime event
 * JSON — only the transport differs), so the event names and payload
 * shapes below (`session.update` needing `session.type`, `response.create`
 * with an empty `response: {}` object, `response.done`'s
 * `response.output[]` array for both message text and function calls) are
 * drawn from that already-live-verified code, not guessed. See that file's
 * header comment for the specific fixes (#142 no response.modalities,
 * session.type required on every session.update) this mirrors.
 *
 * DESIGN — response.done is authoritative, deltas are best-effort only:
 * the production code above only handles AUDIO-modality transcript events
 * (`response.audio_transcript.*`), which do not apply to a text-only
 * session. The brief names `response.output_text.*` for text-modality
 * streaming deltas; this client accumulates those opportunistically (only
 * used as a fallback if a response ever finishes with no message item in
 * its output array) but always prefers the text extracted from
 * `response.done`'s own `response.output[]` — the one event whose shape is
 * confirmed by the code above and whose arrival this client already must
 * wait for regardless. This hedges against any minor drift in the exact
 * delta event name without weakening correctness.
 *
 * TIMEOUTS: a 30s ceiling on every individual exchange (sendUserText /
 * sendFunctionCallOutput / requestGreeting — anything that awaits a
 * response.done), and a 10-minute whole-session wall clock enforced before
 * starting any new exchange (a session already past its budget refuses to
 * start another turn rather than silently running long).
 *
 * RECONNECT: exactly one automatic reconnect attempt on an unexpected
 * socket close (not one we requested via close()). This is transport-level
 * resilience only — a fresh WebSocket to /v1/realtime is a BRAND NEW
 * Realtime session with no memory of prior turns (there is no session-
 * resumption primitive on this surface), so the in-flight exchange at the
 * time of the drop is failed (its promise rejects) rather than silently
 * "succeeding" a replay the model never actually saw. The reconnect keeps
 * the CLIENT usable for the orchestrator's next call; it does not and
 * cannot restore lost conversation context. The orchestrator's own
 * whole-session retry (documented in the CLI) is a separate, higher-level
 * concern.
 */
import WebSocket, { type RawData } from 'ws'

/** Loosely-typed inbound/outbound Realtime event JSON — the wire protocol is external and untyped, so fields are narrowed with isRecord()/typeof checks at each use site rather than trusted via `any`. */
type WireMessage = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class RealtimeSchemaError extends Error {
  constructor(
    message: string,
    public readonly payload: unknown,
  ) {
    super(message)
    this.name = 'RealtimeSchemaError'
  }
}

export interface RealtimeFunctionCall {
  callId: string
  name: string
  /** Parsed JSON arguments (empty object if the model emitted invalid JSON). */
  arguments: unknown
  /** The raw arguments string exactly as sent by the model, for logging/debugging. */
  rawArguments: string
}

export interface RealtimeTurnResult {
  /** Concatenated text from every message item in response.done's output array (trimmed). */
  assistantText: string
  /** Every function_call item in this response, in order. */
  functionCalls: RealtimeFunctionCall[]
  /** response.status from response.done ("completed" | "failed" | "incomplete" | ...), or null if unavailable. */
  status: string | null
}

export type WireEventDirection = 'out' | 'in'

export interface RealtimeTextClientOptions {
  /** Full WebSocket URL to connect to — the caller builds the OpenAI URL (or a test's ws://127.0.0.1:PORT). */
  url: string
  /**
   * Extra handshake headers — for the real OpenAI GA endpoint this is just
   * `{ Authorization: 'Bearer <key>' }`. Do NOT add `OpenAI-Beta:
   * realtime=v1` — live-verified 2026-07-21 that header now gets
   * `beta_api_shape_disabled` rejected outright on the current GA
   * `/v1/realtime` endpoint (see historian-synthetic-run.ts's call site
   * comment for the exact error payload). Omit/empty for a local test
   * server.
   */
  headers?: Record<string, string>
  instructions: string
  tools: unknown[]
  /** Ceiling per exchange, in ms. Default 30_000. */
  responseTimeoutMs?: number
  /** Whole-session wall-clock ceiling, in ms, checked before starting each new exchange. Default 10 minutes. */
  sessionTimeoutMs?: number
  /** Optional sink for every inbound/outbound wire message — verbose logging only, never load-bearing. */
  onWireEvent?: (direction: WireEventDirection, message: Record<string, unknown>) => void
}

export const DEFAULT_RESPONSE_TIMEOUT_MS = 30_000
export const DEFAULT_SESSION_TIMEOUT_MS = 10 * 60_000

type Phase = 'idle' | 'connecting' | 'ready' | 'closed'

interface PendingTurn {
  resolve: (result: RealtimeTurnResult) => void
  reject: (err: Error) => void
  text: string
  timer: ReturnType<typeof setTimeout>
}

interface ConnectSettle {
  resolve: () => void
  reject: (err: Error) => void
}

export class RealtimeTextClient {
  private readonly url: string
  private readonly headers: Record<string, string>
  private readonly instructions: string
  private readonly tools: unknown[]
  private readonly responseTimeoutMs: number
  private readonly sessionTimeoutMs: number
  private readonly onWireEvent?: RealtimeTextClientOptions['onWireEvent']

  private ws: WebSocket | null = null
  private phase: Phase = 'idle'
  private sessionDeadline = 0
  private intentionalClose = false
  private didReconnect = false
  private connectSettle: ConnectSettle | null = null
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  private pendingTurn: PendingTurn | null = null

  constructor(options: RealtimeTextClientOptions) {
    this.url = options.url
    this.headers = options.headers ?? {}
    this.instructions = options.instructions
    this.tools = options.tools
    this.responseTimeoutMs = options.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS
    this.sessionTimeoutMs = options.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS
    this.onWireEvent = options.onWireEvent
  }

  async connect(): Promise<void> {
    this.sessionDeadline = Date.now() + this.sessionTimeoutMs
    await this.openAndHandshake()
  }

  private openAndHandshake(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.phase = 'connecting'
      this.connectSettle = {
        resolve: () => {
          this.clearConnectTimer()
          this.phase = 'ready'
          this.connectSettle = null
          resolve()
        },
        reject: (err) => {
          this.clearConnectTimer()
          this.connectSettle = null
          reject(err)
        },
      }

      const ws = new WebSocket(this.url, { headers: this.headers })
      this.ws = ws

      ws.on('message', (data) => this.handleMessage(data))
      ws.on('close', (code, reasonBuf) => this.handleClose(code, reasonBuf?.toString?.() ?? ''))
      ws.on('error', (err) => this.handleSocketError(err))
      ws.on('unexpected-response', (_req, res) => {
        let body = ''
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => {
          this.connectSettle?.reject(
            new RealtimeSchemaError(`OpenAI Realtime WS handshake rejected: HTTP ${res.statusCode}`, {
              statusCode: res.statusCode,
              body,
            }),
          )
        })
      })

      this.connectTimer = setTimeout(() => {
        this.connectSettle?.reject(
          new Error(`Timed out after ${this.responseTimeoutMs}ms waiting for session.created/session.updated`),
        )
      }, this.responseTimeoutMs)
    })
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer)
      this.connectTimer = null
    }
  }

  private send(message: Record<string, unknown>): void {
    this.onWireEvent?.('out', message)
    this.ws?.send(JSON.stringify(message))
  }

  private handleMessage(data: RawData): void {
    let msg: WireMessage
    try {
      const parsed: unknown = JSON.parse(data.toString())
      if (!isRecord(parsed)) return
      msg = parsed
    } catch {
      return // unparseable frame — ignore, mirrors openaiWebrtcProvider's onmessage guard
    }
    this.onWireEvent?.('in', msg)

    if (msg.type === 'session.created') {
      // session.type is REQUIRED on every session.update, not just at
      // session create (openaiWebrtcProvider.ts updateInstructions() —
      // omitting it gets HTTP 400 missing_required_parameter).
      this.send({
        type: 'session.update',
        session: {
          type: 'realtime',
          modalities: ['text'],
          instructions: this.instructions,
          tools: this.tools,
          turn_detection: null,
        },
      })
      return
    }

    if (msg.type === 'session.updated') {
      if (this.phase === 'connecting') this.connectSettle?.resolve()
      return
    }

    if (msg.type === 'error') {
      const errorPayload = msg.error ?? msg
      const errorMessage =
        isRecord(errorPayload) && typeof errorPayload.message === 'string'
          ? errorPayload.message
          : 'OpenAI Realtime returned an error event'
      const err = new RealtimeSchemaError(errorMessage, errorPayload)
      if (this.phase === 'connecting') {
        this.connectSettle?.reject(err)
        return
      }
      if (this.pendingTurn) this.failPendingTurn(err)
      return
    }

    if (msg.type === 'response.output_text.delta' && this.pendingTurn) {
      if (typeof msg.delta === 'string') this.pendingTurn.text += msg.delta
      return
    }

    if (msg.type === 'response.done') {
      this.resolvePendingTurnFromResponseDone(msg)
      return
    }

    // Every other event type (response.created, rate_limits.updated, ...)
    // is intentionally ignored beyond the onWireEvent sink above.
  }

  private resolvePendingTurnFromResponseDone(msg: WireMessage): void {
    const turn = this.pendingTurn
    if (!turn) return // stray/late event with nothing awaiting it

    const response = isRecord(msg.response) ? msg.response : {}
    const output = Array.isArray(response.output) ? response.output : []
    const functionCalls: RealtimeFunctionCall[] = []
    let messageText = ''

    for (const rawItem of output) {
      if (!isRecord(rawItem)) continue

      if (rawItem.type === 'function_call') {
        const rawArguments = typeof rawItem.arguments === 'string' ? rawItem.arguments : '{}'
        let parsedArguments: unknown = {}
        try {
          parsedArguments = JSON.parse(rawArguments)
        } catch {
          parsedArguments = {}
        }
        functionCalls.push({
          callId: typeof rawItem.call_id === 'string' ? rawItem.call_id : '',
          name: typeof rawItem.name === 'string' ? rawItem.name : '',
          arguments: parsedArguments,
          rawArguments,
        })
      } else if (rawItem.type === 'message' && Array.isArray(rawItem.content)) {
        for (const rawPart of rawItem.content) {
          if (!isRecord(rawPart)) continue
          if (typeof rawPart.text === 'string' && (rawPart.type === 'output_text' || rawPart.type === 'text')) {
            messageText += rawPart.text
          }
        }
      }
    }

    // response.done's own content is authoritative; the delta buffer is
    // only a fallback for the (unexpected) case where response.done
    // carries no message item at all.
    const assistantText = (messageText || turn.text).trim()

    this.pendingTurn = null
    clearTimeout(turn.timer)
    const status = typeof response.status === 'string' ? response.status : null
    turn.resolve({ assistantText, functionCalls, status })
  }

  private failPendingTurn(err: Error): void {
    const turn = this.pendingTurn
    if (!turn) return
    this.pendingTurn = null
    clearTimeout(turn.timer)
    turn.reject(err)
  }

  private handleClose(code: number, reason: string): void {
    const wasConnecting = this.phase === 'connecting'
    this.phase = 'closed'
    if (this.intentionalClose) return

    const closeErr = new Error(
      `Realtime WebSocket closed unexpectedly (code ${code}${reason ? `, reason: ${reason}` : ''})`,
    )

    if (wasConnecting) {
      this.connectSettle?.reject(closeErr)
      return
    }

    this.failPendingTurn(closeErr)

    if (!this.didReconnect) {
      this.didReconnect = true
      // Best-effort, fire-and-forget — see the module doc's RECONNECT note.
      this.openAndHandshake().catch((err) => {
        this.onWireEvent?.('in', {
          type: 'reconnect_failed',
          message: err instanceof Error ? err.message : String(err),
        })
      })
    }
  }

  private handleSocketError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err))
    if (this.phase === 'connecting') {
      this.connectSettle?.reject(error)
      return
    }
    this.failPendingTurn(error)
  }

  private ensureCanSend(): void {
    if (Date.now() > this.sessionDeadline) {
      throw new Error('Realtime session wall-clock budget (sessionTimeoutMs) exceeded')
    }
    if (this.phase !== 'ready') {
      throw new Error(`Cannot send — client is not connected (phase=${this.phase})`)
    }
    if (this.pendingTurn) {
      throw new Error('A response is already in flight — concurrent sends are not supported')
    }
  }

  /** Waits for the next response.done, without creating any new conversation item. Used for Henry's opening greeting and after submitFunctionCallOutput. */
  awaitNextResponse(): Promise<RealtimeTurnResult> {
    this.ensureCanSend()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingTurn = null
        reject(new Error(`Timed out after ${this.responseTimeoutMs}ms waiting for response.done`))
      }, this.responseTimeoutMs)
      this.pendingTurn = { resolve, reject, text: '', timer }
      this.send({ type: 'response.create', response: {} })
    })
  }

  /** Same as awaitNextResponse() — named for readability at greeting-kickoff call sites. */
  requestGreeting(): Promise<RealtimeTurnResult> {
    return this.awaitNextResponse()
  }

  /** Appends a user-role message item WITHOUT creating a response yet — pair with awaitNextResponse() when submitting multiple function_call_output items before continuing. */
  submitUserText(text: string): void {
    this.ensureCanSend()
    this.send({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    })
  }

  /** Appends a function_call_output item WITHOUT creating a response yet. */
  submitFunctionCallOutput(callId: string, output: unknown): void {
    this.ensureCanSend()
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: typeof output === 'string' ? output : JSON.stringify(output),
      },
    })
  }

  /** Convenience: submitUserText + awaitNextResponse. */
  async sendUserText(text: string): Promise<RealtimeTurnResult> {
    this.submitUserText(text)
    return this.awaitNextResponse()
  }

  /** Convenience: submitFunctionCallOutput + awaitNextResponse. */
  async sendFunctionCallOutput(callId: string, output: unknown): Promise<RealtimeTurnResult> {
    this.submitFunctionCallOutput(callId, output)
    return this.awaitNextResponse()
  }

  close(): void {
    this.intentionalClose = true
    this.clearConnectTimer()
    if (this.pendingTurn) this.failPendingTurn(new Error('Client closed while a response was in flight'))
    try {
      this.ws?.close()
    } catch {
      // best-effort
    }
    this.phase = 'closed'
  }
}
