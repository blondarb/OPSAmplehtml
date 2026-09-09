export const INPUT_SAMPLE_RATE = 16000   // browser → model
export const OUTPUT_SAMPLE_RATE = 24000  // model → browser
export const SAMPLE_SIZE_BITS = 16
export const CHANNELS = 1
export const MODEL_ID = process.env.NOVA_SONIC_MODEL_ID ?? 'amazon.nova-2-sonic-v1:0'
export const REGION = process.env.NOVA_SONIC_REGION ?? 'us-east-1'
export const DEFAULT_VOICE_ID = process.env.NOVA_SONIC_VOICE_ID ?? 'matthew'

/**
 * `durationMs` of digital silence as base64 LPCM at the browser→model input
 * format (16 kHz, 16-bit, mono) — byte-identical to what a muted or quiet
 * microphone sends. Used by NovaConnectionManager's keepalive to stand in for
 * client audio while none is arriving (see novaConnectionManager.ts).
 */
export function silencePcmBase64(durationMs: number): string {
  const bytes = Math.round((INPUT_SAMPLE_RATE * durationMs) / 1000) * (SAMPLE_SIZE_BITS / 8) * CHANNELS
  return Buffer.alloc(bytes).toString('base64')
}
