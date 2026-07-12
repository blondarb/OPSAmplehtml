import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} from '@aws-sdk/client-bedrock-runtime'
import type {
  InvokeModelWithBidirectionalStreamInput,
  InvokeModelWithBidirectionalStreamCommandOutput,
} from '@aws-sdk/client-bedrock-runtime'
import { NodeHttp2Handler } from '@smithy/node-http-handler'
import { v4 as uuidv4 } from 'uuid'

import { MODEL_ID, REGION } from './audioConstants.js'
import {
  sessionStart,
  promptStart,
  systemContent,
  userText,
  audioContentStart,
  audioInput,
  audioContentEnd,
  toolResultEvents,
  promptEnd,
  sessionEnd,
  type Tool,
} from './eventBuilders.js'

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

export interface NovaSonicToolUse {
  toolName: string
  toolUseId: string
  content: string
}

export interface NovaSonicCallbacks {
  onTextOutput?(role: string, content: string): void
  onAudioOutput?(base64: string): void
  onToolUse?(toolUse: NovaSonicToolUse): void
  onCompletionEnd?(): void
  onError?(err: unknown): void
  onBargeIn?(): void
}

// A raw event is one of the `{ event: { ... } }` objects produced by the
// eventBuilders. We keep it loosely typed — the SDK only cares that the JSON
// serialization is valid Nova Sonic protocol.
type RawEvent = { event: Record<string, unknown> }

// The interrupted/barge-in signal Nova Sonic embeds in a textOutput content
// string. Spaces are intentional and match the model's serialization, but we
// match loosely to be resilient to whitespace changes.
const INTERRUPTED_RE = /"interrupted"\s*:\s*true/

// ---------------------------------------------------------------------------
// Text-output stage filtering
//
// Nova Sonic emits every ASSISTANT turn's text TWICE: once with
// generationStage SPECULATIVE (as the audio starts streaming) and again,
// byte-identical, with generationStage FINAL when the turn ends (verified
// live 2026-07-11 via RELAY_TRACE_RAW + scripts/frame-probe.mjs). The stage
// rides on the contentStart event, which the dispatcher previously ignored —
// so both copies were forwarded and every assistant reply appeared twice in
// the Clara/historian transcripts. USER (ASR) text arrives once per segment,
// always FINAL.
//
// Rule: forward USER text only at FINAL, ASSISTANT text only at SPECULATIVE
// (the early copy, so the UI shows text as the audio starts — matching
// existing behavior). Unknown stage (no contentStart seen / unparseable
// additionalModelFields) fails OPEN: a duplicate is recoverable downstream,
// silently dropped content is not.
// ---------------------------------------------------------------------------

export type GenerationStage = 'SPECULATIVE' | 'FINAL' | ''

/** Extract generationStage from a contentStart's additionalModelFields JSON string. */
export function parseGenerationStage(additionalModelFields: unknown): GenerationStage {
  if (typeof additionalModelFields !== 'string') return ''
  try {
    const stage = (JSON.parse(additionalModelFields) as { generationStage?: string }).generationStage
    return stage === 'SPECULATIVE' || stage === 'FINAL' ? stage : ''
  } catch {
    return ''
  }
}

/** Decide whether a textOutput should be forwarded to the browser. */
export function shouldForwardText(role: string, stage: GenerationStage): boolean {
  if (!stage) return true // unknown stage — fail open
  if ((role ?? '').toUpperCase() === 'USER') return stage === 'FINAL'
  return stage === 'SPECULATIVE'
}

// Opt-in raw model-event trace (RELAY_TRACE_RAW=1): logs EVERY decoded Bedrock
// event — including contentStart/contentEnd, which the dispatcher otherwise
// drops silently — so emission-pattern bugs (e.g. duplicate SPECULATIVE+FINAL
// text) can be diagnosed from the relay log. audioOutput is logged as a byte
// count only.
const TRACE_RAW = !!process.env.RELAY_TRACE_RAW
function traceRaw(json: { event?: Record<string, unknown> }): void {
  const event = json?.event
  const ts = new Date().toISOString().slice(11, 23)
  if (!event) {
    console.log(`[raw ${ts}] (no event) ${JSON.stringify(json).slice(0, 300)}`)
    return
  }
  const kind = Object.keys(event)[0] ?? '?'
  if (kind === 'audioOutput') {
    const content = (event.audioOutput as { content?: string } | undefined)?.content ?? ''
    console.log(`[raw ${ts}] audioOutput b64len=${content.length}`)
  } else {
    console.log(`[raw ${ts}] ${JSON.stringify(event).slice(0, 500)}`)
  }
}

// ---------------------------------------------------------------------------
// NovaSonicSession — wraps ONE bidirectional Bedrock stream for ONE conversation
// ---------------------------------------------------------------------------

export class NovaSonicSession {
  private readonly client: BedrockRuntimeClient
  private readonly callbacks: NovaSonicCallbacks

