import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  MAX_CONTINUATION_HISTORY_BYTES,
  MAX_CONTINUATION_HISTORY_MESSAGE_BYTES,
  MAX_CONTINUATION_TRANSCRIPT_CHARS,
  MAX_CONTINUATION_TRANSCRIPT_ENTRIES,
  buildHistorianAnsweredQuestionPairs,
  buildNovaHistorianContinuationHistory,
  conservativeHistorianContinuationCoverage,
  hashHistorianContinuationTranscript,
  serializeHistorianContinuation,
  validateHistorianContinuationCheckpoint,
  type HistorianContinuationCheckpointV1,
} from '../../src/lib/historian/continuationState'
import { COMPREHENSIVE_HISTORY_DOMAINS } from '../../src/lib/historianTypes'

function checkpoint(): HistorianContinuationCheckpointV1 {
  const transcript = [
    { role: 'assistant' as const, text: 'What brings you in today?', timestamp: 0, seq: 1 },
    { role: 'user' as const, text: 'A synthetic headache.', timestamp: 3, seq: 2 },
    { role: 'assistant' as const, text: 'When did it begin?', timestamp: 8, seq: 3 },
  ]
  return {
    version: 1,
    appSessionId: 'session-synthetic-001',
    fromSegmentId: 1,
    transcriptThroughSeq: 3,
    transcriptHash: hashHistorianContinuationTranscript(transcript),
    transcript,
    exchangeCount: 2,
    patientTurnCount: 1,
    elapsedSeconds: 8,
    awaitingAnswerTo: { seq: 3, text: 'When did it begin?' },
    answeredQuestionPairs: buildHistorianAnsweredQuestionPairs(transcript),
    coverage: conservativeHistorianContinuationCoverage(),
    runtimeGuard: { softWrapIssued: false, terminalReason: null },
    safetyEscalated: false,
    terminationReason: null,
    administeredScaleIds: ['synthetic-scale'],
    activeScale: { scaleId: 'synthetic-scale-2', itemIndex: 0 },
    pendingTools: [],
  }
}

function exactAsciiText(label: string, bytes: number, suffix = ''): string {
  const unit = `${label} synthetic neutral history. `
  const bodyBytes = bytes - Buffer.byteLength(suffix)
  if (bodyBytes < 1) throw new Error('Synthetic history target is too small')
  return unit.repeat(Math.ceil(bodyBytes / unit.length)).slice(0, bodyBytes) + suffix
}

function checkpointWithTranscript(
  transcript: HistorianContinuationCheckpointV1['transcript'],
): HistorianContinuationCheckpointV1 {
  const source = checkpoint()
  const last = transcript.at(-1)!
  source.transcript = transcript
  source.transcriptThroughSeq = last.seq!
  source.transcriptHash = hashHistorianContinuationTranscript(transcript)
  source.exchangeCount = transcript.reduce((count, entry, index) => (
    entry.role === 'assistant' && (index === 0 || transcript[index - 1].role === 'user')
      ? count + 1
      : count
  ), 0)
  source.patientTurnCount = transcript.filter((entry) => entry.role === 'user').length
  source.elapsedSeconds = last.timestamp
  source.awaitingAnswerTo = { seq: last.seq!, text: last.text }
  source.answeredQuestionPairs = buildHistorianAnsweredQuestionPairs(transcript)
  return source
}

function maximumHistoryTranscript(extraFinalByte = false): HistorianContinuationCheckpointV1['transcript'] {
  return [
    { role: 'assistant', text: 'Synthetic opening?', timestamp: 0, seq: 1 },
    { role: 'user', text: exactAsciiText('U1', 45_000), timestamp: 1, seq: 2 },
    { role: 'assistant', text: exactAsciiText('A1', 45_000), timestamp: 2, seq: 3 },
    { role: 'user', text: exactAsciiText('U2', 45_000), timestamp: 3, seq: 4 },
    { role: 'assistant', text: exactAsciiText('A2', 45_000), timestamp: 4, seq: 5 },
    { role: 'user', text: exactAsciiText('U3', 5_000), timestamp: 5, seq: 6 },
    { role: 'assistant', text: exactAsciiText('A3', 5_000 + Number(extraFinalByte), '?'), timestamp: 6, seq: 7 },
  ]
}

