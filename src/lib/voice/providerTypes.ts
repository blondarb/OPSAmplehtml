/**
 * VoiceProvider abstraction (Nova 2 Sonic voice migration).
 *
 * NOTE: lives in `providerTypes.ts` (not `types.ts`) because `src/lib/voice/
 * types.ts` is the pre-existing SDNE speech-biomarker types module. These two
 * unrelated concerns collided on filename when the voice-provider work was
 * revived onto a newer main; keeping them separate avoids breaking the ~10
 * SDNE importers of `@/lib/voice/types`.
 *
 * Defines a single uniform interface that lets the historian + follow-up
 * hooks drive EITHER OpenAI Realtime (WebRTC) OR Nova Sonic (WS relay) behind
 * one contract. All clinical harness logic (red flags, localizer, scales,
 * safety) stays in the hooks — providers only own the TRANSPORT and the
 * normalized event mapping.
 *
 * Providers surface tool calls via the `toolCall` VoiceEvent and accept tool
 * results via `sendToolResult` — they do NOT execute tool logic themselves.
 */

/**
 * Normalized, provider-agnostic event stream emitted to the hook.
 *
 * Both providers map their native event vocabulary (OpenAI Realtime data-
 * channel events / Nova relay ServerMsg) onto this single shape, so the hooks
 * never branch on which provider is active.
 */
export type VoiceEvent =
  | { type: 'userTranscript'; text: string }
  | { type: 'assistantTranscript'; text: string }
  | { type: 'assistantTextDelta'; text: string }
  // NOTE: userSpeechStart/userSpeechStop are currently emitted ONLY by the
  // OpenAI provider (from input_audio_buffer.speech_started/stopped). The Nova
  // relay does not yet forward user-speech VAD boundaries, so under Nova these
  // never fire. Hooks must treat them as best-effort (e.g. a "mic active"
  // indicator), not as a required signal. Add relay frames later if needed.
  | { type: 'userSpeechStart' }
  | { type: 'userSpeechStop' }
  | { type: 'aiSpeechStart' }
  | { type: 'aiSpeechStop' }
  | { type: 'toolCall'; toolName: string; toolUseId: string; input: unknown }
  | { type: 'error'; message: string }
  // Transport dropped unexpectedly (WebRTC connection failed/closed, data
  // channel closed, WS closed non-cleanly) — distinct from `error`, which is
  // an in-session protocol-level error the session can survive. `disconnected`
  // means the transport is gone; the hook uses it to run the SAME graceful
  // end-of-session flow as a manual "End Interview" click (flush
  // save_interview_output, fall back to a raw-transcript narrative, tear down,
  // fire onComplete). Never emitted as a result of the provider's own stop().
  | { type: 'disconnected'; reason: string }

/**
 * Options passed to `start`. Some fields are provider-specific; each provider
 * ignores the fields it does not need (documented inline).
 */
export interface VoiceStartOptions {
  /** System prompt / instructions for the session. */
  instructions: string
  /** Provider-native tool specs (built by the route/hook for the active provider). */
  tools: unknown[]
  /** Optional voice selection (provider-specific voice id). */
  voiceId?: string
  // ── OpenAI-only (ignored by Nova) ──
  /** Ephemeral bearer key for the OpenAI Realtime SDP exchange. */
  ephemeralKey?: string
  /** Realtime model id (defaults to gpt-realtime-2 in the OpenAI provider). */
  model?: string
  /**
   * Unix seconds when `ephemeralKey` expires. When present, the OpenAI
   * provider self-schedules a token renewal ~90s before expiry (via
   * POST /api/ai/historian/session-renew) so long sessions survive past the
   * ephemeral token's short TTL without tearing down the WebRTC connection.
   * Omit to disable renewal (e.g. tests, or providers/routes that don't
   * return an expiry).
   */
  expiresAt?: number
  /**
   * Historian session type ('new_patient' | 'follow_up'), forwarded to
   * session-renew so it can rebuild matching instructions. OpenAI-only.
   */
  sessionType?: string
  // ── Nova-only (ignored by OpenAI) ──
  /** WebSocket URL of the Nova Sonic relay. */
  relayUrl?: string
  /**
   * Short-lived HMAC auth token for the Nova Sonic relay's WebSocket
   * upgrade, minted by the session route (see mintNovaRelayToken in
   * src/app/api/ai/historian/session/route.ts). The provider sends it as a
   * WS subprotocol (browsers cannot set custom headers on a WS handshake) —
   * see novaSonicWsProvider.ts. Undefined when NOVA_RELAY_SHARED_SECRET is
   * unset server-side; the relay then fail-closed-rejects the connection.
   */
  relayToken?: string
}

/**
 * The uniform transport contract both providers implement.
 */
export interface VoiceProvider {
  /** Open the session transport (WebRTC peer / WS) and begin streaming mic audio. */
  start(opts: VoiceStartOptions): Promise<void>
  /** Tear the session down. Idempotent. */
  stop(): Promise<void>
  /**
   * Whether the transport is currently open/live (WebRTC data channel open /
   * WS OPEN). The hook gates its pre-teardown save-flush on this: a dropped
   * transport must SKIP the flush (it can never reach the model) and fall
   * straight through to the raw-transcript fallback, matching main's original
   * `dcRef.readyState === 'open'` check. Without it, ending via a transport
   * drop stalls ~4s waiting on output that will never arrive.
   */
  isOpen(): boolean
  /** Register the single event sink the provider emits VoiceEvents to. */
  on(cb: (e: VoiceEvent) => void): void
  /** Return a tool result for a prior `toolCall` (the hook executes the tool). */
  sendToolResult(toolUseId: string, output: unknown): void
  /** Inject advisory system text mid-session (localizer / scale guidance). */
  injectSystemText(text: string): void
  /**
   * Force the model to produce a response now (e.g. to kick off scale
   * administration, or to flush a save before ending early).
   * OpenAI → response.create; Nova → no-op (Nova self-triggers turns).
   *
   * `opts.textOnly` restricts the forced response to text (no audio) — used
   * by the end-of-interview flush prompt so the AI doesn't start speaking a
   * full reply right before the transport tears down. Ignored by Nova.
   */
  requestResponse(opts?: { textOnly?: boolean }): void
  /**
   * Prompt the model to speak its single closing message after
   * save_interview_output has been acked. Providers differ on whether this is
   * needed at all:
   *   OpenAI → no-op. `sendToolResult` already issues a follow-up
   *            response.create, so Henry speaks his closing on its own; a
   *            second trigger here would double-speak.
   *   Nova   → inject a closing nudge. Nova is speech-to-speech and, exactly
   *            like the session-open greeting, stays SILENT after the tool
   *            result unless explicitly prompted — which is why the closing
   *            statement was missing entirely (not just clipped). Mirrors
   *            `sendGreetingKickoff` on the relay side.
   */
  nudgeClosing(): void
  /**
   * OpenAI-only escape hatch: overwrite the live session's full instructions
   * (session.update) rather than append an advisory item to the timeline.
   * Used by the Localizer push channel to re-serialize BASE_PROMPT + the
   * latest delta so only one delta stays active (no timeline pollution from
   * accumulating advisory messages). Nova has no equivalent primitive — its
   * provider leaves this undefined; callers fall back to `injectSystemText`.
   */
  updateInstructions?(fullText: string): void
}
