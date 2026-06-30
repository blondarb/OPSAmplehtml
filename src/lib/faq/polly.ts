/**
 * Neuro FAQ Voice — Amazon Polly TTS wrapper (production speech-out component).
 *
 * POC SKELETON. Installed 2026-06-29 (@aws-sdk/client-polly@^3.1010.0).
 * Polly is on the AWS HIPAA-eligible services list and covered by Sevaro's AWS BAA.
 * (Install needed npm@10 — npm 11.8/node25 arborist bug on this repo's `file:`
 * workspace dep blocks incremental adds.)
 *
 * Credentials/region resolve via the same default provider chain the rest of the
 * AWS SDK uses in this repo (see src/lib/bedrock.ts getClient()). In prod the
 * SSR Lambda's compute role provides creds; locally, AWS_PROFILE=sevaro-sandbox.
 */

import { PollyClient, SynthesizeSpeechCommand, type VoiceId, type Engine } from '@aws-sdk/client-polly'

// Polly's region is decoupled from the app's us-east-2 because us-east-2 (Ohio)
// has NO neural/generative Polly voices (verified via describe-voices, 2026-06-29).
// us-east-1 has the full set incl. the GENERATIVE engine and is equally
// HIPAA-eligible. Override with FAQ_POLLY_REGION.
const REGION = process.env.FAQ_POLLY_REGION || 'us-east-1'
// Generative is Amazon's most natural/conversational tier (a step above neural).
// Matthew-generative is the default (Steve's pick 2026-06-30); both overridable.
// Matthew/Ruth/Joanna/Danielle all support generative in us-east-1.
const VOICE_ID = process.env.FAQ_POLLY_VOICE_ID || 'Matthew'
const ENGINE = (process.env.FAQ_POLLY_ENGINE || 'generative') as Engine

let _client: PollyClient | null = null
function getClient(): PollyClient {
  if (!_client) _client = new PollyClient({ region: REGION })
  return _client
}

/**
 * Synthesize spoken audio for an answer. Returns mp3 bytes.
 * Throws on AWS/credential errors — callers treat TTS as optional.
 */
export async function synthesizeSpeech(text: string): Promise<Uint8Array> {
  const res = await getClient().send(
    new SynthesizeSpeechCommand({
      Text: text,
      OutputFormat: 'mp3',
      VoiceId: VOICE_ID as VoiceId,
      Engine: ENGINE,
    }),
  )
  const stream = res.AudioStream as { transformToByteArray: () => Promise<Uint8Array> } | undefined
  if (!stream) throw new Error('Polly returned no audio stream')
  return await stream.transformToByteArray()
}
