/**
 * novaSonicWsProvider — VoiceProvider over the Nova Sonic WS relay.
 *
 * Transport:
 *   browser  ──WebSocket──▶  nova-sonic-relay  ──▶  Bedrock Nova Sonic
 *
 * The relay speaks the ClientMsg/ServerMsg protocol in
 * `@/lib/voice/relayProtocol`. This provider:
 *   - sends `start` on open, then streams mic PCM as `audio` ClientMsgs
 *     (via the shared MicCapture)
 *   - plays back relay `audio` ServerMsgs through the shared PcmPlayer
 *   - maps every other ServerMsg onto a normalized VoiceEvent
 *
 * It owns NO harness logic — tool calls are surfaced as `toolCall` VoiceEvents
 * and results come back in via `sendToolResult`.
 */

import type { ClientMsg, ServerMsg } from '@/lib/voice/relayProtocol'
import { MicCapture } from '@/lib/voice/audio/capture-worklet'
import { PcmPlayer } from '@/lib/voice/audio/player'
import type {
  VoiceContinuationCheckpoint,
  VoiceContinuationCommitResult,
  VoiceEvent,
  VoiceProvider,
  VoiceStartOptions,
} from '@/lib/voice/providerTypes'

export class NovaSonicWsProvider implements VoiceProvider {
  private ws: WebSocket | null = null
  private mic: MicCapture | null = null
  private player: PcmPlayer | null = null
  private cb: ((e: VoiceEvent) => void) | null = null
  /** Set true once stop() runs so a subsequent onclose isn't reported as an error. */
  private closing = false
  /** True while the AI is producing audio — lets `completion` end the turn cleanly. */
  private aiSpeaking = false
  /** Latched for a terminal text-only save; later PCM is discarded. */
  private outputSuppressed = false
  /** False once the relay reports that the underlying Bedrock stream ended. */
  private modelStreamOpen = false
  /** Prevents a terminal relay frame plus the ensuing WS close from double-ending. */
  private disconnectedEmitted = false
  /** Monotonic browser input sequence; never resets across inner Nova segments. */
  private audioSeq = 0
  /** Relay-owned Bedrock segment currently allowed to reach the hook/player. */
  private segmentId = 1
  /** Segment-scoped tool ownership prevents a late async result reaching a replacement stream. */
  private readonly toolSegments = new Map<string, number>()
  private continuationBarrier: {
    barrierId: string
    segmentId: number
    lastAudioSeq: number
    deadlineAtMs: number
  } | null = null
  private continuationCommit: {
    barrierId: string
    transcriptThroughSeq: number
    resolve: (result: VoiceContinuationCommitResult) => void
    reject: (error: Error) => void
    timeout: ReturnType<typeof setTimeout>
  } | null = null
  /** Last diagnostics snapshot captured from `player` before it was closed in
   *  stop() — so getAudioDiagnostics() still has something to return after
   *  teardown (e.g. when the hook reads it right after stop() completes). */
  private stashedDiagnostics: Record<string, unknown> | null = null

  on(cb: (e: VoiceEvent) => void): void {
    this.cb = cb
  }

  private emit(e: VoiceEvent): void {
    this.cb?.(e)
  }

