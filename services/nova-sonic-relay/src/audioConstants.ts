export const INPUT_SAMPLE_RATE = 16000   // browser → model
export const OUTPUT_SAMPLE_RATE = 24000  // model → browser
export const SAMPLE_SIZE_BITS = 16
export const CHANNELS = 1
export const MODEL_ID = process.env.NOVA_SONIC_MODEL_ID ?? 'amazon.nova-2-sonic-v1:0'
export const REGION = process.env.NOVA_SONIC_REGION ?? 'us-east-1'
export const DEFAULT_VOICE_ID = process.env.NOVA_SONIC_VOICE_ID ?? 'matthew'
