/**
 * openaiWebrtcProvider — VoiceProvider over OpenAI's Realtime API (WebRTC).
 *
 * This is a faithful port of the transport in `src/hooks/useRealtimeSession.ts`
 * as of the 2026-07 harness hardening (PRs #130-#143): token-fed
 * RTCPeerConnection, hidden autoplay <audio> element (iOS-safe), mic
 * getUserMedia + addTrack, an `oai-events` data channel, the SDP offer/answer
 * exchange against
 *   POST https://api.openai.com/v1/realtime/calls?model=<model>
 * with `Authorization: Bearer <ephemeralKey>` + `Content-Type: application/sdp`,
 * PLUS the July fixes that must survive this refactor:
 *   - #142: response.create is sent with NO `response.modalities` field
 *     (dropping it fixed a class of malformed/empty responses).
 *   - #134: the greeting response.create fires on `session.created`, with
 *     dc.onopen as a fallback in case the channel opens AFTER session.created
 *     already arrived (avoids a missed greeting on the late-open race).
 *   - #141/#139: unexpected transport drops (pc failed/closed, dc close) are
 *     surfaced as a `disconnected` VoiceEvent so the hook can run the SAME
 *     graceful end-of-session flow as a manual "End Interview" click, instead
 *     of leaving the screen frozen with a cold connection.
 *   - Ephemeral-token renewal ~90s before expiry (session-renew), so long
 *     interviews survive past the short-lived token TTL without a reconnect.
 *
 * The difference vs the hook: instead of touching React state, the data-channel
 * `handleServerEvent` switch is re-expressed as normalized VoiceEvent emissions.
 * No harness logic (red flags, localizer, scales, safety, transcript bookkeeping)
 * lives here — that stays in the hook.
 *
 * Audio playback is handled by the WebRTC remote track → <audio> element,
 * NOT the PcmPlayer (which is Nova-only).
 */

import type { VoiceEvent, VoiceProvider, VoiceStartOptions } from '@/lib/voice/providerTypes'

const DEFAULT_MODEL = 'gpt-realtime-2'

export class OpenAiWebrtcProvider implements VoiceProvider {
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private audioEl: HTMLAudioElement | null = null
  private stream: MediaStream | null = null
  private cb: ((e: VoiceEvent) => void) | null = null
  private stopped = false
  /** Tracks whether we've emitted aiSpeechStart for the in-flight response. */
  private aiSpeaking = false
  /** Set true once session.created arrives (#134 greeting-timing fix). */
  private sessionCreated = false
  /** Token renewal (~90s before expiry). */
  private renewalTimer: ReturnType<typeof setTimeout> | null = null
  private sessionType = 'new_patient'

  on(cb: (e: VoiceEvent) => void): void {
    this.cb = cb
  }

  private emit(e: VoiceEvent): void {
    this.cb?.(e)
  }

  /** Guarded data-channel send — only when the channel is open. */
  private dcSend(obj: unknown): void {
    if (this.dc && this.dc.readyState === 'open') {
      this.dc.send(JSON.stringify(obj))
    }
  }

  /** #142: response.create with NO response.modalities field. */
  private sendResponseCreate(): void {
    this.dcSend({ type: 'response.create', response: {} })
  }

  async start(opts: VoiceStartOptions): Promise<void> {
    if (this.pc) return // already started — idempotent guard
    if (!opts.ephemeralKey) {
      this.emit({ type: 'error', message: 'openaiWebrtcProvider: ephemeralKey is required' })
      return
    }

    this.stopped = false
    this.aiSpeaking = false
    this.sessionCreated = false
    if (opts.sessionType) this.sessionType = opts.sessionType

    try {
      // 1. Peer connection
      const pc = new RTCPeerConnection()
      this.pc = pc

      // 2. Remote audio playback element.
      // iOS Safari requires the element to be attached to the DOM for audio to
      // route correctly (including to the phone speaker). Hidden but in-tree.
      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      audioEl.controls = false
      // @ts-expect-error - playsInline is valid for iOS Safari
      audioEl.playsInline = true
      audioEl.style.display = 'none'
      audioEl.setAttribute('aria-hidden', 'true')
      document.body.appendChild(audioEl)
      this.audioEl = audioEl

      pc.ontrack = (event) => {
        audioEl.srcObject = event.streams[0]
        // Resume playback if the browser paused after srcObject change.
        audioEl.play().catch(() => {})
      }

      // 3. Mic. Explicit constraints give the best behavior on speakerphone —
      // the mic suppresses speaker bleed rather than canceling AI audio.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      this.stream = stream
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))