describe('Historian continuation checkpoint', () => {
  it('accepts an exact, bounded checkpoint and emits silent non-interactive history', () => {
    const source = checkpoint()
    const result = validateHistorianContinuationCheckpoint(source)
    expect(result.valid).toBe(true)

    const payload = serializeHistorianContinuation(source)
    expect(payload.history).toEqual([
      { role: 'USER', text: 'A synthetic headache.', interactive: false },
      { role: 'ASSISTANT', text: 'When did it begin?', interactive: false },
    ])
    expect(payload.continuationInstruction).toContain('What brings you in today?')
    expect(payload.continuationInstruction).toContain('already heard')
    expect(payload.continuationInstruction).toContain('Wait silently')
  })

  it('uses an exact SHA-256 canonical transcript hash', () => {
    const source = checkpoint()
    const expected = createHash('sha256')
      .update(JSON.stringify(source.transcript.map(({ role, text, timestamp, seq }) => ({ role, text, timestamp, seq }))))
      .digest('hex')
    expect(hashHistorianContinuationTranscript(source.transcript)).toBe(expected)
  })

  it('under-claims every domain and binds answered question sequence ranges', () => {
    const source = checkpoint()
    expect(source.coverage.coveredDomains).toEqual([])
    expect(source.coverage.missingOrUncertain).toEqual(
      COMPREHENSIVE_HISTORY_DOMAINS.map(({ id }) => ({
        domain: id,
        reason: 'unverified_after_rollover',
      })),
    )
    expect(source.answeredQuestionPairs).toEqual([
      { assistantSeq: 1, userSeqStart: 2, userSeqEnd: 2 },
    ])
  })

  it('normalizes split ASR turns into USER-first alternating Nova history', () => {
    const source = checkpoint()
    source.transcript.splice(2, 0, {
      role: 'user', text: 'It comes and goes.', timestamp: 4, seq: 3,
    })
    source.transcript[3].seq = 4
    expect(buildNovaHistorianContinuationHistory(source.transcript)).toEqual([
      {
        role: 'USER',
        text: 'A synthetic headache.\nIt comes and goes.',
        interactive: false,
      },
      { role: 'ASSISTANT', text: 'When did it begin?', interactive: false },
    ])
  })

  it('fails closed when sequence/history or final assistant question is inconsistent', () => {
    const sequenceGap = checkpoint()
    sequenceGap.transcript[1].seq = 4
    sequenceGap.transcriptHash = hashHistorianContinuationTranscript(sequenceGap.transcript)
    expect(validateHistorianContinuationCheckpoint(sequenceGap)).toMatchObject({ valid: false })

    const userEnded = checkpoint()
    userEnded.transcript.push({ role: 'user', text: 'Yesterday.', timestamp: 10, seq: 4 })
    userEnded.transcriptThroughSeq = 4
    userEnded.transcriptHash = hashHistorianContinuationTranscript(userEnded.transcript)
    expect(validateHistorianContinuationCheckpoint(userEnded)).toMatchObject({ valid: false })

    const wrongAwaiting = checkpoint()
    wrongAwaiting.awaitingAnswerTo.text = 'A different question'
    expect(validateHistorianContinuationCheckpoint(wrongAwaiting)).toMatchObject({ valid: false })
  })

  it('fails closed on tampering, terminal disagreement, pending tools, or unbounded transcript input', () => {
    const tampered = checkpoint()
    tampered.transcript[1].text = 'Tampered synthetic text.'
    expect(validateHistorianContinuationCheckpoint(tampered)).toMatchObject({ valid: false })

    const safetyMismatch = checkpoint()
    safetyMismatch.safetyEscalated = true
    expect(validateHistorianContinuationCheckpoint(safetyMismatch)).toMatchObject({ valid: false })

    const pending = checkpoint() as unknown as { pendingTools: unknown[] }
    pending.pendingTools = [{ id: 'must-not-resume' }]
    expect(validateHistorianContinuationCheckpoint(pending)).toMatchObject({ valid: false })

    const tooMany = checkpoint()
    tooMany.transcript = Array.from({ length: MAX_CONTINUATION_TRANSCRIPT_ENTRIES + 1 }, (_, index) => ({
      role: index === MAX_CONTINUATION_TRANSCRIPT_ENTRIES ? 'assistant' as const : index % 2 === 0 ? 'assistant' as const : 'user' as const,
      text: 'x', timestamp: index, seq: index + 1,
    }))
    tooMany.transcriptThroughSeq = tooMany.transcript.length
    tooMany.awaitingAnswerTo = { seq: tooMany.transcript.length, text: 'x' }
    tooMany.transcriptHash = hashHistorianContinuationTranscript(tooMany.transcript)
    expect(validateHistorianContinuationCheckpoint(tooMany)).toMatchObject({ valid: false })

    const tooLong = checkpoint()
    tooLong.transcript = [{ role: 'assistant', text: 'x'.repeat(MAX_CONTINUATION_TRANSCRIPT_CHARS + 1), timestamp: 0, seq: 1 }]
    tooLong.transcriptThroughSeq = 1
    tooLong.awaitingAnswerTo = { seq: 1, text: tooLong.transcript[0].text }
    tooLong.transcriptHash = hashHistorianContinuationTranscript(tooLong.transcript)
    expect(validateHistorianContinuationCheckpoint(tooLong)).toMatchObject({ valid: false })
  })

  it('accepts the exact Nova replay budget and rejects one byte beyond either limit', () => {
    const exact = checkpointWithTranscript(maximumHistoryTranscript())
    const history = buildNovaHistorianContinuationHistory(exact.transcript)
    expect(history.reduce((bytes, entry) => bytes + Buffer.byteLength(entry.text), 0))
      .toBe(MAX_CONTINUATION_HISTORY_BYTES)
    expect(Math.max(...history.map((entry) => Buffer.byteLength(entry.text))))
      .toBe(MAX_CONTINUATION_HISTORY_MESSAGE_BYTES)
    expect(validateHistorianContinuationCheckpoint(exact)).toMatchObject({ valid: true })

    const totalOver = checkpointWithTranscript(maximumHistoryTranscript(true))
    expect(validateHistorianContinuationCheckpoint(totalOver)).toMatchObject({ valid: false })

    const messageOverTranscript = maximumHistoryTranscript()
    messageOverTranscript[1].text = exactAsciiText(
      'U1',
      MAX_CONTINUATION_HISTORY_MESSAGE_BYTES + 1,
    )
    messageOverTranscript[3].text = exactAsciiText('U2', 44_000)
    const messageOver = checkpointWithTranscript(messageOverTranscript)
    expect(validateHistorianContinuationCheckpoint(messageOver)).toMatchObject({ valid: false })
  })

  it('rejects unknown schema fields and invalid closed-vocabulary coverage', () => {
    const unknown = checkpoint() as HistorianContinuationCheckpointV1 & { accidental: string }
    unknown.accidental = 'no'
    expect(validateHistorianContinuationCheckpoint(unknown)).toMatchObject({ valid: false })

    const badCoverage = checkpoint()
    badCoverage.coverage = {
      coveredDomains: ['referral_reason'],
      missingOrUncertain: COMPREHENSIVE_HISTORY_DOMAINS.slice(1).map(({ id }) => ({
        domain: id,
        reason: 'unverified_after_rollover',
      })),
    } as never
    expect(validateHistorianContinuationCheckpoint(badCoverage)).toMatchObject({ valid: false })

    const badPairs = checkpoint()
    badPairs.answeredQuestionPairs[0].userSeqEnd = 3
    expect(validateHistorianContinuationCheckpoint(badPairs)).toMatchObject({ valid: false })

    const badCounters = checkpoint()
    badCounters.exchangeCount += 1
    expect(validateHistorianContinuationCheckpoint(badCounters)).toMatchObject({ valid: false })
  })
})
