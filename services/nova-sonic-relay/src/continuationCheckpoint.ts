import crypto from 'crypto'
import type { VoiceContinuationCheckpoint } from './wsProtocol.js'

const MAX_ENTRIES = 500
const MAX_CHARS = 250_000
const MAX_HISTORY_BYTES = 190_000
const MAX_HISTORY_MESSAGE_BYTES = 45_000
const DOMAINS = new Set([
  'referral_reason', 'patient_reported_age', 'presenting_symptom', 'associated_symptoms',
  'red_flags', 'prior_episodes', 'functional_impact', 'neurologic_review_of_systems',
  'past_medical_history', 'past_surgical_history', 'medications',
  'medication_adherence_side_effects', 'allergies', 'family_neurologic_history',
  'social_exposure_history', 'prior_studies', 'patient_goals_questions',
])
const CHECKPOINT_KEYS = new Set([
  'version', 'appSessionId', 'fromSegmentId', 'transcriptThroughSeq', 'transcriptHash',
  'transcript', 'exchangeCount', 'patientTurnCount', 'elapsedSeconds', 'awaitingAnswerTo',
  'answeredQuestionPairs', 'coverage', 'runtimeGuard', 'safetyEscalated', 'terminationReason',
  'administeredScaleIds', 'activeScale', 'pendingTools',
])
const TRANSCRIPT_KEYS = new Set(['seq', 'role', 'text', 'timestamp'])
const AWAITING_KEYS = new Set(['seq', 'text'])
const ANSWERED_PAIR_KEYS = new Set(['assistantSeq', 'userSeqStart', 'userSeqEnd'])
const COVERAGE_KEYS = new Set(['coveredDomains', 'missingOrUncertain'])
const MISSING_KEYS = new Set(['domain', 'reason'])
const RUNTIME_GUARD_KEYS = new Set(['softWrapIssued', 'terminalReason'])
const ACTIVE_SCALE_KEYS = new Set(['scaleId', 'itemIndex'])

export type ContinuationCheckpointResult =
  | { ok: true; checkpoint: VoiceContinuationCheckpoint }
  | { ok: false; reason: 'invalid_checkpoint' | 'checkpoint_mismatch' }

/**
 * Relay-side structural/integrity gate. It intentionally returns only a
 * closed reason code and never logs or echoes transcript content.
 */
export function validateContinuationCheckpoint(
  candidate: unknown,
  expected: { segmentId: number; previous?: VoiceContinuationCheckpoint | null },
): ContinuationCheckpointResult {
  if (!isObject(candidate)) return { ok: false, reason: 'invalid_checkpoint' }
  const value = candidate as unknown as VoiceContinuationCheckpoint
  if (
    !exactKeys(candidate, CHECKPOINT_KEYS) ||
    value.version !== 1 ||
    !nonEmpty(value.appSessionId) ||
    value.fromSegmentId !== expected.segmentId ||
    !Number.isInteger(value.exchangeCount) || value.exchangeCount < 0 ||
    !Number.isInteger(value.patientTurnCount) || value.patientTurnCount < 0 ||
    typeof value.elapsedSeconds !== 'number' || !Number.isFinite(value.elapsedSeconds) || value.elapsedSeconds < 0 ||
    value.safetyEscalated !== false ||
    value.terminationReason !== null ||
    value.runtimeGuard?.terminalReason !== null ||
    typeof value.runtimeGuard?.softWrapIssued !== 'boolean' ||
    !exactKeys(value.runtimeGuard, RUNTIME_GUARD_KEYS) ||
    !Array.isArray(value.pendingTools) || value.pendingTools.length !== 0 ||
    !Array.isArray(value.administeredScaleIds) ||
    value.administeredScaleIds.some((id) => !nonEmpty(id)) ||
    new Set(value.administeredScaleIds).size !== value.administeredScaleIds.length ||
    JSON.stringify(value.administeredScaleIds) !== JSON.stringify([...value.administeredScaleIds].sort()) ||
    !validActiveScale(value.activeScale)
  ) {
    return { ok: false, reason: 'invalid_checkpoint' }
  }

  if (!Array.isArray(value.transcript) || value.transcript.length === 0 || value.transcript.length > MAX_ENTRIES) {
    return { ok: false, reason: 'invalid_checkpoint' }
  }
  let chars = 0
  let priorTimestamp = -1
  for (let index = 0; index < value.transcript.length; index += 1) {
    const entry = value.transcript[index]
    if (
      !entry ||
      !exactKeys(entry, TRANSCRIPT_KEYS) ||
      (entry.role !== 'assistant' && entry.role !== 'user') ||
      !nonEmpty(entry.text) ||
      !Number.isFinite(entry.timestamp) || entry.timestamp < 0 ||
      entry.timestamp < priorTimestamp ||
      entry.seq !== index + 1
    ) return { ok: false, reason: 'invalid_checkpoint' }
    priorTimestamp = entry.timestamp
    chars += entry.text.length
  }
  if (chars > MAX_CHARS) return { ok: false, reason: 'invalid_checkpoint' }
  if (!validNovaHistory(value.transcript)) return { ok: false, reason: 'invalid_checkpoint' }

  const last = value.transcript[value.transcript.length - 1]
  if (
    !exactKeys(value.awaitingAnswerTo, AWAITING_KEYS) ||
    last.role !== 'assistant' ||
    last.seq !== value.transcriptThroughSeq ||
    value.awaitingAnswerTo?.seq !== last.seq ||
    value.awaitingAnswerTo?.text !== last.text
  ) return { ok: false, reason: 'checkpoint_mismatch' }

  const canonical = canonicalTranscript(value.transcript)
  const digest = crypto.createHash('sha256').update(canonical).digest('hex')
  if (digest !== value.transcriptHash) return { ok: false, reason: 'checkpoint_mismatch' }
  const exchangeCount = value.transcript.reduce((count, entry, index) => (
    entry.role === 'assistant' && (index === 0 || value.transcript[index - 1].role === 'user')
      ? count + 1
      : count
  ), 0)
  const patientTurnCount = value.transcript.filter((entry) => entry.role === 'user').length
  if (
    value.exchangeCount !== exchangeCount ||
    value.patientTurnCount !== patientTurnCount ||
    value.elapsedSeconds < last.timestamp
  ) return { ok: false, reason: 'checkpoint_mismatch' }
  if (!validAnsweredQuestionPairs(value.answeredQuestionPairs, value.transcript)) {
    return { ok: false, reason: 'checkpoint_mismatch' }
  }
  if (!validCoverage(value.coverage)) return { ok: false, reason: 'invalid_checkpoint' }
  if (expected.previous && !validContinuationFromPrevious(value, expected.previous)) {
    return { ok: false, reason: 'checkpoint_mismatch' }
  }

  return { ok: true, checkpoint: value }
}

