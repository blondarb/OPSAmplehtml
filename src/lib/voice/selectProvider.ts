/**
 * Provider selection + factory.
 *
 * `selectProvider` resolves which provider kind to use from an explicit
 * override, else the NEXT_PUBLIC_VOICE_PROVIDER env var, else defaults to
 * Nova. `makeProvider` instantiates the matching VoiceProvider.
 */

import type { VoiceProvider } from '@/lib/voice/providerTypes'
import { NovaSonicWsProvider } from '@/lib/voice/providers/novaSonicWsProvider'
import { OpenAiWebrtcProvider } from '@/lib/voice/providers/openaiWebrtcProvider'

export function selectProvider(override?: 'nova' | 'openai'): 'nova' | 'openai' {
  const v =
    override ??
    (process.env.NEXT_PUBLIC_VOICE_PROVIDER as 'nova' | 'openai' | undefined) ??
    'nova'
  return v === 'openai' ? 'openai' : 'nova'
}

export function makeProvider(kind: 'nova' | 'openai'): VoiceProvider {
  return kind === 'openai' ? new OpenAiWebrtcProvider() : new NovaSonicWsProvider()
}
