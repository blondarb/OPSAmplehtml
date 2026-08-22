/**
 * Application-owned continuation checkpoint for a Nova transport rollover.
 *
 * This module is deliberately pure and browser-safe. It neither persists nor
 * logs a checkpoint. Callers must validate the checkpoint before handing its
 * history to a new provider stream.
 */
import {
  COMPREHENSIVE_HISTORY_DOMAINS,
  type ComprehensiveHistoryDomain,
  type HistorianTerminationReason,
  type HistorianTranscriptEntry,
} from '@/lib/historianTypes'
/*
 * Do not add a model-derived checkpoint here. Live Nova evidence showed that
 * an auto-selected in-band checkpoint tool is not reliable within the fixed
 * transport handoff window. Continuation therefore carries a deliberately
 * conservative application ledger alongside the authoritative full replay.
 */
import type {
  HistorianRuntimeGuardSnapshot,
} from './runtimeGuard'

export const HISTORIAN_CONTINUATION_CHECKPOINT_VERSION = 1 as const
export const MAX_CONTINUATION_TRANSCRIPT_ENTRIES = 500
export const MAX_CONTINUATION_TRANSCRIPT_CHARS = 250_000
// Nova chat history is capped at 200KB and each text input at 50KB. Leave
// protocol headroom and fail before opening a replacement stream.
export const MAX_CONTINUATION_HISTORY_BYTES = 190_000
export const MAX_CONTINUATION_HISTORY_MESSAGE_BYTES = 45_000

const TERMINATION_REASONS = new Set<HistorianTerminationReason>([
  'coverage_complete', 'patient_requested_stop', 'safety_escalated', 'hard_stop',
  'manual_end', 'transport_lost', 'provider_error', 'unresponsive',
])
const GUARD_TERMINAL_REASONS = new Set<HistorianRuntimeGuardSnapshot['terminalReason']>([
  null, 'safety_escalated', 'patient_requested_stop', 'hard_stop',
])
const COVERAGE_DOMAINS = new Set<ComprehensiveHistoryDomain>(
  COMPREHENSIVE_HISTORY_DOMAINS.map(({ id }) => id),
)
export type ComprehensiveCoverageCheckpoint = {
  coveredDomains: []
  missingOrUncertain: Array<{
    domain: ComprehensiveHistoryDomain
    reason: 'unverified_after_rollover'
  }>
}

export type HistorianContinuationCheckpointV1 = {
  version: 1
  appSessionId: string
  fromSegmentId: number
  transcriptThroughSeq: number
  transcriptHash: string
  transcript: HistorianTranscriptEntry[]
  exchangeCount: number
  patientTurnCount: number
  elapsedSeconds: number
  awaitingAnswerTo: { seq: number; text: string }
  answeredQuestionPairs: Array<{
    assistantSeq: number
    userSeqStart: number
    userSeqEnd: number
  }>
  coverage: ComprehensiveCoverageCheckpoint
  runtimeGuard: HistorianRuntimeGuardSnapshot
  safetyEscalated: boolean
  terminationReason: HistorianTerminationReason | null
  administeredScaleIds: string[]
  activeScale: { scaleId: string; itemIndex: number } | null
  pendingTools: []
}

export type ContinuationHistoryEntry = {
  role: 'USER' | 'ASSISTANT'
  text: string
  interactive: false
}

export type HistorianContinuationPayload = {
  history: ContinuationHistoryEntry[]
  continuationInstruction: string
}

export type ContinuationCheckpointValidation =
  | { valid: true; checkpoint: HistorianContinuationCheckpointV1 }
  | { valid: false; issues: string[] }

/**
 * Conservative transport-only ledger. It makes no claim that a domain was
 * unasked: the full transcript may contain it. The replacement model must use
 * replay to avoid repetition, and this ledger must never satisfy final
 * Comprehensive coverage on its own.
 */
export function conservativeHistorianContinuationCoverage(): ComprehensiveCoverageCheckpoint {
  return {
    coveredDomains: [],
    missingOrUncertain: COMPREHENSIVE_HISTORY_DOMAINS.map(({ id }) => ({
      domain: id,
      reason: 'unverified_after_rollover' as const,
    })),
  }
}