export function buildContinuationInstructions(
  baseInstructions: string,
  checkpoint: VoiceContinuationCheckpoint,
): string {
  const state = {
    exchangeCount: checkpoint.exchangeCount,
    patientTurnCount: checkpoint.patientTurnCount,
    answeredQuestionPairs: checkpoint.answeredQuestionPairs,
    coverage: checkpoint.coverage,
    softWrapIssued: checkpoint.runtimeGuard.softWrapIssued,
    administeredScaleIds: checkpoint.administeredScaleIds,
    activeScale: checkpoint.activeScale,
    openingAssistantContext: leadingAssistantContext(checkpoint.transcript),
  }
  return `${baseInstructions}\n\n[APPLICATION-OWNED TRANSPORT CONTINUATION V1]\nThis is the same interview, not a new interview. The replayed conversation history below is authoritative through transcript sequence ${checkpoint.transcriptThroughSeq}. Inspect prior assistant questions and patient answers before asking anything; do not repeat a prior question merely because the conservative ledger says unverified_after_rollover. That status does not mean not_asked and can never establish final coverage or completion. The last assistant question was already heard by the patient. Do not repeat it, greet, summarize, or speak now. Wait silently for the patient to answer that question. Preserve counters, guard, and scale state exactly; do not invent covered history.\nState: ${JSON.stringify(state)}\n[END TRANSPORT CONTINUATION]`
}

export function continuationHistory(checkpoint: VoiceContinuationCheckpoint): Array<{ role: 'USER' | 'ASSISTANT'; text: string }> {
  const firstUserIndex = checkpoint.transcript.findIndex((entry) => entry.role === 'user')
  if (firstUserIndex < 0) return []
  const history: Array<{ role: 'USER' | 'ASSISTANT'; text: string }> = []
  for (const entry of checkpoint.transcript.slice(firstUserIndex)) {
    const role = entry.role === 'user' ? 'USER' : 'ASSISTANT'
    const prior = history.at(-1)
    if (prior?.role === role) prior.text = `${prior.text}\n${entry.text}`
    else history.push({ role, text: entry.text })
  }
  return history
}

function leadingAssistantContext(transcript: VoiceContinuationCheckpoint['transcript']): string[] {
  const firstUserIndex = transcript.findIndex((entry) => entry.role === 'user')
  return transcript.slice(0, firstUserIndex).map((entry) => entry.text)
}

