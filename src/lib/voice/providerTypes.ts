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
  // ── Nova-only (ignored by OpenAI) ──
  /** WebSocket URL of the Nova Sonic relay. */
  relayUrl?: string
}

/**
 * The uniform transport contract both providers implement.
 */
export interface VoiceProvider {
  /** Open the session transport (WebRTC peer / WS) and begin streaming mic audio. */
  start(opts: VoiceStartOptions): Promise<void>
  /** Tear the session down. Idempotent. */
  stop(): Promise<void>
  /** Register the single event sink the provider emits VoiceEvents to. */
  on(cb: (e: VoiceEvent) => void): void
  /** Return a tool result for a prior `toolCall` (the hook executes the tool). */
  sendToolResult(toolUseId: string, output: unknown): void
  /** Inject advisory system text mid-session (localizer / scale guidance). */
  injectSystemText(text: string): void
  /** Force the model to produce a response now (e.g. to kick off scale administration).
   *  OpenAI → response.create; Nova → no-op (Nova self-triggers turns). */
  requestResponse(): void
}