/** Deterministic assistant-question to contiguous patient-answer ranges. */
export function buildHistorianAnsweredQuestionPairs(
  transcript: readonly HistorianTranscriptEntry[],
): HistorianContinuationCheckpointV1['answeredQuestionPairs'] {
  const pairs: HistorianContinuationCheckpointV1['answeredQuestionPairs'] = []
  let lastAssistantSeq: number | null = null
  for (let index = 0; index < transcript.length; index += 1) {
    const entry = transcript[index]
    if (entry.role === 'assistant') {
      lastAssistantSeq = entry.seq ?? null
      continue
    }
    if (lastAssistantSeq === null || transcript[index - 1]?.role !== 'assistant') continue
    let userEndIndex = index
    while (transcript[userEndIndex + 1]?.role === 'user') userEndIndex += 1
    pairs.push({
      assistantSeq: lastAssistantSeq,
      userSeqStart: entry.seq!,
      userSeqEnd: transcript[userEndIndex].seq!,
    })
    index = userEndIndex
  }
  return pairs
}

/**
 * Nova requires formal chat history to begin with USER and alternate roles.
 * Historian sessions begin with an assistant greeting, and ASR may split one
 * turn into adjacent same-role entries. Keep the full transcript in the
 * checkpoint, but normalize the provider-specific replay without inventing a
 * synthetic patient turn.
 */
export function buildNovaHistorianContinuationHistory(
  transcript: readonly HistorianTranscriptEntry[],
): ContinuationHistoryEntry[] {
  const firstUserIndex = transcript.findIndex((entry) => entry.role === 'user')
  if (firstUserIndex < 0) return []
  const history: ContinuationHistoryEntry[] = []
  for (const entry of transcript.slice(firstUserIndex)) {
    const role = entry.role === 'user' ? 'USER' : 'ASSISTANT'
    const previous = history.at(-1)
    if (previous?.role === role) previous.text = `${previous.text}\n${entry.text}`
    else history.push({ role, text: entry.text, interactive: false })
  }
  return history
}

/** A deterministic SHA-256 of the canonical transcript fields, not a secret. */
export function hashHistorianContinuationTranscript(
  transcript: readonly HistorianTranscriptEntry[],
): string {
  return sha256Hex(canonicalTranscript(transcript))
}