  private readonly promptName = uuidv4()
  private readonly audioContentName = uuidv4()

  // Input queue + generator wake-up handle.
  private readonly events: RawEvent[] = []
  private pendingResolve: (() => void) | null = null

  private active = false
  private closed = false
  private kickoffSent = false

  // Init events, captured at start() and replayed by the generator's preamble.
  private initEvents: RawEvent[] = []

  // The fire-and-forget response loop, stored so stop() can best-effort await it.
  private responseLoop: Promise<void> | null = null

  constructor(callbacks: NovaSonicCallbacks = {}) {
    this.callbacks = callbacks
    this.client = new BedrockRuntimeClient({
      region: REGION,
      requestHandler: new NodeHttp2Handler({
        requestTimeout: 300000,
        sessionTimeout: 300000,
      }),
    })
  }

  // -------------------------------------------------------------------------
  // Queue plumbing
  // -------------------------------------------------------------------------

  /** Push an event onto the input queue and wake the generator if it's parked. */
  private enqueue(event: RawEvent): void {
    this.events.push(event)
    if (this.pendingResolve) {
      const resolve = this.pendingResolve
      this.pendingResolve = null
      resolve()
    }
  }

  /**
   * The single async iterable consumed by the Bedrock command body. It first
   * replays the init events in protocol order, then drains the queue, parking
   * on a promise whenever the queue is empty and waking on enqueue()/stop().
   */
  private async *inputStream(): AsyncGenerator<InvokeModelWithBidirectionalStreamInput> {
    // 1. Init preamble, in order.
    for (const event of this.initEvents) {
      yield this.wrap(event)
    }

    // 2. Live event loop.
    while (this.active || this.events.length > 0) {
      if (this.events.length > 0) {
        yield this.wrap(this.events.shift()!)
        continue
      }
      if (this.closed) {
        break
      }
      await new Promise<void>((resolve) => {
        this.pendingResolve = resolve
        // Guard against a lost wakeup: if an event was enqueued (or the session
        // was closed) between the queue-empty check above and this assignment,
        // resolve immediately so we don't park forever on a stale promise.
        if (this.events.length > 0 || this.closed) {
          this.pendingResolve = null
          resolve()
        }
      })
    }
  }

