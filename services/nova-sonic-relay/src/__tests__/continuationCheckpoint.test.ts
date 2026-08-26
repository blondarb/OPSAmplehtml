import crypto from 'crypto'
import { describe, expect, it } from 'vitest'
import {
  MAX_HISTORY_BYTES,
  MAX_HISTORY_MESSAGE_BYTES,
  buildContinuationInstructions,
  continuationHistory,
  validateContinuationCheckpoint,
} from '../continuationCheckpoint.js'

const DOMAINS = [
  'referral_reason', 'patient_reported_age', 'presenting_symptom', 'associated_symptoms',
  'red_flags', 'prior_episodes', 'functional_impact', 'neurologic_review_of_systems',
  'past_medical_history', 'past_surgical_history', 'medications',
  'medication_adherence_side_effects', 'allergies', 'family_neurologic_history',
  'social_exposure_history', 'prior_studies', 'patient_goals_questions',
]

function fixture() {
  const transcript = [
    { seq: 1, role: 'assistant' as const, text: 'Why were you referred?', timestamp: 0 },
    { seq: 2, role: 'user' as const, text: 'Synthetic headache fixture.', timestamp: 4 },
    { seq: 3, role: 'assistant' as const, text: 'How old are you?', timestamp: 6 },
  ]
  const canonical = JSON.stringify(transcript.map(({ role, text, timestamp, seq }) => ({ role, text, timestamp, seq })))
  return {
    version: 1 as const,
    appSessionId: 'synthetic-session',
    fromSegmentId: 1,
    transcriptThroughSeq: 3,
    transcriptHash: crypto.createHash('sha256').update(canonical).digest('hex'),
    transcript,
    exchangeCount: 2,
    patientTurnCount: 1,
    elapsedSeconds: 245,
    awaitingAnswerTo: { seq: 3, text: 'How old are you?' },
    answeredQuestionPairs: [{ assistantSeq: 1, userSeqStart: 2, userSeqEnd: 2 }],
    coverage: {
      coveredDomains: [],
      missingOrUncertain: DOMAINS.map((domain) => ({
        domain,
        reason: 'unverified_after_rollover',
      })),
    },
    runtimeGuard: { softWrapIssued: false, terminalReason: null },
    safetyEscalated: false,
    terminationReason: null,
    administeredScaleIds: [],
    activeScale: null,
    pendingTools: [] as [],
  }
}

function exactAsciiText(label: string, bytes: number, suffix = ''): string {
  const unit = `${label} synthetic neutral history. `
  const bodyBytes = bytes - Buffer.byteLength(suffix)
  if (bodyBytes < 1) throw new Error('Synthetic history target is too small')
  return unit.repeat(Math.ceil(bodyBytes / unit.length)).slice(0, bodyBytes) + suffix
}

function maximumHistoryTranscript(extraFinalByte = false) {
  return [
    { seq: 1, role: 'assistant' as const, text: 'Synthetic opening?', timestamp: 0 },
    { seq: 2, role: 'user' as const, text: exactAsciiText('U1', 45_000), timestamp: 1 },
    { seq: 3, role: 'assistant' as const, text: exactAsciiText('A1', 45_000), timestamp: 2 },
    { seq: 4, role: 'user' as const, text: exactAsciiText('U2', 45_000), timestamp: 3 },
    { seq: 5, role: 'assistant' as const, text: exactAsciiText('A2', 45_000), timestamp: 4 },
    { seq: 6, role: 'user' as const, text: exactAsciiText('U3', 5_000), timestamp: 5 },
    { seq: 7, role: 'assistant' as const, text: exactAsciiText('A3', 5_000 + Number(extraFinalByte), '?'), timestamp: 6 },
  ]
}

function fixtureWithTranscript(transcript: ReturnType<typeof maximumHistoryTranscript>) {
  const checkpoint = fixture()
  const last = transcript.at(-1)!
  checkpoint.transcript = transcript
  checkpoint.transcriptThroughSeq = last.seq
  checkpoint.awaitingAnswerTo = { seq: last.seq, text: last.text }
  checkpoint.exchangeCount = transcript.reduce((count, entry, index) => (
    entry.role === 'assistant' && (index === 0 || transcript[index - 1].role === 'user')
      ? count + 1
      : count
  ), 0)
  checkpoint.patientTurnCount = transcript.filter((entry) => entry.role === 'user').length
  checkpoint.elapsedSeconds = last.timestamp
  checkpoint.answeredQuestionPairs = transcript.flatMap((entry, index) => {
    if (entry.role !== 'user' || transcript[index - 1]?.role !== 'assistant') return []
    return [{ assistantSeq: transcript[index - 1].seq, userSeqStart: entry.seq, userSeqEnd: entry.seq }]
  })
  checkpoint.transcriptHash = crypto.createHash('sha256').update(JSON.stringify(
    transcript.map(({ role, text, timestamp, seq }) => ({ role, text, timestamp, seq })),
  )).digest('hex')
  return checkpoint
}

