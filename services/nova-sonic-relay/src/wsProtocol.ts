// Relay-side copy of the browser↔relay protocol.
// MUST stay in sync with src/lib/voice/relayProtocol.ts in the Next.js app.

// Browser → relay
export type ClientMsg =
  | { t: 'start'; instructions: string; tools: unknown[]; voiceId?: string; interviewMode?: 'standard' | 'comprehensive'; turnEvidenceController?: boolean }
  | { t: 'audio'; pcm: string; audioSeq?: number }
  | { t: 'userTurnEnd' }
  | { t: 'toolResult'; toolUseId: string; output: string; segmentId?: number }
  | { t: 'systemText'; text: string }
  | { t: 'suppressOutput' }
  | { t: 'continuationCommit'; barrierId: string; checkpoint: VoiceContinuationCheckpoint }
  | { t: 'continuationDefer'; barrierId: string }
  | { t: 'stop' }

export interface VoiceContinuationHistoryEntry {
  seq: number
  role: 'assistant' | 'user'
  text: string
  timestamp: number
}

export interface VoiceContinuationCheckpoint {
  version: 1
  appSessionId: string
  fromSegmentId: number
  transcriptThroughSeq: number
  transcriptHash: string
  transcript: VoiceContinuationHistoryEntry[]
  exchangeCount: number
  patientTurnCount: number
  elapsedSeconds: number
  awaitingAnswerTo: { seq: number; text: string }
  answeredQuestionPairs: Array<{
    assistantSeq: number
    userSeqStart: number
    userSeqEnd: number
  }>
  coverage: unknown
  runtimeGuard: { softWrapIssued: boolean; terminalReason: string | null }
  safetyEscalated: boolean
  terminationReason: string | null
  administeredScaleIds: string[]
  activeScale: { scaleId: string; itemIndex: number } | null
  pendingTools: []
}

// Relay → browser
export type ServerMsg =
  | { t: 'userTranscript'; text: string; segmentId?: number }
  | { t: 'assistantTranscript'; text: string; segmentId?: number; obligationId?: string }
  | { t: 'assistantTextDelta'; text: string; segmentId?: number }
  | { t: 'audio'; pcm: string; segmentId?: number }
  | { t: 'aiSpeechStart'; segmentId?: number }
  | { t: 'aiSpeechStop'; segmentId?: number }
  | { t: 'bargeIn'; segmentId?: number }
  | { t: 'toolCall'; toolName: string; toolUseId: string; input: unknown; segmentId?: number }
  | { t: 'completion'; segmentId?: number }
  | { t: 'error'; message: string }
  | { t: 'sessionEnded'; reason: 'nova_stream_error' | 'nova_stream_ended' }
  | { t: 'medicalTranscript'; text: string; isPartial: boolean }
  | { t: 'continuationDue'; segmentId: number; deadlineAtMs: number }
  | { t: 'continuationBarrier'; barrierId: string; segmentId: number; lastAudioSeq: number; deadlineAtMs: number }
  | { t: 'continuationReady'; barrierId: string; fromSegmentId: number; segmentId: number; lastAudioSeq: number; transcriptThroughSeq: number }
  | { t: 'continuationRecovered'; barrierId: string; segmentId: number; lastAudioSeq: number; transcriptThroughSeq: number; reason: 'candidate_start_failed' }
  | { t: 'continuationFailed'; barrierId?: string; reason: 'disabled' | 'not_at_boundary' | 'pending_tool' | 'checkpoint_mismatch' | 'invalid_checkpoint' | 'stream_start_failed' | 'deadline' | 'buffer_overflow' | 'audio_sequence' | 'already_in_progress' }