export function validateHistorianContinuationCheckpoint(
  candidate: unknown,
): ContinuationCheckpointValidation {
  const issues: string[] = []
  if (!isPlainObject(candidate)) return invalid(['checkpoint must be an object'])
  const value = candidate as Record<string, unknown>
  strictKeys(value, CHECKPOINT_KEYS, 'checkpoint', issues)

  if (value.version !== HISTORIAN_CONTINUATION_CHECKPOINT_VERSION) issues.push('unsupported checkpoint version')
  if (!nonEmptyString(value.appSessionId)) issues.push('app session id is missing')
  positiveInteger(value.fromSegmentId, 'from segment id', issues)
  positiveInteger(value.transcriptThroughSeq, 'transcript through sequence', issues)
  if (!isSha256(value.transcriptHash)) issues.push('transcript hash is invalid')
  nonNegativeInteger(value.exchangeCount, 'exchange count', issues)
  nonNegativeInteger(value.patientTurnCount, 'patient turn count', issues)
  nonNegativeFinite(value.elapsedSeconds, 'elapsed seconds', issues)
  validateTranscript(value.transcript, value.transcriptThroughSeq, issues)
  validateNovaHistory(value.transcript, issues)
  validateTranscriptCounters(
    value.transcript,
    value.exchangeCount,
    value.patientTurnCount,
    value.elapsedSeconds,
    issues,
  )
  validateAwaitingAnswer(value.awaitingAnswerTo, value.transcript, issues)
  validateAnsweredQuestionPairs(value.answeredQuestionPairs, value.transcript, issues)
  validateCoverage(value.coverage, issues)
  validateRuntimeGuard(value.runtimeGuard, issues)
  if (typeof value.safetyEscalated !== 'boolean') issues.push('safety latch is invalid')
  validateTermination(value.terminationReason, 'termination reason', issues)
  validateScaleIds(value.administeredScaleIds, issues)
  validateActiveScale(value.activeScale, issues)
  if (!Array.isArray(value.pendingTools) || value.pendingTools.length !== 0) issues.push('pending tools must be empty')

  if (Array.isArray(value.transcript) && value.transcript.every(isPlainObject) && isSha256(value.transcriptHash)) {
    const typed = value.transcript as unknown as HistorianTranscriptEntry[]
    if (hashHistorianContinuationTranscript(typed) !== value.transcriptHash) issues.push('transcript hash mismatch')
  }
  if (isPlainObject(value.runtimeGuard) && value.safetyEscalated === true && value.runtimeGuard.terminalReason !== 'safety_escalated') {
    issues.push('safety latch and runtime guard disagree')
  }
  if (value.terminationReason === 'safety_escalated' && value.safetyEscalated !== true) {
    issues.push('safety termination lacks safety latch')
  }
  if (isPlainObject(value.runtimeGuard) && value.runtimeGuard.terminalReason !== null && value.terminationReason !== value.runtimeGuard.terminalReason) {
    issues.push('termination reason and runtime guard disagree')
  }
  // A continuation checkpoint is only valid while the interview is active.
  // Terminal state must flow through the existing one-shot partial-save path,
  // never into a replacement model segment.
  if (
    value.safetyEscalated !== false ||
    value.terminationReason !== null ||
    (isPlainObject(value.runtimeGuard) && value.runtimeGuard.terminalReason !== null)
  ) {
    issues.push('terminal interview state cannot continue')
  }

  return issues.length === 0
    ? { valid: true, checkpoint: candidate as HistorianContinuationCheckpointV1 }
    : invalid(issues)
}

export function assertHistorianContinuationCheckpoint(
  candidate: unknown,
): HistorianContinuationCheckpointV1 {
  const result = validateHistorianContinuationCheckpoint(candidate)
  if (!result.valid) throw new Error(`Invalid Historian continuation checkpoint: ${result.issues.join('; ')}`)
  return result.checkpoint
}

/**
 * History is non-interactive: it reconstructs context but must not trigger a
 * model reply. The final assistant question has already been heard.
 */
export function serializeHistorianContinuation(
  candidate: unknown,
): HistorianContinuationPayload {
  const checkpoint = assertHistorianContinuationCheckpoint(candidate)
  const firstUserIndex = checkpoint.transcript.findIndex((entry) => entry.role === 'user')
  const openingAssistantContext = checkpoint.transcript
    .slice(0, firstUserIndex)
    .map((entry) => entry.text)
  return {
    history: buildNovaHistorianContinuationHistory(checkpoint.transcript),
    continuationInstruction:
      `This is a continuation of an existing interview. The opening assistant content was already spoken before Nova's USER-first formal history and must not be repeated: ${JSON.stringify(openingAssistantContext)}. The last assistant question was already heard by the patient. Do not repeat it, greet, summarize, or speak now. Wait silently for the patient to answer that question before continuing.`,
  }
}

const CHECKPOINT_KEYS = new Set([
  'version', 'appSessionId', 'fromSegmentId', 'transcriptThroughSeq', 'transcriptHash',
  'transcript', 'exchangeCount', 'patientTurnCount', 'elapsedSeconds', 'awaitingAnswerTo',
  'answeredQuestionPairs', 'coverage', 'runtimeGuard', 'safetyEscalated', 'terminationReason', 'administeredScaleIds',
  'activeScale', 'pendingTools',
])