describe('relay continuation checkpoint', () => {
  it('binds a complete ledger and transcript digest to the active segment', () => {
    const checkpoint = fixture()
    expect(validateContinuationCheckpoint(checkpoint, { segmentId: 1 })).toEqual({
      ok: true,
      checkpoint,
    })
  })

  it('rejects a transcript mutation and an incomplete coverage ledger', () => {
    const changed = fixture()
    changed.transcript[1].text = 'changed'
    expect(validateContinuationCheckpoint(changed, { segmentId: 1 })).toMatchObject({
      ok: false,
      reason: 'checkpoint_mismatch',
    })

    const incomplete = fixture()
    incomplete.coverage.missingOrUncertain.pop()
    expect(validateContinuationCheckpoint(incomplete, { segmentId: 1 })).toMatchObject({
      ok: false,
      reason: 'invalid_checkpoint',
    })
  })

  it('rejects unknown fields, altered counters, and rewritten prior history', () => {
    const unknown = fixture() as ReturnType<typeof fixture> & { accidental: string }
    unknown.accidental = 'no'
    expect(validateContinuationCheckpoint(unknown, { segmentId: 1 })).toMatchObject({
      ok: false,
      reason: 'invalid_checkpoint',
    })

    const alteredCount = fixture()
    alteredCount.exchangeCount += 1
    expect(validateContinuationCheckpoint(alteredCount, { segmentId: 1 })).toMatchObject({
      ok: false,
      reason: 'checkpoint_mismatch',
    })

    const previous = fixture()
    const current = fixture()
    current.fromSegmentId = 2
    current.transcript.push(
      { seq: 4, role: 'user', text: 'I am 51.', timestamp: 8 },
      { seq: 5, role: 'assistant', text: 'When did it begin?', timestamp: 10 },
    )
    current.transcriptThroughSeq = 5
    current.awaitingAnswerTo = { seq: 5, text: 'When did it begin?' }
    current.answeredQuestionPairs.push({ assistantSeq: 3, userSeqStart: 4, userSeqEnd: 4 })
    current.exchangeCount = 3
    current.patientTurnCount = 2
    current.elapsedSeconds = 250
    current.transcriptHash = crypto.createHash('sha256').update(JSON.stringify(
      current.transcript.map(({ role, text, timestamp, seq }) => ({ role, text, timestamp, seq })),
    )).digest('hex')
    expect(validateContinuationCheckpoint(current, { segmentId: 2, previous })).toMatchObject({ ok: true })

    current.transcript[1].text = 'rewritten'
    current.transcriptHash = crypto.createHash('sha256').update(JSON.stringify(
      current.transcript.map(({ role, text, timestamp, seq }) => ({ role, text, timestamp, seq })),
    )).digest('hex')
    expect(validateContinuationCheckpoint(current, { segmentId: 2, previous })).toMatchObject({
      ok: false,
      reason: 'checkpoint_mismatch',
    })
  })

  it('serializes history without a greeting and makes the pending question silent', () => {
    const checkpoint = fixture()
    expect(continuationHistory(checkpoint)).toEqual([
      { role: 'USER', text: 'Synthetic headache fixture.' },
      { role: 'ASSISTANT', text: 'How old are you?' },
    ])
    const instructions = buildContinuationInstructions('base', checkpoint)
    expect(instructions).toContain('Do not repeat it, greet, summarize, or speak now')
    expect(instructions).toContain('Wait silently')
    expect(instructions).toContain('does not mean not_asked')
    expect(instructions).toContain('can never establish final coverage')
    expect(instructions).toContain('Why were you referred?')
  })

  it('accepts exactly 190000 replay bytes and rejects one byte beyond either replay limit', () => {
    const exact = fixtureWithTranscript(maximumHistoryTranscript())
    const history = continuationHistory(exact)
    expect(history.reduce((bytes, entry) => bytes + Buffer.byteLength(entry.text), 0))
      .toBe(MAX_HISTORY_BYTES)
    expect(Math.max(...history.map((entry) => Buffer.byteLength(entry.text))))
      .toBe(MAX_HISTORY_MESSAGE_BYTES)
    expect(validateContinuationCheckpoint(exact, { segmentId: 1 })).toMatchObject({ ok: true })

    const totalOver = fixtureWithTranscript(maximumHistoryTranscript(true))
    expect(validateContinuationCheckpoint(totalOver, { segmentId: 1 })).toMatchObject({
      ok: false,
      reason: 'invalid_checkpoint',
    })

    const messageOverTranscript = maximumHistoryTranscript()
    messageOverTranscript[1].text = exactAsciiText('U1', MAX_HISTORY_MESSAGE_BYTES + 1)
    messageOverTranscript[3].text = exactAsciiText('U2', 44_000)
    const messageOver = fixtureWithTranscript(messageOverTranscript)
    expect(validateContinuationCheckpoint(messageOver, { segmentId: 1 })).toMatchObject({
      ok: false,
      reason: 'invalid_checkpoint',
    })
  })
})