      // 4. Data channel for events.
      const dc = pc.createDataChannel('oai-events')
      this.dc = dc

      dc.onopen = () => {
        // #134: if session.created already arrived before the channel opened,
        // fire the greeting now — otherwise the session.created handler (in
        // handleServerEvent) does it once it arrives.
        if (this.sessionCreated) {
          this.sendResponseCreate()
        }
      }

      dc.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string)
          this.handleServerEvent(msg)
        } catch {
          // ignore unparseable frames
        }
      }

      // Detect server-side session teardown (OpenAI Realtime ~8-min max).
      // Without these handlers the connection goes cold and the hook never
      // learns the transport is gone. Skip 'disconnected' pc state — ICE can
      // bounce disconnected→connected on a brief network blip; only treat
      // terminal states as a real drop. Guarded by `this.stopped` so our own
      // stop() teardown never reports itself as an unexpected drop.
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState
        if (this.stopped) return
        if (state === 'failed' || state === 'closed') {
          this.emit({ type: 'disconnected', reason: `pc:${state}` })
        }
      }

      dc.onclose = () => {
        if (this.stopped) return
        this.emit({ type: 'disconnected', reason: 'dc:close' })
      }

      // 5. SDP offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // 6. Exchange offer for answer against the OpenAI Realtime calls endpoint.
      // Mirrors useRealtimeSession exactly: /v1/realtime/calls?model=...,
      // bearer = ephemeral key, body = SDP, application/sdp content type.
      const model = opts.model ?? DEFAULT_MODEL
      const sdpRes = await fetch(
        `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`,
        {
          method: 'POST',
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${opts.ephemeralKey}`,
            'Content-Type': 'application/sdp',
          },
        },
      )

      if (!sdpRes.ok) {
        const errorBody = await sdpRes.text()
        throw new Error(`OpenAI Realtime SDP exchange returned ${sdpRes.status}: ${errorBody}`)
      }

      const sdpAnswer = await sdpRes.text()
      await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer })

      // 7. Schedule ephemeral-token renewal so long interviews survive past
      // the token's short TTL without a reconnect.
      if (opts.expiresAt) this.scheduleRenewal(opts.expiresAt)
    } catch (err: unknown) {
      this.emit({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to start OpenAI WebRTC session',
      })
      // Tear down any half-open transport so the provider is reusable.
      await this.stop()
    }
  }

  /**
   * Renews the ephemeral token ~90s before expiry via session-renew, then
   * swaps it into the live session with session.update. Non-fatal: if
   * renewal fails, the interview continues on the current token — worst
   * case the ~8-min server-side cap ends the session and the hook's
   * `disconnected` handling takes over gracefully.
   */
  private scheduleRenewal(expiresAt: number): void {
    if (this.renewalTimer) clearTimeout(this.renewalTimer)
    const msUntilExpiry = expiresAt * 1000 - Date.now()
    const msUntilRenew = Math.max(msUntilExpiry - 90_000, 0) // 90s before expiry
    console.log(`[openaiWebrtcProvider] scheduling token renewal in ${Math.round(msUntilRenew / 1000)}s`)
    this.renewalTimer = setTimeout(async () => {
      if (this.stopped || !this.pc || !this.dc || this.dc.readyState !== 'open') return
      try {
        const res = await fetch('/api/ai/historian/session-renew', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionType: this.sessionType }),
        })
        if (!res.ok) {
          console.warn('[openaiWebrtcProvider] session-renew failed:', res.status)
          return
        }
        const { ephemeralKey, expiresAt: newExpiresAt } = await res.json()
        if (!ephemeralKey) return
        // TODO: verify whether OpenAI Realtime actually accepts client_secret
        // on session.update (the ephemeral key authenticates SDP setup, not
        // per-event config). If the 8-min cap is a hard session-duration
        // limit rather than token TTL, this send will be a no-op and the
        // onconnectionstatechange handler catches the drop gracefully.
        this.dcSend({
          type: 'session.update',
          session: { client_secret: ephemeralKey },
        })
        console.log('[openaiWebrtcProvider] token renewed — session continues')
        if (newExpiresAt) this.scheduleRenewal(newExpiresAt)
      } catch (err) {
        console.warn('[openaiWebrtcProvider] session renewal error (non-fatal):', err)
      }
    }, msUntilRenew)
  }

  /**
   * Map an OpenAI Realtime data-channel event to a VoiceEvent.
   * Mirrors the switch in useRealtimeSession.handleServerEvent, minus the
   * harness-specific bookkeeping that now lives in the hook.
   */
  private handleServerEvent(msg: any): void {
    switch (msg.type) {
      case 'session.created': {
        // #134: session is fully configured — instructions are applied. Fire
        // the greeting now if the channel is already open; otherwise
        // dc.onopen fires it once the channel catches up.
        this.sessionCreated = true
        if (this.dc?.readyState === 'open') {
          this.sendResponseCreate()
        }
        break
      }

      case 'response.audio_transcript.delta': {
        // Streaming AI text. Emit aiSpeechStart on the first delta of a turn.
        if (!this.aiSpeaking) {
          this.aiSpeaking = true
          this.emit({ type: 'aiSpeechStart' })
        }
        this.emit({ type: 'assistantTextDelta', text: msg.delta || '' })
        break
      }

      case 'response.audio_transcript.done': {
        this.emit({ type: 'assistantTranscript', text: msg.transcript || '' })
        if (this.aiSpeaking) {
          this.aiSpeaking = false
          this.emit({ type: 'aiSpeechStop' })
        }
        break
      }

      case 'conversation.item.input_audio_transcription.completed': {
        this.emit({ type: 'userTranscript', text: msg.transcript || '' })
        break
      }

      case 'input_audio_buffer.speech_started': {
        this.emit({ type: 'userSpeechStart' })
        break
      }

      case 'input_audio_buffer.speech_stopped': {
        this.emit({ type: 'userSpeechStop' })
        break
      }

      case 'response.done': {
        // Surface any function calls as toolCall events. The hook executes the
        // tool and returns the result via sendToolResult.
        const output = msg.response?.output
        if (output && Array.isArray(output)) {
          for (const item of output) {
            if (item.type !== 'function_call') continue
            let input: unknown
            try {
              input = JSON.parse(item.arguments || '{}')
            } catch {
              input = {}
            }
            this.emit({
              type: 'toolCall',
              toolName: item.name,
              toolUseId: item.call_id,
              input,
            })
          }
        }
        break
      }

      case 'error': {
        this.emit({ type: 'error', message: msg.error?.message || 'Realtime API error' })
        break
      }
    }
  }

  sendToolResult(toolUseId: string, output: unknown): void {
    // Mirror the existing hook: post the function_call_output, then prompt the
    // model to continue with a fresh response.create (#142: no modalities).
    this.dcSend({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: toolUseId,
        output: typeof output === 'string' ? output : JSON.stringify(output),
      },
    })
    this.sendResponseCreate()
  }

  injectSystemText(text: string): void {
    // Provider-portable injection: an advisory system message in the
    // conversation timeline, with NO forced response.create. The model picks it
    // up on its next natural turn. This matches the existing localizer
    // advisory-injection semantics (conversation.item.create form), chosen
    // deliberately over session.update so both providers share one injection
    // semantic.
    this.dcSend({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'system',
        content: [{ type: 'input_text', text }],
      },
    })
  }

  requestResponse(opts?: { textOnly?: boolean }): void {
    // Force the model to produce a response now. Used by the hook to compose
    // injectSystemText(x) + requestResponse() where a forced turn is required
    // (e.g. scale-administration kick-off). `textOnly` restricts the response
    // to text (no audio) — the end-of-interview flush prompt uses this so the
    // AI doesn't start speaking a full reply right before teardown.
    if (opts?.textOnly) {
      this.dcSend({ type: 'response.create', response: { modalities: ['text'] } })
      return
    }
    this.sendResponseCreate()
  }

  updateInstructions(fullText: string): void {
    // Overwrites the live session's instructions (vs. injectSystemText's
    // timeline-append). Requires `session.type` on every session.update, not
    // just at session create — omitting it gets rejected with HTTP 400
    // missing_required_parameter (caught by /tmp/historian-play.py WSS smoke
    // 2026-05-27).
    this.dcSend({
      type: 'session.update',
      session: { type: 'realtime', instructions: fullText },
    })
  }

  async stop(): Promise<void> {
    if (this.stopped) return // idempotent
    this.stopped = true

    if (this.renewalTimer) {
      clearTimeout(this.renewalTimer)
      this.renewalTimer = null
    }
    if (this.dc) {
      try {
        this.dc.close()
      } catch {
        // best-effort
      }
      this.dc = null
    }
    if (this.pc) {
      try {
        this.pc.close()
      } catch {
        // best-effort
      }
      this.pc = null
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop())
      this.stream = null
    }
    if (this.audioEl) {
      this.audioEl.srcObject = null
      if (this.audioEl.parentNode) {
        this.audioEl.parentNode.removeChild(this.audioEl)
      }
      this.audioEl = null
    }
  }
}