function validateTranscript(value: unknown, throughSeq: unknown, issues: string[]): void {
  if (!Array.isArray(value) || value.length === 0) { issues.push('transcript is missing'); return }
  if (value.length > MAX_CONTINUATION_TRANSCRIPT_ENTRIES) issues.push('transcript has too many entries')
  let chars = 0
  let priorTimestamp = -1
  value.forEach((raw, index) => {
    if (!isPlainObject(raw)) { issues.push(`transcript entry ${index} is invalid`); return }
    strictKeys(raw, TRANSCRIPT_KEYS, `transcript entry ${index}`, issues)
    if (raw.role !== 'assistant' && raw.role !== 'user') issues.push(`transcript entry ${index} role is invalid`)
    if (!nonEmptyString(raw.text)) issues.push(`transcript entry ${index} text is invalid`)
    else chars += raw.text.length
    nonNegativeFinite(raw.timestamp, `transcript entry ${index} timestamp`, issues)
    if (typeof raw.timestamp === 'number' && raw.timestamp < priorTimestamp) {
      issues.push(`transcript timestamp regresses at index ${index}`)
    } else if (typeof raw.timestamp === 'number') {
      priorTimestamp = raw.timestamp
    }
    if (!Number.isInteger(raw.seq) || (raw.seq as number) !== index + 1) issues.push(`transcript sequence is not contiguous at index ${index}`)
  })
  if (chars > MAX_CONTINUATION_TRANSCRIPT_CHARS) issues.push('transcript exceeds character limit')
  const last = value[value.length - 1]
  if (!isPlainObject(last) || last.role !== 'assistant') issues.push('transcript must end in assistant')
  if (typeof throughSeq === 'number' && last && isPlainObject(last) && last.seq !== throughSeq) issues.push('transcript through sequence does not match transcript')
}

function validateNovaHistory(value: unknown, issues: string[]): void {
  if (!Array.isArray(value) || !value.every(isPlainObject)) return
  const transcript = value as unknown as HistorianTranscriptEntry[]
  const firstUserIndex = transcript.findIndex((entry) => entry.role === 'user')
  if (firstUserIndex < 0) {
    issues.push('transcript has no patient turn for Nova history')
    return
  }
  const openingBytes = utf8Bytes(
    transcript.slice(0, firstUserIndex).map((entry) => entry.text).join('\n'),
  )
  if (openingBytes > MAX_CONTINUATION_HISTORY_MESSAGE_BYTES) {
    issues.push('opening assistant context exceeds Nova text limit')
  }
  const history = buildNovaHistorianContinuationHistory(transcript)
  const totalBytes = history.reduce((total, entry) => total + utf8Bytes(entry.text), 0)
  if (totalBytes > MAX_CONTINUATION_HISTORY_BYTES) {
    issues.push('Nova continuation history exceeds byte limit')
  }
  if (history.some((entry) => utf8Bytes(entry.text) > MAX_CONTINUATION_HISTORY_MESSAGE_BYTES)) {
    issues.push('Nova continuation history message exceeds byte limit')
  }
  if (
    history.length === 0 ||
    history[0].role !== 'USER' ||
    history.at(-1)?.role !== 'ASSISTANT' ||
    history.some((entry, index) => index > 0 && entry.role === history[index - 1].role)
  ) issues.push('Nova continuation history roles are invalid')
}

function validateTranscriptCounters(
  transcript: unknown,
  exchangeCount: unknown,
  patientTurnCount: unknown,
  elapsedSeconds: unknown,
  issues: string[],
): void {
  if (!Array.isArray(transcript) || !transcript.every(isPlainObject)) return
  const expectedExchanges = transcript.reduce((count, entry, index) => (
    entry.role === 'assistant' && (index === 0 || transcript[index - 1].role === 'user')
      ? count + 1
      : count
  ), 0)
  const expectedPatientTurns = transcript.filter((entry) => entry.role === 'user').length
  if (exchangeCount !== expectedExchanges) issues.push('exchange count does not match transcript')
  if (patientTurnCount !== expectedPatientTurns) issues.push('patient turn count does not match transcript')
  const finalTimestamp = transcript.at(-1)?.timestamp
  if (
    typeof elapsedSeconds === 'number' &&
    typeof finalTimestamp === 'number' &&
    elapsedSeconds < finalTimestamp
  ) issues.push('elapsed seconds precede transcript')
}

