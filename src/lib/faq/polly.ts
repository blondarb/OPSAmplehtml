/**
 * Neuro FAQ Voice — Amazon Polly TTS wrapper (production speech-out component).
 *
 * POC SKELETON — NET-NEW dependency, not yet installed.
 * Polly is on the AWS HIPAA-eligible services list and covered by Sevaro's AWS BAA.
 *
 * INSTALL IS CURRENTLY BLOCKED by an npm 11.8.0 / node 25 arborist bug
 * ("Cannot read properties of null (reading 'matches')") triggered by this
 * repo's `file:./packages/feedback` workspace dep during incremental dedupe.
 * Every `npm install <pkg>` flavor hits it. Fix (one of):
 *   (a) clean rebuild:  rm -rf node_modules package-lock.json && npm install \
 *                       && npm install @aws-sdk/client-polly@3.1010.0
 *   (b) downgrade npm:  npm i -g npm@10  (then the normal install works)
 * Then uncomment the import + implementation below.
 * Until installed, synthesizeSpeech() throws and the client treats TTS as
 * optional (text answer still renders) — graceful degradation, nothing breaks.
 *
 * Credentials/region resolve via the same default provider chain the rest of the
 * AWS SDK uses in this repo (see src/lib/bedrock.ts getClient()). In prod the
 * SSR Lambda's compute role provides creds; locally, AWS_PROFILE=sevaro-sandbox.
 */

// NOTE: import is commented until the dependency is installed, so the rest of
// the skeleton typechecks without it. Uncomment after `npm install @aws-sdk/client-polly`.
// import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly'

const REGION = process.env.AWS_REGION || 'us-east-2'
const VOICE_ID = process.env.FAQ_POLLY_VOICE_ID || 'Joanna' // neural voice
const ENGINE = 'neural'

/**
 * Synthesize spoken audio for an answer. Returns mp3 bytes.
 * Throws if the Polly SDK is not installed/configured.
 */
export async function synthesizeSpeech(text: string): Promise<Uint8Array> {
  // --- Implementation (enable after installing @aws-sdk/client-polly) ---
  //
  // const client = new PollyClient({ region: REGION })
  // const res = await client.send(
  //   new SynthesizeSpeechCommand({
  //     Text: text,
  //     OutputFormat: 'mp3',
  //     VoiceId: VOICE_ID,
  //     Engine: ENGINE,
  //   }),
  // )
  // const stream = res.AudioStream as { transformToByteArray: () => Promise<Uint8Array> }
  // return await stream.transformToByteArray()

  void REGION; void VOICE_ID; void ENGINE; void text
  throw new Error(
    'Polly not installed. Run `npm install @aws-sdk/client-polly` and uncomment synthesizeSpeech() in src/lib/faq/polly.ts',
  )
}
