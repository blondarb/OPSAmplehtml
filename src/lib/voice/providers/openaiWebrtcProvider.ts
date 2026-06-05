/**
 * openaiWebrtcProvider — VoiceProvider over OpenAI's Realtime API (WebRTC).
 *
 * This is a faithful port of the EXISTING transport in
 * `src/hooks/useRealtimeSession.ts`: token-fed RTCPeerConnection, hidden
 * autoplay <audio> element (iOS-safe), mic getUserMedia + addTrack, an
 * `oai-events` data channel, and the SDP offer/answer exchange against
 *   POST https://api.openai.com/v1/realtime/calls?model=<model>
 * with `Authorization: Bearer <ephemeralKey>` + `Content-Type: application/sdp`.
 *
 * The difference vs the hook: instead of touching React state, the data-channel
 * `handleServerEvent` switch is re-expressed as normalized VoiceEvent emissions.
 * No harness logic (red flags, localizer, scales, safety, transcript bookkeeping)
 * lives here — that stays in the hooks (Tasks 8/13).
 *
 * Audio playback is handled by the WebRTC remote track → <audio> element,
 * NOT the PcmPlayer (which is Nova-only).
 */

import type { VoiceEvent, VoiceProvider, VoiceStartOptions } from '@/lib/voice/types'

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

  async start(opts: VoiceStartOptions): Promise<void> {
    if (this.pc) return // already started — idempotent guard
    if (!opts.ephemeralKey) {
      this.emit({ type: 'error', message: 'openaiWebrtcProvider: ephemeralKey is required' })
      return
    }

    this.stopped = false
    this.aiSpeaking = false

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
        // Kick the session off once the channel is live.
        this.dcSend({
          type: 'response.create',
          response: { modalities: ['text', 'audio'] },
        })
      }

      dc.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string)
          this.handleServerEvent(msg)
        } catch {
          // ignore unparseable frames
        }
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
   * Map an OpenAI Realtime data-channel event to a VoiceEvent.
   * Mirrors the switch in useRealtimeSession.handleServerEvent, minus the
   * harness-specific bookkeeping that now lives in the hook.
   */
  private handleServerEvent(msg: any): void {
    switch (msg.type) {
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
    // model to continue with a fresh response.create.
    this.dcSend({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: toolUseId,
        output: typeof output === 'string' ? output : JSON.stringify(output),
      },
    })
    this.dcSend({
      type: 'response.create',
      response: { modalities: ['text', 'audio'] },
    })
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

  async stop(): Promise<void> {
    if (this.stopped) return // idempotent
    this.stopped = true

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