function validateAwaitingAnswer(value: unknown, transcript: unknown, issues: string[]): void {
  if (!isPlainObject(value)) { issues.push('awaiting answer is invalid'); return }
  strictKeys(value, AWAITING_KEYS, 'awaiting answer', issues)
  if (!Number.isInteger(value.seq) || !nonEmptyString(value.text)) { issues.push('awaiting answer is invalid'); return }
  if (!Array.isArray(transcript) || transcript.length === 0) return
  const last = transcript[transcript.length - 1]
  if (!isPlainObject(last) || value.seq !== last.seq || value.text !== last.text) issues.push('awaiting answer does not match final assistant question')
}

function validateAnsweredQuestionPairs(value: unknown, transcript: unknown, issues: string[]): void {
  if (!Array.isArray(value)) { issues.push('answered question pairs are invalid'); return }
  value.forEach((raw, index) => {
    if (!isPlainObject(raw)) { issues.push(`answered question pair ${index} is invalid`); return }
    strictKeys(raw, ANSWERED_PAIR_KEYS, `answered question pair ${index}`, issues)
    if (
      !Number.isInteger(raw.assistantSeq) || (raw.assistantSeq as number) < 1 ||
      !Number.isInteger(raw.userSeqStart) || (raw.userSeqStart as number) < 1 ||
      !Number.isInteger(raw.userSeqEnd) || (raw.userSeqEnd as number) < 1
    ) issues.push(`answered question pair ${index} is invalid`)
  })
  if (!Array.isArray(transcript) || !transcript.every(isPlainObject)) return
  const expected = buildHistorianAnsweredQuestionPairs(
    transcript as unknown as HistorianTranscriptEntry[],
  )
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    issues.push('answered question pairs do not match transcript')
  }
}

function validateCoverage(value: unknown, issues: string[]): void {
  if (!isPlainObject(value)) { issues.push('coverage is invalid'); return }
  strictKeys(value, COVERAGE_KEYS, 'coverage', issues)
  const covered = value.coveredDomains
  const missing = value.missingOrUncertain
  if (!Array.isArray(covered) || !Array.isArray(missing)) { issues.push('coverage is invalid'); return }
  const domains = new Set<string>()
  if (covered.length !== 0) issues.push('continuation coverage cannot mark domains covered')
  missing.forEach((raw, index) => {
    if (!isPlainObject(raw)) { issues.push(`missing coverage ${index} is invalid`); return }
    strictKeys(raw, MISSING_KEYS, `missing coverage ${index}`, issues)
    if (typeof raw.domain !== 'string' || !COVERAGE_DOMAINS.has(raw.domain as ComprehensiveHistoryDomain) || domains.has(raw.domain)) issues.push(`missing coverage domain ${index} is invalid`)
    if (raw.reason !== 'unverified_after_rollover') issues.push(`missing coverage reason ${index} is invalid`)
    domains.add(raw.domain as string)
  })
  if (domains.size !== COVERAGE_DOMAINS.size) issues.push('coverage must classify every domain')
}

function validateRuntimeGuard(value: unknown, issues: string[]): void {
  if (!isPlainObject(value)) { issues.push('runtime guard is invalid'); return }
  strictKeys(value, RUNTIME_GUARD_KEYS, 'runtime guard', issues)
  if (typeof value.softWrapIssued !== 'boolean') issues.push('runtime guard soft wrap is invalid')
  if (!GUARD_TERMINAL_REASONS.has(value.terminalReason as HistorianRuntimeGuardSnapshot['terminalReason'])) issues.push('runtime guard terminal reason is invalid')
}

function validateTermination(value: unknown, label: string, issues: string[]): void {
  if (value !== null && (typeof value !== 'string' || !TERMINATION_REASONS.has(value as HistorianTerminationReason))) issues.push(`${label} is invalid`)
}