function validNovaHistory(transcript: VoiceContinuationCheckpoint['transcript']): boolean {
  const firstUserIndex = transcript.findIndex((entry) => entry.role === 'user')
  if (firstUserIndex < 0) return false
  if (Buffer.byteLength(leadingAssistantContext(transcript).join('\n'), 'utf8') > MAX_HISTORY_MESSAGE_BYTES) return false
  const history = continuationHistory({ transcript } as VoiceContinuationCheckpoint)
  if (
    history.length === 0 ||
    history[0].role !== 'USER' ||
    history.at(-1)?.role !== 'ASSISTANT'
  ) return false
  let totalBytes = 0
  for (let index = 0; index < history.length; index += 1) {
    if (index > 0 && history[index].role === history[index - 1].role) return false
    const bytes = Buffer.byteLength(history[index].text, 'utf8')
    if (bytes > MAX_HISTORY_MESSAGE_BYTES) return false
    totalBytes += bytes
  }
  return totalBytes <= MAX_HISTORY_BYTES
}

function validCoverage(value: unknown): boolean {
  if (!isObject(value) || !exactKeys(value, COVERAGE_KEYS)) return false
  const covered = value.coveredDomains
  const missing = value.missingOrUncertain
  if (!Array.isArray(covered) || !Array.isArray(missing)) return false
  if (covered.length !== 0) return false
  const seen = new Set<string>()
  for (const item of missing) {
    if (!isObject(item) || !exactKeys(item, MISSING_KEYS) || typeof item.domain !== 'string' || !DOMAINS.has(item.domain) || seen.has(item.domain)) return false
    if (item.reason !== 'unverified_after_rollover') return false
    seen.add(item.domain)
  }
  return seen.size === DOMAINS.size
}

function validAnsweredQuestionPairs(
  value: unknown,
  transcript: VoiceContinuationCheckpoint['transcript'],
): boolean {
  if (!Array.isArray(value)) return false
  const expected: VoiceContinuationCheckpoint['answeredQuestionPairs'] = []
  let lastAssistantSeq: number | null = null
  for (let index = 0; index < transcript.length; index += 1) {
    const entry = transcript[index]
    if (entry.role === 'assistant') {
      lastAssistantSeq = entry.seq
      continue
    }
    if (lastAssistantSeq === null || transcript[index - 1]?.role !== 'assistant') continue
    let userEndIndex = index
    while (transcript[userEndIndex + 1]?.role === 'user') userEndIndex += 1
    expected.push({
      assistantSeq: lastAssistantSeq,
      userSeqStart: entry.seq,
      userSeqEnd: transcript[userEndIndex].seq,
    })
    index = userEndIndex
  }
  return value.every((item) => isObject(item) && exactKeys(item, ANSWERED_PAIR_KEYS)) &&
    JSON.stringify(value) === JSON.stringify(expected)
}

function validContinuationFromPrevious(
  current: VoiceContinuationCheckpoint,
  previous: VoiceContinuationCheckpoint,
): boolean {
  if (
    current.appSessionId !== previous.appSessionId ||
    current.fromSegmentId !== previous.fromSegmentId + 1 ||
    current.transcriptThroughSeq <= previous.transcriptThroughSeq ||
    current.exchangeCount < previous.exchangeCount ||
    current.patientTurnCount < previous.patientTurnCount ||
    current.elapsedSeconds < previous.elapsedSeconds ||
    (previous.runtimeGuard.softWrapIssued && !current.runtimeGuard.softWrapIssued)
  ) return false
  const priorTranscript = canonicalTranscript(previous.transcript)
  const currentPrefix = canonicalTranscript(current.transcript.slice(0, previous.transcript.length))
  if (currentPrefix !== priorTranscript) return false
  if (!current.answeredQuestionPairs.some((pair) => (
    pair.assistantSeq === previous.awaitingAnswerTo.seq &&
    pair.userSeqStart > previous.awaitingAnswerTo.seq
  ))) return false
  const currentScales = new Set(current.administeredScaleIds)
  if (!previous.administeredScaleIds.every((id) => currentScales.has(id))) return false
  if (previous.activeScale) {
    if (current.activeScale?.scaleId === previous.activeScale.scaleId) {
      return current.activeScale.itemIndex >= previous.activeScale.itemIndex
    }
    return currentScales.has(previous.activeScale.scaleId)
  }
  return true
}

function canonicalTranscript(
  transcript: VoiceContinuationCheckpoint['transcript'],
): string {
  return JSON.stringify(transcript.map(({ role, text, timestamp, seq }) => ({ role, text, timestamp, seq })))
}

function validActiveScale(value: unknown): boolean {
  return value === null || (
    isObject(value) &&
    exactKeys(value, ACTIVE_SCALE_KEYS) &&
    nonEmpty(value.scaleId) &&
    Number.isInteger(value.itemIndex) &&
    (value.itemIndex as number) >= 0
  )
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: unknown, expected: Set<string>): boolean {
  return isObject(value) &&
    Object.keys(value).length === expected.size &&
    Object.keys(value).every((key) => expected.has(key))
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