  /** Wrap a raw protocol event in the SDK's BidirectionalInputPayloadPart chunk. */
  private wrap(event: RawEvent): InvokeModelWithBidirectionalStreamInput {
    return {
      chunk: { bytes: new TextEncoder().encode(JSON.stringify(event)) },
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Open the stream: assemble the init events (sessionStart → promptStart →
   * system content → open the user audio channel), send the command, then kick
   * off the response loop without awaiting it.
   */
  async start(instructions: string, tools: Tool[], voiceId?: string): Promise<void> {
    if (this.active || this.closed) {
      return
    }

    this.initEvents = [
      sessionStart(),
      promptStart(this.promptName, tools, voiceId),
      ...systemContent(this.promptName, instructions),
      audioContentStart(this.promptName, this.audioContentName),
    ]

    this.active = true

    const command = new InvokeModelWithBidirectionalStreamCommand({
      modelId: MODEL_ID,
      body: this.inputStream(),
    })

    let response: InvokeModelWithBidirectionalStreamCommandOutput
    try {
      response = await this.client.send(command)
    } catch (e) {
      // send() failed to open the stream — reset state so subsequent
      // pushAudio/stop calls don't enqueue against a stream that never opened.
      this.active = false
      this.closed = true
      this.callbacks.onError?.(e)
      throw e
    }

    // Fire-and-forget; stop() best-effort awaits the stored promise. The
    // trailing .catch prevents a never-stopped loop from surfacing as an
    // unhandled rejection (errors are still routed via onError inside the loop).
    this.responseLoop = this.runResponseLoop(response)
    this.responseLoop.catch(() => {})

    this.sendGreetingKickoff()
  }

  /**
   * Enqueue one initial USER-role text turn that prompts Nova to open the
   * conversation with its greeting, immediately after the stream opens.
   * Nova is speech-to-speech and otherwise waits silently for the patient to
   * speak first — unlike the OpenAI/Henry path, which sends `response.create`
   * on session-open. This reuses the exact same enqueue path as
   * pushSystemText()/userText() (role USER, not SYSTEM — a second SYSTEM
   * block fails the whole stream with "Duplicate SYSTEM content"). Fires
   * once per session; the historian system prompt owns the actual greeting
   * content/persona, this just signals "start now."
   */
  private sendGreetingKickoff(): void {
    if (this.kickoffSent || !this.active) {
      return
    }
    this.kickoffSent = true
    this.pushSystemText(
      '[The interview has now started. Please greet the patient warmly by beginning the conversation and asking your first question.]',
    )
  }

  /** Enqueue one chunk of user audio (base64 LPCM). No-op if not active. */
  pushAudio(base64: string): void {
    if (!this.active) {
      return
    }
    this.enqueue(audioInput(this.promptName, this.audioContentName, base64))
  }

  /** Enqueue a tool result (contentStart → toolResult → contentEnd). */
  pushToolResult(toolUseId: string, jsonString: string): void {
    if (!this.active) {
      return
    }
    const [start, result, end] = toolResultEvents(this.promptName, toolUseId, jsonString)
    this.enqueue(start)
    this.enqueue(result)
    this.enqueue(end)
  }

  /**
   * Enqueue a fresh mid-conversation text turn (contentStart → textInput →
   * contentEnd), each call minting its own contentName. Used for localizer
   * pushes, scale injection, and early-end flushes.
   *
   * Delivered with role USER, NOT SYSTEM: Nova Sonic permits SYSTEM content
   * only once per prompt (the init system prompt), and a second SYSTEM block
   * fails the entire stream with "Duplicate SYSTEM content". USER text turns
   * can be sent repeatedly, so this is the supported channel for dynamic
   * context. The historian system prompt already tells the model how to treat
   * this injected guidance (localizer differential, scale administration).
   */
  pushSystemText(text: string): void {
    if (!this.active) {
      return
    }
    const [start, input, end] = userText(this.promptName, text)
    this.enqueue(start)
    this.enqueue(input)
    this.enqueue(end)
  }

  /**
   * Gracefully close the stream: close the user audio channel, end the prompt,
   * end the session, then let the generator drain and return. Best-effort
   * awaits the response loop so callers can sequence teardown.
   */
  async stop(): Promise<void> {
    if (this.closed) {
      return
    }

    if (this.active) {
      this.enqueue(audioContentEnd(this.promptName, this.audioContentName))
      this.enqueue(promptEnd(this.promptName))
      this.enqueue(sessionEnd())
    }

    this.closed = true
    this.active = false

    // Wake the generator so it can drain the closing events and return.
    if (this.pendingResolve) {
      const resolve = this.pendingResolve
      this.pendingResolve = null
      resolve()
    }

    if (this.responseLoop) {
      try {
        await this.responseLoop
      } catch {
        // The response loop reports its own errors via onError; swallow here.
      }
    }
  }

  // -------------------------------------------------------------------------
  // Response loop
  // -------------------------------------------------------------------------

  private async runResponseLoop(
    response: InvokeModelWithBidirectionalStreamCommandOutput,
  ): Promise<void> {
    try {
      if (!response.body) {
        return
      }
      for await (const event of response.body) {
        // Decoded Bedrock protocol JSON — `any` is acceptable here per task spec.
        if (event.chunk?.bytes) {
          const json: any = JSON.parse(new TextDecoder().decode(event.chunk.bytes))
          if (TRACE_RAW) traceRaw(json)
          this.handleModelEvent(json)
        } else if (event.modelStreamErrorException) {
          this.callbacks.onError?.(event.modelStreamErrorException)
        } else if (event.internalServerException) {
          this.callbacks.onError?.(event.internalServerException)
        }
      }
    } catch (e) {
      this.callbacks.onError?.(e)
    } finally {
      this.active = false
    }
  }

  // generationStage per TEXT content block, captured from contentStart so the
  // matching textOutput (same contentId) can be stage-filtered. Entries are
  // dropped again on contentEnd; text blocks are tiny and sequential, so this
  // never grows past a handful of entries.
  private readonly textStageByContentId = new Map<string, GenerationStage>()

  /** Dispatch one decoded `{ event: { ... } }` payload to the callbacks. */
  private handleModelEvent(json: any): void {
    const event = json?.event
    if (!event) {
      return
    }

    if (event.contentStart) {
      if (event.contentStart.type === 'TEXT' && event.contentStart.contentId) {
        this.textStageByContentId.set(
          event.contentStart.contentId,
          parseGenerationStage(event.contentStart.additionalModelFields),
        )
      }
      return
    }

    if (event.contentEnd) {
      if (event.contentEnd.contentId) {
        this.textStageByContentId.delete(event.contentEnd.contentId)
      }
      return
    }

    if (event.textOutput) {
      const content: string = event.textOutput.content ?? ''
      if (INTERRUPTED_RE.test(content)) {
        this.callbacks.onBargeIn?.()
      } else {
        const stage = this.textStageByContentId.get(event.textOutput.contentId) ?? ''
        if (shouldForwardText(event.textOutput.role, stage)) {
          this.callbacks.onTextOutput?.(event.textOutput.role, content)
        }
      }
      return
    }

    if (event.audioOutput) {
      this.callbacks.onAudioOutput?.(event.audioOutput.content)
      return
    }

    if (event.toolUse) {
      this.callbacks.onToolUse?.({
        toolName: event.toolUse.toolName,
        toolUseId: event.toolUse.toolUseId,
        content: event.toolUse.content,
      })
      return
    }

    if (event.completionEnd) {
      this.callbacks.onCompletionEnd?.()
      return
    }
  }
}