  /** Guarded send — drops messages if the socket isn't open. */
  private send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  /** Transport-open signal for the hook's save-flush gate (see VoiceProvider). */
  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.modelStreamOpen
  }

  async start(opts: VoiceStartOptions): Promise<void> {
    if (this.ws) return // already started — idempotent guard
    if (!opts.relayUrl) {
      // Throw (not emit+return) so the hook's start() catch surfaces this as an
      // error state. Emitting and returning would let the caller fall through to
      // status:'active' with no transport — a silent failure on the default path.
      throw new Error('novaSonicWsProvider: relayUrl is required (set NOVA_SONIC_RELAY_URL)')
    }

    this.closing = false
    this.aiSpeaking = false
    this.outputSuppressed = false
    this.modelStreamOpen = false
    this.disconnectedEmitted = false
    this.audioSeq = 0
    this.segmentId = 1
    this.toolSegments.clear()
    this.clearContinuation(new Error('Nova session restarted'))

    // Wrap setup so a synchronous failure (e.g. `new WebSocket` throwing on a
    // malformed relayUrl) tears down anything already allocated — mirrors the
    // OpenAI provider's start() cleanup discipline.
    try {
    this.player = new PcmPlayer()

    // The relay's WS upgrade requires a short-lived auth token (see
    // services/nova-sonic-relay/src/server.ts verifyClient). Browsers cannot
    // set custom headers on a WS handshake, so the token rides along as a
    // second subprotocol next to the fixed 'nova.v1' tag. If the session
    // route didn't return a token (NOVA_RELAY_SHARED_SECRET unset
    // server-side), we still attempt the connection with just 'nova.v1' —
    // the relay's fail-closed verifyClient rejects it and the existing
    // onclose/onerror -> `disconnected`/`error` path surfaces the failure.
    const ws = new WebSocket(opts.relayUrl, ['nova.v1', opts.relayToken].filter(Boolean) as string[])
    this.ws = ws

    ws.onopen = () => {
      this.modelStreamOpen = true
      // Kick off the session, then start streaming mic audio.
      this.send({
        t: 'start',
        instructions: opts.instructions,
        tools: opts.tools,
        voiceId: opts.voiceId,
        interviewMode: opts.interviewMode,
      })

      // Start mic capture: each 16k PCM16 base64 chunk becomes an `audio` msg.
      const mic = new MicCapture()
      this.mic = mic
      mic
        .start((pcm) => {
          this.send({ t: 'audio', pcm, audioSeq: ++this.audioSeq })
        })
        .catch((err: unknown) => {
          this.emit({
            type: 'error',
            message: `mic capture failed: ${err instanceof Error ? err.message : String(err)}`,
          })
        })
    }

    ws.onmessage = (event: MessageEvent) => {
      let msg: ServerMsg
      try {
        msg = JSON.parse(event.data as string) as ServerMsg
      } catch {
        return // ignore unparseable frames
      }
      this.handleServerMsg(msg)
    }

    ws.onerror = () => {
      // The browser WebSocket error event carries no detail. onclose follows
      // and is the one that decides disconnected-vs-clean, so no emit here —
      // avoids double-reporting the same drop as both `error` and
      // `disconnected`.
    }

    ws.onclose = (event: CloseEvent) => {
      // Every remote close that was not initiated by stop() is a drop, even
      // when the peer used clean code 1000. Emitted as `disconnected` so the hook runs the
      // SAME graceful end-of-session flow as the OpenAI provider's transport-
      // drop handling and a manual "End Interview" click — flush
      // save_interview_output, fall back to a raw-transcript narrative, tear
      // down, fire onComplete.
      this.modelStreamOpen = false
      this.outputSuppressed = true
      this.aiSpeaking = false
      this.player?.interrupt()
      if (!this.closing && !this.disconnectedEmitted) {
        this.disconnectedEmitted = true
        this.emit({ type: 'disconnected', reason: `ws:close(${event.code})` })
      }
    }
    } catch (err) {
      // Tear down, then RE-THROW so start() rejects and the hook's catch sets
      // status:'error' (same contract as the OpenAI provider). Resolving after
      // a synchronous setup failure would strand the hook in 'active'.
      await this.stop()
      throw err instanceof Error ? err : new Error(`nova start failed: ${String(err)}`)
    }
  }

  /** Map a relay ServerMsg onto a VoiceEvent and/or drive the player. */
  private handleServerMsg(msg: ServerMsg): void {
    const taggedSegment = 'segmentId' in msg ? msg.segmentId : undefined
    if (
      typeof taggedSegment === 'number' &&
      taggedSegment !== this.segmentId &&
      msg.t !== 'continuationDue' &&
      msg.t !== 'continuationBarrier' &&
      msg.t !== 'continuationReady' &&
      msg.t !== 'continuationRecovered'
    ) {
      return
    }
    switch (msg.t) {
      case 'userTranscript':
        this.emit({ type: 'userTranscript', text: msg.text, segmentId: msg.segmentId })
        break
      case 'assistantTranscript':
        this.emit({ type: 'assistantTranscript', text: msg.text, segmentId: msg.segmentId })
        break
      case 'assistantTextDelta':
        this.emit({ type: 'assistantTextDelta', text: msg.text, segmentId: msg.segmentId })
        break
      case 'audio':
        // Raw audio drives the player only — no VoiceEvent.
        if (this.modelStreamOpen && !this.outputSuppressed) this.player?.enqueue(msg.pcm)
        break
      case 'aiSpeechStart':
        this.aiSpeaking = true
        this.emit({ type: 'aiSpeechStart', segmentId: msg.segmentId })
        break
      case 'aiSpeechStop':
        // The relay sends this the moment Nova's turn (completionEnd) ends,
        // but the closing audio may still be queued in the player — Nova
        // streams PCM as separate chunks scheduled ahead of real time. Defer
        // the "AI stopped speaking" signal until the player actually drains
        // so the hook's order-independent auto-end (useRealtimeSession's
        // maybeScheduleAutoEnd, which gates on !isAiSpeaking) never tears the
        // session down mid-audio. No-op delay for ordinary turns — resolves
        // immediately once nothing is left scheduled.
        this.aiSpeaking = false
        this.emitAiSpeechStopWhenDrained(msg.segmentId ?? this.segmentId)
        break
      case 'bargeIn':
        // User interrupted: flush queued AI audio, then signal speech stopped
        // immediately — interrupt() already silenced playback, so there is
        // nothing left to drain.
        this.player?.interrupt()
        this.aiSpeaking = false
        this.emit({ type: 'aiSpeechStop', segmentId: msg.segmentId })
        break
      case 'toolCall':
        this.toolSegments.set(msg.toolUseId, msg.segmentId ?? this.segmentId)
        this.emit({
          type: 'toolCall',
          toolName: msg.toolName,
          toolUseId: msg.toolUseId,
          input: msg.input,
          segmentId: msg.segmentId,
        })
        break
      case 'completion':
        // End-of-turn — Nova's guaranteed turn-close signal. ALWAYS drain-then-
        // emit aiSpeechStop, even if aiSpeaking was never flagged true for this
        // turn. A systemText-nudged turn (the save-time closing statement) can
        // produce a completion WITHOUT a preceding aiSpeechStart, so the old
        // `if (this.aiSpeaking)` guard swallowed the only end-of-turn signal and
        // the hook's isAiSpeaking stayed stuck true — auto-end never fired and
        // the session hung after the closing. Emitting unconditionally is safe:
        // whenDrained resolves immediately when no audio is queued, and mid-
        // interview aiSpeechStop only clears the speaking flag (the hook's
        // auto-end gates on interviewCompleted, so it can't end early).
        this.aiSpeaking = false
        this.emitAiSpeechStopWhenDrained(msg.segmentId ?? this.segmentId)
        break
      case 'error':
        // Relay model errors are terminal. Mark the underlying model stream
        // unavailable before the hook handles this event so its finalization
        // path skips a save nudge that can no longer reach Nova.
        this.emitTerminalError(msg.message)
        break
      case 'sessionEnded':
        this.modelStreamOpen = false
        this.outputSuppressed = true
        this.aiSpeaking = false
        if (!this.disconnectedEmitted) {
          this.disconnectedEmitted = true
          this.player?.interrupt()
          this.emit({ type: 'disconnected', reason: msg.reason })
        }
        break
      case 'medicalTranscript':
        this.emit({ type: 'medicalTranscript', text: msg.text, isPartial: msg.isPartial })
        break
      case 'continuationDue':
        if (msg.segmentId !== this.segmentId) break
        this.emit({
          type: 'continuationDue',
          segmentId: msg.segmentId,
          deadlineAtMs: msg.deadlineAtMs,
        })
        break
      case 'continuationBarrier': {
        if (msg.segmentId !== this.segmentId || this.continuationBarrier) {
          this.emitTerminalError('Nova continuation barrier mismatch')
          break
        }
        this.continuationBarrier = {
          barrierId: msg.barrierId,
          segmentId: msg.segmentId,
          lastAudioSeq: msg.lastAudioSeq,
          deadlineAtMs: msg.deadlineAtMs,
        }
        const player = this.player
        const drained = player ? player.whenDrained() : Promise.resolve()
        drained.then(() => {
          const barrier = this.continuationBarrier
          if (!barrier || barrier.barrierId !== msg.barrierId || this.segmentId !== msg.segmentId) return
          if (Date.now() >= barrier.deadlineAtMs) {
            this.emitTerminalError('Nova continuation missed its transport deadline')
            return
          }
          this.emit({
            type: 'continuationBarrier',
            barrierId: barrier.barrierId,
            segmentId: barrier.segmentId,
            lastAudioSeq: barrier.lastAudioSeq,
            deadlineAtMs: barrier.deadlineAtMs,
          })
        })
        break
      }
      case 'continuationReady': {
        const pending = this.continuationCommit
        const barrier = this.continuationBarrier
        if (
          !pending ||
          !barrier ||
          msg.barrierId !== pending.barrierId ||
          msg.fromSegmentId !== this.segmentId ||
          msg.lastAudioSeq !== barrier.lastAudioSeq ||
          msg.transcriptThroughSeq !== pending.transcriptThroughSeq ||
          msg.segmentId !== this.segmentId + 1
        ) {
          this.emitTerminalError('Nova continuation acknowledgement mismatch')
          break
        }
        clearTimeout(pending.timeout)
        this.segmentId = msg.segmentId
        this.continuationBarrier = null
        this.continuationCommit = null
        pending.resolve('rotated')
        break
      }
      case 'continuationRecovered': {
        const pending = this.continuationCommit
        const barrier = this.continuationBarrier
        if (
          !pending ||
          !barrier ||
          msg.barrierId !== pending.barrierId ||
          msg.segmentId !== this.segmentId ||
          msg.lastAudioSeq !== barrier.lastAudioSeq ||
          msg.transcriptThroughSeq !== pending.transcriptThroughSeq
        ) {
          this.emitTerminalError('Nova continuation recovery acknowledgement mismatch')
          break
        }
        clearTimeout(pending.timeout)
        this.continuationBarrier = null
        this.continuationCommit = null
        pending.resolve('recovered')
        break
      }
      case 'continuationFailed': {
        const reason =
          `The voice connection ended during continuation (${msg.reason}). ` +
          'Speech after the last confirmed turn may not have been transcribed. ' +
          'If this may be a medical emergency, call 911; for crisis support, call or text 988.'
        this.clearContinuation(new Error(reason))
        this.emitTerminalError(reason)
        break
      }
    }
  }

  /**
   * Emits `aiSpeechStop` only after any PCM already queued in the player has
   * finished playing (see PcmPlayer.whenDrained). Falls back to an immediate
   * emit if there's no player (e.g. already torn down).
   */
  private emitAiSpeechStopWhenDrained(segmentId: number): void {
    const player = this.player
    if (!player) {
      if (segmentId === this.segmentId) this.emit({ type: 'aiSpeechStop', segmentId })
      return
    }
    player.whenDrained().then(() => {
      if (segmentId === this.segmentId) this.emit({ type: 'aiSpeechStop', segmentId })
    })
  }

  /** See VoiceProvider.getAudioDiagnostics — iOS crackle instrumentation. */
  async getAudioDiagnostics(): Promise<Record<string, unknown> | null> {
    if (this.player) return this.player.getDiagnostics()
    return this.stashedDiagnostics
  }

  sendToolResult(toolUseId: string, output: unknown, segmentId?: number): void {
    const owner = this.toolSegments.get(toolUseId)
    const target = segmentId ?? owner ?? this.segmentId
    if (target !== this.segmentId || (owner != null && owner !== target)) {
      // A Nova toolUseId belongs to one Bedrock segment. Silently discard a
      // stale async result; routing it to the replacement segment is unsafe.
      this.toolSegments.delete(toolUseId)
      return
    }
    this.send({
      t: 'toolResult',
      toolUseId,
      output: typeof output === 'string' ? output : JSON.stringify(output),
      segmentId: target,
    })
    this.toolSegments.delete(toolUseId)
  }

  commitContinuation(params: {
    barrierId: string
    checkpoint: VoiceContinuationCheckpoint
  }): Promise<VoiceContinuationCommitResult> {
    const barrier = this.continuationBarrier
    if (
      !barrier ||
      barrier.barrierId !== params.barrierId ||
      params.checkpoint.fromSegmentId !== this.segmentId ||
      this.continuationCommit
    ) {
      this.markModelUnavailable()
      return Promise.reject(new Error('Nova continuation commit does not match the active barrier'))
    }
    const remainingMs = barrier.deadlineAtMs - Date.now()
    if (remainingMs <= 0) {
      this.markModelUnavailable()
      return Promise.reject(new Error('Nova continuation deadline elapsed'))
    }
    return new Promise<VoiceContinuationCommitResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.continuationCommit?.barrierId !== params.barrierId) return
        this.continuationCommit = null
        this.markModelUnavailable()
        reject(new Error('Nova continuation acknowledgement timed out'))
      }, remainingMs)
      this.continuationCommit = {
        barrierId: params.barrierId,
        transcriptThroughSeq: params.checkpoint.transcriptThroughSeq,
        resolve,
        reject,
        timeout,
      }
      this.send({ t: 'continuationCommit', ...params })
    })
  }

  deferContinuation(barrierId: string): void {
    if (this.continuationBarrier?.barrierId !== barrierId) {
      this.emitTerminalError('Nova continuation deferral mismatch')
      return
    }
    this.send({ t: 'continuationDefer', barrierId })
    this.continuationBarrier = null
  }

  private clearContinuation(error: Error): void {
    if (this.continuationCommit) {
      clearTimeout(this.continuationCommit.timeout)
      this.continuationCommit.reject(error)
    }
    this.continuationCommit = null
    this.continuationBarrier = null
  }

  private markModelUnavailable(): void {
    this.modelStreamOpen = false
    this.outputSuppressed = true
    this.aiSpeaking = false
    this.player?.interrupt()
  }

  private emitTerminalError(message: string): void {
    this.markModelUnavailable()
    // This error already owns the terminal notification. Suppress the relay's
    // following sessionEnded/WS-close frames so the hook sees one cause.
    this.disconnectedEmitted = true
    this.emit({ type: 'error', message })
  }

  injectSystemText(text: string): void {
    this.send({ t: 'systemText', text })
  }

  requestResponse(): void {
    // No-op: Nova drives its own turn-taking; the injected system text is acted
    // on as it continues. There is no relay frame to force a turn, and no
    // text-only response concept (opts ignored).
  }

  suppressOutput(): void {
    if (this.outputSuppressed) return
    this.outputSuppressed = true
    this.aiSpeaking = false
    this.player?.interrupt()
  }

  nudgeClosing(): void {
    // Nova is speech-to-speech and stays SILENT after the save_interview_output
    // tool result unless prompted — the same reason it needed sendGreetingKickoff
    // to open. Inject a USER-role text turn (via the existing systemText relay
    // frame) telling it to deliver its one closing message now. The closing
    // audio then streams as PCM and is drained by whenDrained() before
    // aiSpeechStop fires (#150), so it plays in full before teardown.
    this.injectSystemText(
      '[The interview is now complete and your notes have been saved. Please now speak your single warm closing message to the patient, then stop. Do not ask any further questions and do not wait for the patient to reply.]',
    )
  }

  async stop(): Promise<void> {
    if (this.closing) return // idempotent
    this.closing = true
    this.aiSpeaking = false
    this.modelStreamOpen = false
    this.clearContinuation(new Error('Nova session stopped'))
    this.toolSegments.clear()

    // Tell the relay we're done before tearing local resources down.
    this.send({ t: 'stop' })

    if (this.mic) {
      try {
        await this.mic.stop()
      } catch {
        // best-effort teardown
      }
      this.mic = null
    }

    if (this.player) {
      // Stash a final diagnostics snapshot before close() tears the worklet
      // node down — getAudioDiagnostics() would otherwise have nothing to
      // return once `player` is gone. Best-effort: never let this block or
      // fail teardown.
      this.stashedDiagnostics = await this.player.getDiagnostics().catch(() => null)
      try {
        await this.player.close()
      } catch {
        // best-effort teardown
      }
      this.player = null
    }

    if (this.ws) {
      try {
        this.ws.close()
      } catch {
        // best-effort teardown
      }
      this.ws = null
    }
  }
}
