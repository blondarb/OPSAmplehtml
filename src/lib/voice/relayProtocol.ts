// Browser-side copy of the browser↔relay protocol.
// MUST stay in sync with services/nova-sonic-relay/src/wsProtocol.ts in the relay service.

// Browser → relay
export interface RelayStartConfig {
  instructions: string
  tools: unknown[]
  voiceId?: string
  sessionType: string
}

export type ClientMsg =
  | ({ t: 'start' } & RelayStartConfig)
  | { t: 'audio'; pcm: string }            // base64 PCM16 @16k
  | { t: 'userTurnEnd' }
  | { t: 'toolResult'; toolUseId: string; output: string }
  | { t: 'systemText'; text: string }
  | { t: 'stop' }

// Relay → browser
export type ServerMsg =
  | { t: 'userTranscript'; text: string }
  | { t: 'assistantTranscript'; text: string }
  | { t: 'assistantTextDelta'; text: string }
  | { t: 'audio'; pcm: string }            // base64 PCM16 @24k
  | { t: 'aiSpeechStart' }
  | { t: 'aiSpeechStop' }
  | { t: 'bargeIn' }
  | { t: 'toolCall'; toolName: string; toolUseId: string; input: unknown }
  | { t: 'completion' }
  | { t: 'error'; message: string }
