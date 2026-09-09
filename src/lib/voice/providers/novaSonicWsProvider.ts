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
 *
 * Nova's turn ordering — text BEFORE audio — and why stop() waits:
 *   Unlike OpenAI's Realtime API, where a turn's transcript arrives after its
 *   audio, Nova Sonic streams the `assistantTranscript` ServerMsg BEFORE the
 *   `audio` chunks it describes. `useRealtimeSession`'s assistantTranscript
 *   handler treats that event as "the AI finished speaking" (correct for
 *   OpenAI) and calls setAiSpeaking(false) + maybeScheduleAutoEnd(), so on
 *   Nova the session's endSession()/stop() can run while Nova is still
 *   *generating* the current turn's audio — not merely finishing playback of
 *   audio already received (that part #238's drain wait already covers).
 *   Sending `{t:'stop'}` to the relay at that point has it close the Nova
 *   stream mid-generation, permanently losing the rest of the turn (prod, run
 *   66843ad4, 2026-09-09: the patient heard Henry's closing line except the
 *   last word or two). stop() below therefore waits for the turn itself to
 *   finish — a `completion`/`aiSpeechStop` message, or TURN_IDLE_MS of no new
 *   `audio`, or the STOP_TURN_CAP_MS hard cap — before sending `{t:'stop'}`,
 *   in addition to (not instead of) #238's post-stop drain wait for audio
 *   that has already reached the browser. The ordering bug itself is NOT
 *   fixed here — that logic is shared with the OpenAI provider and has its
 *   own regression history (see useRealtimeSession's "Fix 2/3/4" comments) —
 *   this provider instead makes stop() robust to being called early.
 */

import type { ClientMsg, ServerMsg } from '@/lib/voice/relayProtocol'
import { MicCapture } from '@/lib/voice/audio/capture-worklet'
import { PcmPlayer } from '@/lib/voice/audio/player'
import type { VoiceEvent, VoiceProvider, VoiceStartOptions } from '@/lib/voice/providerTypes'

/**
 * Cap on how long stop() will wait for queued audio to finish draining
 * before closing the player anyway. Guards against a hung/undelivered
 * 'drained' report stalling teardown indefinitely — see stop() below.
 */
const STOP_DRAIN_CAP_MS = 8000

/**
 * How long stop() will wait, with no new `audio` ServerMsg arriving, before
 * concluding Nova's current turn has actually finished producing audio (as
 * opposed to merely pausing between chunks). See stop() below.
 */
const TURN_IDLE_MS = 800

/**
 * Absolute cap on how long stop() will wait for Nova's in-flight turn to
 * finish before giving up and sending `{t:'stop'}` anyway. Guards against a
 * turn that never emits `completion`/`aiSpeechStop` and never goes idle
 * (e.g. a stuck relay) stalling teardown indefinitely.
 */
const STOP_TURN_CAP_MS = 6000

export class NovaSonicWsProvider implements VoiceProvider {
  private ws: WebSocket | null = null
  private mic: MicCapture | null = null
  private player: PcmPlayer | null = null
  private cb: ((e: VoiceEvent) => void) | null = null
  /** Set true once stop() runs so a subsequent onclose isn't reported as an error. */
  private closing = false
  /** True while the AI is producing audio — lets `completion` end the turn cleanly. */
  private aiSpeaking = false
  /** Last diagnostics snapshot captured from `player` before it was closed in
   *  stop() — so getAudioDiagnostics() still has something to return after
   *  teardown (e.g. when the hook reads it right after stop() completes). */
  private stashedDiagnostics: Record<string, unknown> | null = null
  /** Timestamp (Date.now()) of the most recent relay `audio` ServerMsg, or 0
   *  if none has arrived yet. Drives stop()'s turn-idle wait below. */
  private lastAudioAt = 0
  /** Pending resolvers for stop()'s "let the turn finish" wait — released by
   *  the next `completion` or `aiSpeechStop` relay message. Normally empty;
   *  only populated while stop() is waiting. */
  private turnFinishResolvers: Array<() => void> = []

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
    return this.ws?.readyState === WebSocket.OPEN
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
      // Kick off the session, then start streaming mic audio.
      this.send({
        t: 'start',
        instructions: opts.instructions,
        tools: opts.tools,
        voiceId: opts.voiceId,
      })

      // Start mic capture: each 16k PCM16 base64 chunk becomes an `audio` msg.
      const mic = new MicCapture()
      this.mic = mic
      mic
        .start((pcm) => {
          this.send({ t: 'audio', pcm })
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
      // Only an unexpected close (not our own stop(), not a clean 1000) is a
      // drop. Emitted as `disconnected` (not `error`) so the hook runs the
      // SAME graceful end-of-session flow as the OpenAI provider's transport-
      // drop handling and a manual "End Interview" click — flush
      // save_interview_output, fall back to a raw-transcript narrative, tear
      // down, fire onComplete.
      //
      // NOTE: `event.wasClean` reflects whether the closing HANDSHAKE
      // completed (both sides exchanged Close frames), not whether the code
      // is 1000. A server-initiated close with a fatal, non-1000 code (e.g.
      // the relay's onError path closing with 1011) still completes the
      // handshake normally, so `wasClean` is `true` there — checking
      // `!event.wasClean` (true only for an abrupt 1006 drop) silently
      // swallowed every OTHER non-1000 close, including this one. `code !==
      // 1000` alone is the correct "was this expected" check; `wasClean`
      // adds nothing once `closing` already gates our own clean stop().
      if (!this.closing && event.code !== 1000) {
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
    switch (msg.t) {
      case 'userTranscript':
        this.emit({ type: 'userTranscript', text: msg.text })
        break
      case 'assistantTranscript':
        this.emit({ type: 'assistantTranscript', text: msg.text })
        break
      case 'assistantTextDelta':
        this.emit({ type: 'assistantTextDelta', text: msg.text })
        break
      case 'audio':
        // Raw audio drives the player only — no VoiceEvent. Recorded even
        // while stop() is waiting (closing=true does NOT gate this handler)
        // so stop()'s turn-idle wait can tell an active turn from a stalled
        // one, and so the audio itself keeps reaching the player.
        this.lastAudioAt = Date.now()
        this.player?.enqueue(msg.pcm)
        break
      case 'aiSpeechStart':
        this.aiSpeaking = true
        this.emit({ type: 'aiSpeechStart' })
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
        this.emitAiSpeechStopWhenDrained()
        this.resolveTurnWait()
        break
      case 'bargeIn':
        // User interrupted: flush queued AI audio, then signal speech stopped
        // immediately — interrupt() already silenced playback, so there is
        // nothing left to drain.
        this.player?.interrupt()
        this.aiSpeaking = false
        this.emit({ type: 'aiSpeechStop' })
        break
      case 'toolCall':
        this.emit({
          type: 'toolCall',
          toolName: msg.toolName,
          toolUseId: msg.toolUseId,
          input: msg.input,
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
        this.emitAiSpeechStopWhenDrained()
        this.resolveTurnWait()
        break
      case 'error':
        this.emit({ type: 'error', message: msg.message })
        break
      case 'medicalTranscript':
        this.emit({ type: 'medicalTranscript', text: msg.text, isPartial: msg.isPartial })
        break
    }
  }

  /**
   * Emits `aiSpeechStop` only after any PCM already queued in the player has
   * finished playing (see PcmPlayer.whenDrained). Falls back to an immediate
   * emit if there's no player (e.g. already torn down).
   */
  private emitAiSpeechStopWhenDrained(): void {
    const player = this.player
    if (!player) {
      this.emit({ type: 'aiSpeechStop' })
      return
    }
    player.whenDrained().then(() => {
      this.emit({ type: 'aiSpeechStop' })
    })
  }

  /** Releases stop()'s "let the turn finish" wait, if one is pending. */
  private resolveTurnWait(): void {
    const resolvers = this.turnFinishResolvers
    this.turnFinishResolvers = []
    for (const resolve of resolvers) resolve()
  }

  /**
   * True when there's clearly nothing to wait for: no turn is in progress
   * (aiSpeaking is false) AND no `audio` ServerMsg has arrived in the last
   * TURN_IDLE_MS (or ever). Lets stop() skip the wait entirely on the
   * transport-drop / manual-end path, where there is no in-flight goodbye.
   */
  private shouldSkipTurnWait(): boolean {
    const sinceLastAudio = this.lastAudioAt === 0 ? Infinity : Date.now() - this.lastAudioAt
    return !this.aiSpeaking && sinceLastAudio >= TURN_IDLE_MS
  }

  /**
   * Resolves on the FIRST of: a `completion`/`aiSpeechStop` relay message
   * (via resolveTurnWait, called from handleServerMsg), TURN_IDLE_MS
   * elapsing with no new `audio` message, or the STOP_TURN_CAP_MS hard cap.
   * Never rejects.
   */
  private waitForTurnToFinish(): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false
      let idleTimer: ReturnType<typeof setTimeout> | undefined

      const finish = () => {
        if (settled) return
        settled = true
        if (idleTimer !== undefined) clearTimeout(idleTimer)
        clearTimeout(capTimer)
        const idx = this.turnFinishResolvers.indexOf(finish)
        if (idx >= 0) this.turnFinishResolvers.splice(idx, 1)
        resolve()
      }

      this.turnFinishResolvers.push(finish)
      const capTimer = setTimeout(finish, STOP_TURN_CAP_MS)

      // Re-checked (not just scheduled once) each time it fires: a new
      // `audio` message pushes lastAudioAt forward between now and when
      // this timer was set, so the first firing may find time still
      // remaining — in which case it reschedules for the new remainder
      // rather than firing early.
      const scheduleIdleCheck = () => {
        const remaining = TURN_IDLE_MS - (Date.now() - this.lastAudioAt)
        if (remaining <= 0) {
          finish()
          return
        }
        idleTimer = setTimeout(scheduleIdleCheck, remaining)
      }
      scheduleIdleCheck()
    })
  }

  /** See VoiceProvider.getAudioDiagnostics — iOS crackle instrumentation. */
  async getAudioDiagnostics(): Promise<Record<string, unknown> | null> {
    if (this.player) return this.player.getDiagnostics()
    return this.stashedDiagnostics
  }

  sendToolResult(toolUseId: string, output: unknown): void {
    this.send({
      t: 'toolResult',
      toolUseId,
      output: typeof output === 'string' ? output : JSON.stringify(output),
    })
  }

  injectSystemText(text: string): void {
    this.send({ t: 'systemText', text })
  }

  requestResponse(): void {
    // No-op: Nova drives its own turn-taking; the injected system text is acted
    // on as it continues. There is no relay frame to force a turn, and no
    // text-only response concept (opts ignored).
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

    // Stop the mic immediately — the patient should not be recorded once
    // stop() has been called, even while we wait below for Nova's in-flight
    // turn to actually finish.
    if (this.mic) {
      try {
        await this.mic.stop()
      } catch {
        // best-effort teardown
      }
      this.mic = null
    }

    // Let the current AI turn finish before telling the relay to stop. Nova
    // sends the turn's transcript text (assistantTranscript) BEFORE its
    // audio, unlike OpenAI where the transcript arrives after the audio —
    // see the class header comment. The hook's setAiSpeaking(false) +
    // maybeScheduleAutoEnd() therefore fire while Nova is still generating
    // (and streaming) the goodbye, so by the time stop() runs here the turn
    // may still be in flight. Sending `{t:'stop'}` immediately in that case
    // has the relay close Nova mid-generation, cutting the closing line off
    // (prod, run 66843ad4, 2026-09-09) — #238's drain wait only helps audio
    // that already reached the browser. Skipped entirely on the transport-
    // drop / manual-end path where there is no in-flight turn to protect —
    // see shouldSkipTurnWait().
    if (this.ws && this.ws.readyState === WebSocket.OPEN && !this.shouldSkipTurnWait()) {
      await this.waitForTurnToFinish()
    }
    this.aiSpeaking = false

    // Tell the relay we're done before tearing local resources down.
    this.send({ t: 'stop' })

    if (this.player) {
      // Let any already-queued audio (e.g. a closing goodbye) actually play
      // out before the player is torn down — mirrors emitAiSpeechStopWhenDrained,
      // and fixes the prod cutoff (run 22350e76, 2026-09-08): the old code
      // closed the player as soon as mic teardown finished, regardless of
      // whether the AI's closing line had actually finished playing.
      // Race against a hard cap so a stuck/undelivered drain report (or a
      // player with no working drain signal at all) can never stall stop().
      // Never throws: whenDrained() rejecting would otherwise abort stop()
      // before the socket/mic teardown below completes.
      await Promise.race([
        this.player.whenDrained().catch(() => {}),
        new Promise<void>((resolve) => setTimeout(resolve, STOP_DRAIN_CAP_MS)),
      ])

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
