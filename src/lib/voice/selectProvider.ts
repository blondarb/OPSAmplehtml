/**
 * Provider selection + factory.
 *
 * The session route (`/api/ai/historian/session`, `/api/follow-up/realtime-
 * session`) is the SOURCE OF TRUTH for which provider kind was minted — it
 * resolves the server-side `VOICE_PROVIDER` env var (default `openai`) and
 * echoes back a `provider` field. `selectProvider` is only a client-side
 * fallback for the rare case that field is missing (e.g. an older cached
 * response shape); it defaults to `openai` so a misconfigured/absent field
 * NEVER silently engages Nova. `makeProvider` instantiates the matching
 * VoiceProvider.
 */

import type { VoiceProvider } from '@/lib/voice/providerTypes'
import { NovaSonicWsProvider } from '@/lib/voice/providers/novaSonicWsProvider'
import { OpenAiWebrtcProvider } from '@/lib/voice/providers/openaiWebrtcProvider'

export function selectProvider(override?: 'nova' | 'openai'): 'nova' | 'openai' {
  return override === 'nova' ? 'nova' : 'openai'
}

export function makeProvider(kind: 'nova' | 'openai'): VoiceProvider {
  return kind === 'openai' ? new OpenAiWebrtcProvider() : new NovaSonicWsProvider()
}