function validateScaleIds(value: unknown, issues: string[]): void {
  if (
    !Array.isArray(value) ||
    value.some((id) => !nonEmptyString(id)) ||
    new Set(value).size !== (Array.isArray(value) ? value.length : 0) ||
    (Array.isArray(value) && JSON.stringify(value) !== JSON.stringify([...value].sort()))
  ) issues.push('administered scale ids are invalid')
}

function validateActiveScale(value: unknown, issues: string[]): void {
  if (value === null) return
  if (!isPlainObject(value)) { issues.push('active scale is invalid'); return }
  strictKeys(value, ACTIVE_SCALE_KEYS, 'active scale', issues)
  if (!nonEmptyString(value.scaleId) || !Number.isInteger(value.itemIndex) || (value.itemIndex as number) < 0) issues.push('active scale is invalid')
}

function canonicalTranscript(transcript: readonly HistorianTranscriptEntry[]): string {
  return JSON.stringify(transcript.map(({ role, text, timestamp, seq }) => ({ role, text, timestamp, seq })))
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length
}

// Small synchronous SHA-256 implementation keeps this client-shared module
// deterministic in both browsers and Node without importing node:crypto.
function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input)
  const bitLength = bytes.length * 8
  const paddedLength = (((bytes.length + 9 + 63) >> 6) << 6)
  const data = new Uint8Array(paddedLength)
  data.set(bytes)
  data[bytes.length] = 0x80
  const view = new DataView(data.buffer)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false)
  view.setUint32(paddedLength - 4, bitLength >>> 0, false)
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const k = SHA256_K
  const w = new Uint32Array(64)
  for (let offset = 0; offset < data.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false)
    for (let i = 16; i < 64; i += 1) w[i] = (sigma1(w[i - 2]) + w[i - 7] + sigma0(w[i - 15]) + w[i - 16]) >>> 0
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i += 1) {
      const t1 = (hh + bigSigma1(e) + choose(e, f, g) + k[i] + w[i]) >>> 0
      const t2 = (bigSigma0(a) + majority(a, b, c)) >>> 0
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0
  }
  return Array.from(h, (word) => word.toString(16).padStart(8, '0')).join('')
}

const rotr = (value: number, amount: number) => (value >>> amount) | (value << (32 - amount))
const choose = (x: number, y: number, z: number) => (x & y) ^ (~x & z)
const majority = (x: number, y: number, z: number) => (x & y) ^ (x & z) ^ (y & z)
const bigSigma0 = (x: number) => rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22)
const bigSigma1 = (x: number) => rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25)
const sigma0 = (x: number) => rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)
const sigma1 = (x: number) => rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10)
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const TRANSCRIPT_KEYS = new Set(['role', 'text', 'timestamp', 'seq'])
const AWAITING_KEYS = new Set(['seq', 'text'])
const ANSWERED_PAIR_KEYS = new Set(['assistantSeq', 'userSeqStart', 'userSeqEnd'])
const COVERAGE_KEYS = new Set(['coveredDomains', 'missingOrUncertain'])
const MISSING_KEYS = new Set(['domain', 'reason'])
const RUNTIME_GUARD_KEYS = new Set(['softWrapIssued', 'terminalReason'])
const ACTIVE_SCALE_KEYS = new Set(['scaleId', 'itemIndex'])
function strictKeys(value: Record<string, unknown>, allowed: Set<string>, label: string, issues: string[]): void {
  Object.keys(value).forEach((key) => { if (!allowed.has(key)) issues.push(`${label} has unknown field`) })
}
function isPlainObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function nonEmptyString(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 }
function nonNegativeInteger(value: unknown, label: string, issues: string[]): boolean { if (!Number.isInteger(value) || (value as number) < 0) { issues.push(`${label} is invalid`); return false }; return true }
function positiveInteger(value: unknown, label: string, issues: string[]): boolean { if (!Number.isInteger(value) || (value as number) < 1) { issues.push(`${label} is invalid`); return false }; return true }
function nonNegativeFinite(value: unknown, label: string, issues: string[]): boolean { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) { issues.push(`${label} is invalid`); return false }; return true }
function isSha256(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) }
function invalid(issues: string[]): ContinuationCheckpointValidation { return { valid: false, issues } }
