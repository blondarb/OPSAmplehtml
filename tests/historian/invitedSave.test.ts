import { beforeEach, describe, expect, it, vi } from 'vitest'

const { queryMock, connectMock, releaseMock, getPoolMock } = vi.hoisted(() => {
  const queryMock = vi.fn()
  const releaseMock = vi.fn()
  const connectMock = vi.fn(async () => ({ query: queryMock, release: releaseMock }))
  const getPoolMock = vi.fn(async () => ({ query: queryMock, connect: connectMock }))
  return { queryMock, connectMock, releaseMock, getPoolMock }
})

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { saveInvitedHistorianSession } from '@/lib/historian/invitedSave'
import type { HistorianInvitationBinding } from '@/lib/historian/invitationStore'
import { COMPREHENSIVE_HISTORY_DOMAINS } from '@/lib/historianTypes'
import {
  LIVE_INTERVIEW_REVIEW_PROMPT_VERSION,
  LIVE_INTERVIEW_REVIEW_V2_PROMPT_VERSION,
  LIVE_REVIEW_DEPTH_DIMENSIONS,
  type LiveReviewMedicationMention,
} from '@/lib/historian/liveReviewContract'
import {
  ADAPTIVE_OPENING_QUESTION,
  ADAPTIVE_PRE_CLOSE_QUESTION,
} from '@/lib/historian/adaptiveQuestionContract'
import {
  MEDICATION_INVENTORY_QUESTION,
  MEDICATION_RECONCILIATION_VERSION,
  approveMedicationQuestion,
  commitMedicationQuestion,
  createMedicationReconciliationState,
  nextMedicationQuestion,
  recordMedicationAnswer,
  syncMedicationReview,
} from '@/lib/historian/medicationReconciliation'
import { attestLiveInterviewReview } from '@/lib/historian/liveReviewAttestation'
import {
  approveNextPatientEvidenceQuestion,
  collectPatientEvidenceEntry,
  commitApprovedPatientEvidenceQuestion,
  createPatientEvidenceState,
  patientEvidenceCompletion,
  settlePatientEvidenceAnswer,
} from '@/lib/historian/patientEvidenceController'
import { syntheticPatientAnswer } from './patientEvidenceFixtures'

const binding: HistorianInvitationBinding = {
  inviteId: 'invite-1',
  tenantId: 'tenant-authority',
  consultId: 'consult-authority',
  patientId: 'patient-authority',
  sessionId: 'session-authority',
  patientName: 'Synthetic Patient',
  referralReason: 'Gait concern',
  sessionType: 'new_patient',
  provider: 'nova',
  interviewMode: 'comprehensive',
  interviewPromptVersion: 'comprehensive-v1',
  status: 'in_progress',
  grantExpiresAt: '2026-08-21T18:00:00.000Z',
}

const v2Binding: HistorianInvitationBinding = {
  ...binding,
  interviewPromptVersion: 'comprehensive-v2',
}

const v3Binding: HistorianInvitationBinding = {
  ...binding,
  interviewPromptVersion: 'comprehensive-v3',
  startupAttemptId: '22222222-2222-4222-8222-222222222222',
}

const v4Binding: HistorianInvitationBinding = {
  ...v3Binding,
  interviewPromptVersion: 'comprehensive-v4',
}

function completeV3Transcript() {
  return Array.from({ length: 12 }, (_, index) => [
    {
      role: 'assistant' as const,
      text: index === 0
        ? ADAPTIVE_OPENING_QUESTION
        : index === 10
          ? MEDICATION_INVENTORY_QUESTION
          : index === 11
            ? ADAPTIVE_PRE_CLOSE_QUESTION
            : `Synthetic patient-specific history question ${index + 1}?`,
      timestamp: index * 2,
      seq: index * 2 + 1,
    },
    {
      role: 'user' as const,
      text: index === 10
        ? 'No other medicines.'
        : index === 11
          ? 'No, that covers it.'
          : `Synthetic detailed patient-reported answer ${index + 1}.`,
      timestamp: index * 2 + 1,
      seq: index * 2 + 2,
    },
  ]).flat()
}

function completeEmptyMedicationReconciliation() {
  return {
    version: MEDICATION_RECONCILIATION_VERSION,
    items: [],
    inventoryStatus: 'answered',
    inventoryPatientSeq: 22,
    pendingQuestion: null,
    medicationNameClarificationCount: 0,
    clinicalMedicationQuestionCount: 1,
  }
}

async function attestedCompleteV3Review(
  transcript = completeV3Transcript(),
  medications: LiveReviewMedicationMention[] = [],
) {
  const patientSeqs = transcript.filter((entry) => entry.role === 'user').map((entry) => entry.seq)
  return attestLiveInterviewReview(v3Binding.sessionId, transcript, {
    review: {
      version: 1,
      reviewedThroughSeq: patientSeqs.at(-1)!,
      domains: COMPREHENSIVE_HISTORY_DOMAINS.map((domain, index) => ({
        domain: domain.id,
        status: 'covered' as const,
        patientSeqs: [patientSeqs[index % patientSeqs.length]],
      })),
      criticalGaps: [],
      contradictions: [],
      repetitions: [],
      medications,
      activeSafetyConcern: { present: false, patientSeqs: [] },
      readyToClose: true,
      nextQuestionIntents: [],
      confidence: 'high',
    },
    provenance: {
      modelId: 'synthetic-independent-reviewer',
      promptVersion: LIVE_INTERVIEW_REVIEW_PROMPT_VERSION,
      generatedAt: '2026-08-25T12:00:00.000Z',
    },
  }, v3Binding.startupAttemptId ?? undefined)
}

async function attestedCompleteV4Review(
  transcript = completeV3Transcript(),
  options: { shallow?: boolean; exhausted?: boolean; activeSafety?: boolean } = {},
) {
  const patientSeqs = transcript.filter((entry) => entry.role === 'user').map((entry) => entry.seq!)
  return attestLiveInterviewReview(v4Binding.sessionId, transcript, {
    review: {
      version: 2,
      reviewedThroughSeq: patientSeqs.at(-1)!,
      patientTurnCount: patientSeqs.length,
      integrity: options.exhausted ? 'clarification_exhausted' as const : 'valid' as const,
      domains: COMPREHENSIVE_HISTORY_DOMAINS.map((domain, index) => ({
        domain: domain.id,
        status: options.shallow && domain.id === 'presenting_symptom'
          ? 'missing' as const
          : 'covered' as const,
        patientSeqs: options.shallow && domain.id === 'presenting_symptom'
          ? []
          : [patientSeqs[index % patientSeqs.length]],
      })),
      criticalGaps: options.shallow
        ? [{
            domain: 'presenting_symptom' as const,
            depthDimension: 'phenotype_and_severity' as const,
            basis: 'not_asked' as const,
            patientSeqs: [],
            reason: 'The symptom phenotype remains too shallow.',
            questionIntent: 'Clarify the symptom quality and severity.',
          }]
        : [],
      contradictions: [],
      repetitions: [],
      medications: [],
      activeSafetyConcern: {
        present: options.activeSafety === true,
        patientSeqs: options.activeSafety ? [patientSeqs.at(-1)!] : [],
      },
      diagnosticDepth: {
        dimensions: LIVE_REVIEW_DEPTH_DIMENSIONS.map((dimension, index) => ({
          dimension,
          status: options.shallow && dimension === 'phenotype_and_severity'
            ? 'missing' as const
            : 'adequate' as const,
          patientSeqs: options.shallow && dimension === 'phenotype_and_severity'
            ? []
            : [patientSeqs[index % patientSeqs.length]],
        })),
        depthSufficient: !options.shallow,
      },
      readyToClose: !options.shallow && !options.activeSafety,
      nextQuestionIntents: options.shallow
        ? ['Clarify the symptom quality and severity.']
        : [],
      confidence: 'high',
    },
    provenance: {
      modelId: 'synthetic-independent-reviewer',
      promptVersion: LIVE_INTERVIEW_REVIEW_V2_PROMPT_VERSION,
      generatedAt: '2026-08-25T12:00:00.000Z',
    },
  }, v4Binding.startupAttemptId ?? undefined)
}

async function uncertainMedicationV3Fixture() {
  const transcript: ReturnType<typeof completeV3Transcript> = []
  const addTurn = (assistantText: string, patientText: string) => {
    const assistantSeq = transcript.length + 1
    transcript.push({ role: 'assistant', text: assistantText, timestamp: assistantSeq, seq: assistantSeq })
    const patientSeq = assistantSeq + 1
    transcript.push({ role: 'user', text: patientText, timestamp: patientSeq, seq: patientSeq })
    return { assistantSeq, patientSeq }
  }

  const opening = addTurn(
    ADAPTIVE_OPENING_QUESTION,
    'I was referred for synthetic headaches, and I take trazodone.',
  )
  const medicationMention: LiveReviewMedicationMention = {
    nameSpan: 'trazodone',
    patientSeq: opening.patientSeq,
    dose: { status: 'missing', valueSpan: null, patientSeqs: [] },
    frequency: { status: 'missing', valueSpan: null, patientSeqs: [] },
  }
  let medicationState = syncMedicationReview(
    createMedicationReconciliationState(),
    [medicationMention],
  )
  const confirmation = nextMedicationQuestion(medicationState, { includeInventory: false })!
  medicationState = approveMedicationQuestion(medicationState, confirmation)
  const rejected = addTurn(confirmation.questionText, "No, that's not right.")
  medicationState = commitMedicationQuestion(
    medicationState,
    confirmation.obligationId,
    rejected.assistantSeq,
    confirmation.questionText,
  )
  medicationState = recordMedicationAnswer(
    medicationState,
    rejected.patientSeq,
    "No, that's not right.",
  )

  for (let index = 0; index < 9; index += 1) {
    addTurn(
      `Synthetic patient-specific history question ${index + 1}?`,
      `Synthetic detailed patient-reported answer ${index + 1}.`,
    )
  }
  const inventory = nextMedicationQuestion(medicationState, { includeInventory: true })!
  medicationState = approveMedicationQuestion(medicationState, inventory)
  const inventoryAnswer = addTurn(inventory.questionText, 'No other medicines.')
  medicationState = commitMedicationQuestion(
    medicationState,
    inventory.obligationId,
    inventoryAnswer.assistantSeq,
    inventory.questionText,
  )
  medicationState = recordMedicationAnswer(
    medicationState,
    inventoryAnswer.patientSeq,
    'No other medicines.',
  )
  addTurn(ADAPTIVE_PRE_CLOSE_QUESTION, 'No, that covers it.')

  return {
    transcript,
    medicationState,
    review: await attestedCompleteV3Review(transcript, [medicationMention]),
  }
}

function completeV2Evidence(firstAnswer = 'No.') {
  let state = createPatientEvidenceState()
  const transcript: Array<{ role: 'assistant' | 'user'; text: string; timestamp: number; seq: number }> = []
  let seq = 1
  while (patientEvidenceCompletion(state) === 'incomplete') {
    const approved = approveNextPatientEvidenceQuestion(state)
    if (!approved.ok || !approved.value) throw new Error(approved.error)
    state = commitApprovedPatientEvidenceQuestion(
      approved.value.state,
      seq,
      approved.value.questionText,
    ).value!
    transcript.push({ role: 'assistant', text: approved.value.questionText, timestamp: seq, seq })
    seq += 1
    const answer = transcript.length === 1
      ? firstAnswer
      : syntheticPatientAnswer(approved.value.obligation.id)
    const patient = { role: 'user' as const, text: answer, timestamp: seq, seq }
    transcript.push(patient)
    state = collectPatientEvidenceEntry(state, patient).value!
    state = settlePatientEvidenceAnswer(state, transcript).value!
    seq += 1
  }
  return { state, transcript }
}

function incompleteV2EvidenceAtSixty() {
  let state = createPatientEvidenceState()
  const transcript: Array<{ role: 'assistant' | 'user'; text: string; timestamp: number; seq: number }> = []
  let seq = 1
  let questionCount = 0
  let referralClarificationUsed = false
  let ageClarificationUsed = false

  while (questionCount < 60) {
    const approved = approveNextPatientEvidenceQuestion(state)
    if (!approved.ok || !approved.value) throw new Error(approved.error)
    state = commitApprovedPatientEvidenceQuestion(
      approved.value.state,
      seq,
      approved.value.questionText,
    ).value!
    transcript.push({ role: 'assistant', text: approved.value.questionText, timestamp: seq, seq })
    seq += 1
    questionCount += 1

    const obligationId = approved.value.obligation.id
    let answer = syntheticPatientAnswer(obligationId, 'maximal')
    if (obligationId === 'referral_reason' && !referralClarificationUsed) {
      referralClarificationUsed = true
      answer = 'What do you mean?'
    } else if (obligationId === 'patient_reported_age' && !ageClarificationUsed) {
      ageClarificationUsed = true
      answer = 'What do you mean?'
    }
    const patient = { role: 'user' as const, text: answer, timestamp: seq, seq }
    transcript.push(patient)
    state = collectPatientEvidenceEntry(state, patient).value!
    state = settlePatientEvidenceAnswer(state, transcript).value!
    seq += 1
  }
  return { state, transcript, questionCount }
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: binding.sessionId,
    tenant_id: 'attacker-tenant',
    patient_id: 'attacker-patient',
    consult_id: 'attacker-consult',
    structured_output: {
      chief_complaint: 'Gait concern',
      interview_mode: 'standard',
      history_coverage: {
        covered_domains: COMPREHENSIVE_HISTORY_DOMAINS.map((domain) => domain.id),
        missing_or_uncertain: [],
      },
    },
    narrative_summary: 'Synthetic interview summary.',
    transcript: [
      { role: 'assistant', text: 'Why were you referred?', timestamp: 0, seq: 1 },
      { role: 'user', text: 'Because walking is harder.', timestamp: 2, seq: 2 },
    ],
    red_flags: [],
    duration_seconds: 120,
    question_count: 2,
    interview_completion_status: 'complete',
    interview_termination_reason: 'coverage_complete',
    ...overrides,
  }
}

describe('invited historian transactional save', () => {
  beforeEach(() => {
    queryMock.mockReset()
    connectMock.mockClear()
    releaseMock.mockClear()
    getPoolMock.mockClear()
  })

  it('accepts the production one-based transcript sequence, updates only bound records, and enqueues DDx work atomically', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
      if (sql.includes('FOR UPDATE OF invite, session')) {
        return {
          rows: [{
            invite_status: 'in_progress',
            session_status: 'in_progress',
            grant_expires_at: '2026-08-21T18:00:00.000Z',
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('INSERT INTO historian_transcript_events')) return { rows: [], rowCount: 2 }
      if (sql.includes('SELECT seq, role, text')) {
        return {
          rows: [
            { seq: 1, role: 'assistant', text: 'Why were you referred?' },
            { seq: 2, role: 'user', text: 'Because walking is harder.' },
          ],
          rowCount: 2,
        }
      }
      if (sql.includes('INSERT INTO historian_eval_jobs')) return { rows: [], rowCount: 1 }
      if (sql.includes('UPDATE historian_') || sql.includes('UPDATE neurology_consults')) {
        return { rows: [], rowCount: 1 }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    })

    const result = await saveInvitedHistorianSession(
      binding,
      body(),
      new Date('2026-08-20T18:00:00.000Z'),
    )
    expect(result).toMatchObject({
      ok: true,
      replayed: false,
      evaluationStatus: 'pending',
      sessionId: binding.sessionId,
      consultId: binding.consultId,
    })

    const sessionUpdate = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE historian_sessions'),
    )
    expect(sessionUpdate?.[0]).toContain('diagnostic_sufficiency = $11::jsonb')
    expect(sessionUpdate?.[0]).toContain('AND tenant_id = $14')
    expect(sessionUpdate?.[0]).toContain('AND consult_id = $15')
    expect(sessionUpdate?.[1]).toContain(binding.sessionId)
    expect(sessionUpdate?.[1]).toContain(binding.tenantId)
    expect(sessionUpdate?.[1]).toContain(binding.consultId)
    expect(sessionUpdate?.[1]).not.toContain('attacker-tenant')
    expect(sessionUpdate?.[1]).not.toContain('attacker-patient')
    expect(sessionUpdate?.[1]).not.toContain('attacker-consult')
    expect(String(sessionUpdate?.[1]?.[0])).toContain('"interview_mode":"comprehensive"')

    const calls = queryMock.mock.calls.map(([sql]) => String(sql))
    expect(calls.indexOf('COMMIT')).toBeGreaterThan(calls.findIndex((sql) => sql.includes('INSERT INTO historian_eval_jobs')))
    expect(releaseMock).toHaveBeenCalledTimes(1)
  })

  it('returns the original receipt on a network replay and does not enqueue twice', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 }
      if (sql.includes('FOR UPDATE OF invite, session')) {
        return {
          rows: [{
            invite_status: 'completed',
            session_status: 'completed',
            grant_expires_at: '2026-08-21T18:00:00.000Z',
          }],
          rowCount: 1,
        }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    })

    const result = await saveInvitedHistorianSession(
      { ...binding, status: 'completed' },
      body(),
      new Date('2026-08-20T18:00:00.000Z'),
    )
    expect(result).toMatchObject({ ok: true, replayed: true, evaluationStatus: 'already_queued' })
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO historian_eval_jobs'))).toBe(false)
  })

  it('rejects a caller-selected session before touching the database', async () => {
    const result = await saveInvitedHistorianSession(binding, body({ sessionId: 'attacker-session' }))
    expect(result).toEqual({ ok: false, status: 409, error: 'Session binding mismatch.' })
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('rejects a zero-based transcript that does not match the production hook contract', async () => {
    const result = await saveInvitedHistorianSession(binding, body({
      transcript: [
        { role: 'assistant', text: 'Why were you referred?', timestamp: 0, seq: 0 },
        { role: 'user', text: 'Because walking is harder.', timestamp: 2, seq: 1 },
      ],
    }))
    expect(result).toEqual({ ok: false, status: 400, error: 'Transcript is malformed.' })
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('rejects a purportedly complete interview whose fixed coverage audit is incomplete', async () => {
    const result = await saveInvitedHistorianSession(binding, body({
      structured_output: {
        chief_complaint: 'Gait concern',
        history_coverage: { covered_domains: [], missing_or_uncertain: [] },
      },
    }))
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('rejects a v2 model coverage claim that has no transcript-bound evidence ledger', async () => {
    const result = await saveInvitedHistorianSession(v2Binding, body({
      structured_output: {
        chief_complaint: 'Synthetic concern',
        interview_prompt_version: 'comprehensive-v2',
        history_coverage: {
          covered_domains: COMPREHENSIVE_HISTORY_DOMAINS.map((domain) => domain.id),
          missing_or_uncertain: [],
        },
      },
    }))
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('accepts transcript-grounded v2 uncertainty and replaces forged model coverage', async () => {
    const fixture = completeV2Evidence("I don't know.")
    expect(patientEvidenceCompletion(fixture.state)).toBe('complete_with_uncertainty')
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
      if (sql.includes('FOR UPDATE OF invite, session')) {
        return { rows: [{
          invite_status: 'in_progress', session_status: 'in_progress',
          grant_expires_at: '2026-08-21T18:00:00.000Z',
        }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO historian_transcript_events')) {
        return { rows: [], rowCount: fixture.transcript.length }
      }
      if (sql.includes('SELECT seq, role, text')) {
        return {
          rows: fixture.transcript.map(({ seq, role, text }) => ({ seq, role, text })),
          rowCount: fixture.transcript.length,
        }
      }
      if (sql.includes('INSERT INTO historian_eval_jobs')) return { rows: [], rowCount: 1 }
      if (sql.includes('UPDATE historian_') || sql.includes('UPDATE neurology_consults')) {
        return { rows: [], rowCount: 1 }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    })

    const result = await saveInvitedHistorianSession(
      v2Binding,
      body({
        structured_output: {
          chief_complaint: 'Synthetic concern',
          interview_prompt_version: 'comprehensive-v2',
          history_evidence_v1: fixture.state,
          history_coverage: { covered_domains: [], missing_or_uncertain: [] },
        },
        transcript: fixture.transcript,
        question_count: fixture.state.records.length,
        interview_completion_status: 'complete',
        interview_termination_reason: 'complete_with_uncertainty',
      }),
      new Date('2026-08-20T18:00:00.000Z'),
    )
    expect(result.ok).toBe(true)
    const sessionUpdate = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE historian_sessions'),
    )
    const persisted = JSON.parse(String(sessionUpdate?.[1]?.[0]))
    expect(persisted.interview_prompt_version).toBe('comprehensive-v2')
    expect(persisted.history_coverage.missing_or_uncertain).toContainEqual({
      domain: 'referral_reason',
      reason: 'unknown',
    })
    expect(sessionUpdate?.[1]).toContain('comprehensive-v2')
  })

  it('accepts only a server-attested, current v3 review for normal completion', async () => {
    const priorSecret = process.env.HISTORIAN_FLUSH_SECRET
    process.env.HISTORIAN_FLUSH_SECRET = 'synthetic-v3-save-attestation-secret'
    const transcript = completeV3Transcript()
    const review = await attestedCompleteV3Review(transcript)
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
      if (sql.includes('FOR UPDATE OF invite, session')) {
        return { rows: [{
          invite_status: 'in_progress', session_status: 'in_progress',
          startup_attempt_id: v3Binding.startupAttemptId,
          grant_expires_at: '2026-08-26T18:00:00.000Z',
        }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO historian_transcript_events')) {
        return { rows: [], rowCount: transcript.length }
      }
      if (sql.includes('SELECT seq, role, text')) {
        return {
          rows: transcript.map(({ seq, role, text }) => ({ seq, role, text })),
          rowCount: transcript.length,
        }
      }
      if (sql.includes('INSERT INTO historian_eval_jobs')) return { rows: [], rowCount: 1 }
      if (sql.includes('UPDATE historian_') || sql.includes('UPDATE neurology_consults')) {
        return { rows: [], rowCount: 1 }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    })

    try {
      const result = await saveInvitedHistorianSession(
        v3Binding,
        body({
          structured_output: {
            interview_prompt_version: 'comprehensive-v3',
            live_review_v1: review,
            medication_reconciliation_v1: completeEmptyMedicationReconciliation(),
            history_coverage: { covered_domains: [], missing_or_uncertain: [] },
            hpi: 'Untrusted model draft says trazodone.',
            medication_changes: 'Untrusted model draft medication change.',
          },
          transcript,
          question_count: 12,
        }),
        new Date('2026-08-25T18:00:00.000Z'),
      )
      expect(result.ok).toBe(true)
      const sessionUpdate = queryMock.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE historian_sessions'),
      )
      const persisted = JSON.parse(String(sessionUpdate?.[1]?.[0]))
      expect(persisted.interview_prompt_version).toBe('comprehensive-v3')
      expect(persisted.history_coverage.covered_domains).toHaveLength(
        COMPREHENSIVE_HISTORY_DOMAINS.length,
      )
      expect(persisted).not.toHaveProperty('hpi')
      expect(persisted).not.toHaveProperty('medication_changes')
      expect(JSON.stringify(persisted)).not.toContain('trazodone')
      expect(sessionUpdate?.[1]).toContain('comprehensive-v3')
      expect(sessionUpdate?.[1]?.[10]).toBeNull()
      const jobInsert = queryMock.mock.calls.find(([sql]) =>
        String(sql).includes('INSERT INTO historian_eval_jobs'))
      expect(jobInsert?.[1]).toEqual([
        v3Binding.tenantId,
        v3Binding.sessionId,
        1,
        'legacy',
        expect.any(Date),
      ])
    } finally {
      if (priorSecret === undefined) delete process.env.HISTORIAN_FLUSH_SECRET
      else process.env.HISTORIAN_FLUSH_SECRET = priorSecret
    }
  })

  it('requires and persists complete-with-uncertainty when a medication name remains unresolved', async () => {
    const priorSecret = process.env.HISTORIAN_FLUSH_SECRET
    process.env.HISTORIAN_FLUSH_SECRET = 'synthetic-v3-save-attestation-secret'
    try {
      const fixture = await uncertainMedicationV3Fixture()
      const forgedComplete = await saveInvitedHistorianSession(v3Binding, body({
        structured_output: {
          interview_prompt_version: 'comprehensive-v3',
          live_review_v1: fixture.review,
          medication_reconciliation_v1: fixture.medicationState,
        },
        transcript: fixture.transcript,
        question_count: 13,
        interview_termination_reason: 'coverage_complete',
      }))
      expect(forgedComplete).toMatchObject({ ok: false, status: 409 })
      expect(getPoolMock).not.toHaveBeenCalled()

      queryMock.mockImplementation(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
        if (sql.includes('FOR UPDATE OF invite, session')) {
          return { rows: [{
            invite_status: 'in_progress', session_status: 'in_progress',
            startup_attempt_id: v3Binding.startupAttemptId,
            grant_expires_at: '2026-08-26T18:00:00.000Z',
          }], rowCount: 1 }
        }
        if (sql.includes('INSERT INTO historian_transcript_events')) {
          return { rows: [], rowCount: fixture.transcript.length }
        }
        if (sql.includes('SELECT seq, role, text')) {
          return {
            rows: fixture.transcript.map(({ seq, role, text }) => ({ seq, role, text })),
            rowCount: fixture.transcript.length,
          }
        }
        if (sql.includes('INSERT INTO historian_eval_jobs')) return { rows: [], rowCount: 1 }
        if (sql.includes('UPDATE historian_') || sql.includes('UPDATE neurology_consults')) {
          return { rows: [], rowCount: 1 }
        }
        throw new Error(`Unexpected SQL: ${sql}`)
      })

      const accepted = await saveInvitedHistorianSession(v3Binding, body({
        structured_output: {
          interview_prompt_version: 'comprehensive-v3',
          live_review_v1: fixture.review,
          medication_reconciliation_v1: fixture.medicationState,
          medication_reconciliation_has_uncertainty: false,
          medication_reconciliation_unresolved_count: 0,
        },
        transcript: fixture.transcript,
        question_count: 13,
        interview_termination_reason: 'complete_with_uncertainty',
      }))
      expect(accepted.ok).toBe(true)
      const sessionUpdate = queryMock.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE historian_sessions'),
      )
      const persisted = JSON.parse(String(sessionUpdate?.[1]?.[0]))
      expect(persisted.medication_reconciliation_has_uncertainty).toBe(true)
      expect(persisted.medication_reconciliation_unresolved_count).toBe(1)
      expect(persisted).not.toHaveProperty('current_medications')
    } finally {
      if (priorSecret === undefined) delete process.env.HISTORIAN_FLUSH_SECRET
      else process.env.HISTORIAN_FLUSH_SECRET = priorSecret
    }
  })

  it('rejects a browser-tampered v3 closure review before touching the database', async () => {
    const priorSecret = process.env.HISTORIAN_FLUSH_SECRET
    process.env.HISTORIAN_FLUSH_SECRET = 'synthetic-v3-save-attestation-secret'
    try {
      const transcript = completeV3Transcript()
      const review = await attestedCompleteV3Review(transcript)
      review.review.domains[0] = {
        ...review.review.domains[0],
        status: 'missing',
        patientSeqs: [],
      }
      review.review.readyToClose = false
      const result = await saveInvitedHistorianSession(v3Binding, body({
        structured_output: {
          interview_prompt_version: 'comprehensive-v3',
          live_review_v1: review,
        },
        transcript,
        question_count: 12,
      }))
      expect(result).toMatchObject({ ok: false, status: 409 })
      expect(getPoolMock).not.toHaveBeenCalled()
    } finally {
      if (priorSecret === undefined) delete process.env.HISTORIAN_FLUSH_SECRET
      else process.env.HISTORIAN_FLUSH_SECRET = priorSecret
    }
  })

  it('persists a server-derived v4 sufficiency artifact and report-first job stage', async () => {
    const priorSecret = process.env.HISTORIAN_FLUSH_SECRET
    process.env.HISTORIAN_FLUSH_SECRET = 'synthetic-v4-save-attestation-secret'
    try {
      const transcript = completeV3Transcript()
      const review = await attestedCompleteV4Review(transcript)
      queryMock.mockImplementation(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
        if (sql.includes('FOR UPDATE OF invite, session')) {
          return { rows: [{
            invite_status: 'in_progress', session_status: 'in_progress',
            startup_attempt_id: v4Binding.startupAttemptId,
            grant_expires_at: '2026-08-26T18:00:00.000Z',
          }], rowCount: 1 }
        }
        if (sql.includes('INSERT INTO historian_transcript_events')) {
          return { rows: [], rowCount: transcript.length }
        }
        if (sql.includes('SELECT seq, role, text')) {
          return {
            rows: transcript.map(({ seq, role, text }) => ({ seq, role, text })),
            rowCount: transcript.length,
          }
        }
        if (sql.includes('INSERT INTO historian_eval_jobs')) return { rows: [], rowCount: 1 }
        if (sql.includes('UPDATE historian_') || sql.includes('UPDATE neurology_consults')) {
          return { rows: [], rowCount: 1 }
        }
        throw new Error(`Unexpected SQL: ${sql}`)
      })

      const result = await saveInvitedHistorianSession(v4Binding, body({
        structured_output: {
          interview_prompt_version: 'comprehensive-v4',
          live_review_v2: review,
          medication_reconciliation_v1: completeEmptyMedicationReconciliation(),
        },
        transcript,
        question_count: 12,
      }))
      expect(result.ok).toBe(true)
      const sessionUpdate = queryMock.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE historian_sessions'))
      const sufficiency = JSON.parse(String(sessionUpdate?.[1]?.[10]))
      expect(sufficiency).toMatchObject({
        version: 1,
        outcome: 'sufficient',
        ddx_allowed: true,
        patient_turn_count: 12,
      })
      expect(String(sessionUpdate?.[1]?.[0])).toContain('live_review_v2')
      const jobInsert = queryMock.mock.calls.find(([sql]) =>
        String(sql).includes('INSERT INTO historian_eval_jobs'))
      expect(jobInsert?.[1]).toEqual([
        v4Binding.tenantId,
        v4Binding.sessionId,
        2,
        'report_pending',
        expect.any(Date),
      ])
    } finally {
      if (priorSecret === undefined) delete process.env.HISTORIAN_FLUSH_SECRET
      else process.env.HISTORIAN_FLUSH_SECRET = priorSecret
    }
  })

  it('rejects normal v4 closure when the silent reviewer says case depth is shallow', async () => {
    const priorSecret = process.env.HISTORIAN_FLUSH_SECRET
    process.env.HISTORIAN_FLUSH_SECRET = 'synthetic-v4-save-attestation-secret'
    try {
      const transcript = completeV3Transcript()
      const review = await attestedCompleteV4Review(transcript, { shallow: true })
      const result = await saveInvitedHistorianSession(v4Binding, body({
        structured_output: {
          interview_prompt_version: 'comprehensive-v4',
          live_review_v2: review,
          medication_reconciliation_v1: completeEmptyMedicationReconciliation(),
        },
        transcript,
        question_count: 12,
      }))
      expect(result).toMatchObject({ ok: false, status: 409 })
      expect(getPoolMock).not.toHaveBeenCalled()
    } finally {
      if (priorSecret === undefined) delete process.env.HISTORIAN_FLUSH_SECRET
      else process.env.HISTORIAN_FLUSH_SECRET = priorSecret
    }
  })

  it('rejects normal completion when an exhausted review carries an active safety finding', async () => {
    const priorSecret = process.env.HISTORIAN_FLUSH_SECRET
    process.env.HISTORIAN_FLUSH_SECRET = 'synthetic-v4-save-attestation-secret'
    try {
      const transcript = completeV3Transcript()
      const review = await attestedCompleteV4Review(transcript, {
        shallow: true,
        exhausted: true,
        activeSafety: true,
      })
      const result = await saveInvitedHistorianSession(v4Binding, body({
        structured_output: {
          interview_prompt_version: 'comprehensive-v4',
          live_review_v2: review,
          medication_reconciliation_v1: completeEmptyMedicationReconciliation(),
        },
        transcript,
        question_count: 12,
      }))
      expect(result).toMatchObject({
        ok: false,
        status: 409,
        error: 'An active independent safety finding requires safety escalation.',
      })
      expect(getPoolMock).not.toHaveBeenCalled()
    } finally {
      if (priorSecret === undefined) delete process.env.HISTORIAN_FLUSH_SECRET
      else process.env.HISTORIAN_FLUSH_SECRET = priorSecret
    }
  })

  it('persists an incomplete transcript-bound v2 history at the exact hard stop', async () => {
    const fixture = incompleteV2EvidenceAtSixty()
    expect(fixture.questionCount).toBe(60)
    expect(patientEvidenceCompletion(fixture.state)).toBe('incomplete')
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
      if (sql.includes('FOR UPDATE OF invite, session')) {
        return { rows: [{
          invite_status: 'in_progress', session_status: 'in_progress',
          grant_expires_at: '2026-08-21T18:00:00.000Z',
        }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO historian_transcript_events')) {
        return { rows: [], rowCount: fixture.transcript.length }
      }
      if (sql.includes('SELECT seq, role, text')) {
        return {
          rows: fixture.transcript.map(({ seq, role, text }) => ({ seq, role, text })),
          rowCount: fixture.transcript.length,
        }
      }
      if (sql.includes('INSERT INTO historian_eval_jobs')) return { rows: [], rowCount: 1 }
      if (sql.includes('UPDATE historian_') || sql.includes('UPDATE neurology_consults')) {
        return { rows: [], rowCount: 1 }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    })

    const result = await saveInvitedHistorianSession(
      v2Binding,
      body({
        structured_output: {
          chief_complaint: 'Synthetic maximal fixture with one remaining gap.',
          interview_prompt_version: 'comprehensive-v2',
          history_evidence_v1: fixture.state,
          history_coverage: {
            covered_domains: COMPREHENSIVE_HISTORY_DOMAINS.map((domain) => domain.id),
            missing_or_uncertain: [],
          },
        },
        transcript: fixture.transcript,
        question_count: fixture.questionCount,
        interview_completion_status: 'ended_early',
        interview_termination_reason: 'hard_stop',
      }),
      new Date('2026-08-20T18:00:00.000Z'),
    )

    expect(result.ok).toBe(true)
    const sessionUpdate = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE historian_sessions'),
    )
    const persisted = JSON.parse(String(sessionUpdate?.[1]?.[0]))
    expect(persisted.history_coverage.missing_or_uncertain.length).toBeGreaterThan(0)
    expect(persisted.history_coverage.covered_domains)
      .not.toEqual(COMPREHENSIVE_HISTORY_DOMAINS.map((domain) => domain.id))
    expect(queryMock.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true)
  })

  it('accepts a transcript-bound partial v2 safety save and creates the critical alert atomically', async () => {
    const approved = approveNextPatientEvidenceQuestion(createPatientEvidenceState()).value!
    const evidence = commitApprovedPatientEvidenceQuestion(
      approved.state,
      1,
      approved.questionText,
    ).value!
    const transcript = [
      { role: 'assistant' as const, text: approved.questionText, timestamp: 0, seq: 1 },
      { role: 'user' as const, text: "I can't move my arm right now.", timestamp: 2, seq: 2 },
    ]
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
      if (sql.includes('FOR UPDATE OF invite, session')) {
        return { rows: [{
          invite_status: 'in_progress', session_status: 'in_progress',
          grant_expires_at: '2026-08-21T18:00:00.000Z',
        }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO historian_transcript_events')) {
        return { rows: [], rowCount: transcript.length }
      }
      if (sql.includes('SELECT seq, role, text')) {
        return { rows: transcript.map(({ seq, role, text }) => ({ seq, role, text })), rowCount: transcript.length }
      }
      if (sql.includes('FROM notifications')) return { rows: [], rowCount: 0 }
      if (sql.includes('INSERT INTO notifications')) return { rows: [], rowCount: 1 }
      if (sql.includes('INSERT INTO historian_eval_jobs')) return { rows: [], rowCount: 1 }
      if (sql.includes('UPDATE historian_') || sql.includes('UPDATE neurology_consults')) {
        return { rows: [], rowCount: 1 }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    })

    const result = await saveInvitedHistorianSession(
      v2Binding,
      body({
        structured_output: {
          chief_complaint: 'Synthetic partial emergency history.',
          interview_prompt_version: 'comprehensive-v2',
          history_evidence_v1: evidence,
          history_coverage: {
            covered_domains: COMPREHENSIVE_HISTORY_DOMAINS.map((domain) => domain.id),
            missing_or_uncertain: [],
          },
        },
        transcript,
        question_count: 1,
        safety_escalated: true,
        red_flags: [],
        interview_completion_status: 'ended_early',
        interview_termination_reason: 'safety_escalated',
      }),
      new Date('2026-08-20T18:00:00.000Z'),
    )

    expect(result.ok).toBe(true)
    const sessionUpdate = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE historian_sessions'),
    )
    const persisted = JSON.parse(String(sessionUpdate?.[1]?.[0]))
    expect(persisted.history_coverage.covered_domains).toEqual([])
    expect(persisted.history_coverage.missing_or_uncertain).toHaveLength(
      COMPREHENSIVE_HISTORY_DOMAINS.length,
    )
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO notifications'))).toBe(true)
    expect(queryMock.mock.calls.findIndex(([sql]) => String(sql).includes('INSERT INTO notifications')))
      .toBeLessThan(queryMock.mock.calls.findIndex(([sql]) => sql === 'COMMIT'))
  })

  it('persists a tenant-bound critical alert in the same transaction for safety escalation without model red flags', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
      if (sql.includes('FOR UPDATE OF invite, session')) {
        return { rows: [{
          invite_status: 'in_progress', session_status: 'in_progress',
          grant_expires_at: '2026-08-21T18:00:00.000Z',
        }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO historian_transcript_events')) return { rows: [], rowCount: 2 }
      if (sql.includes('SELECT seq, role, text')) {
        return { rows: [
          { seq: 1, role: 'assistant', text: 'Why were you referred?' },
          { seq: 2, role: 'user', text: 'Because walking is harder.' },
        ], rowCount: 2 }
      }
      if (sql.includes('FROM notifications')) return { rows: [], rowCount: 0 }
      if (sql.includes('INSERT INTO notifications')) return { rows: [], rowCount: 1 }
      if (sql.includes('INSERT INTO historian_eval_jobs')) return { rows: [], rowCount: 1 }
      if (sql.includes('UPDATE historian_') || sql.includes('UPDATE neurology_consults')) {
        return { rows: [], rowCount: 1 }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    })

    const result = await saveInvitedHistorianSession(
      binding,
      body({
        safety_escalated: true,
        red_flags: [],
        interview_completion_status: 'ended_early',
        interview_termination_reason: 'safety_escalated',
      }),
      new Date('2026-08-20T18:00:00.000Z'),
    )
    expect(result.ok).toBe(true)
    const alertInsert = queryMock.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO notifications'))
    expect(alertInsert?.[1]?.[0]).toBe(binding.tenantId)
    expect(alertInsert?.[1]?.[1]).toBe(binding.sessionId)
    expect(queryMock.mock.calls.indexOf(alertInsert!)).toBeLessThan(
      queryMock.mock.calls.findIndex(([sql]) => sql === 'COMMIT'),
    )
  })

  it('rejects a terminal partial save mislabeled as complete', async () => {
    const result = await saveInvitedHistorianSession(binding, body({
      interview_completion_status: 'complete',
      interview_termination_reason: 'hard_stop',
      question_count: 60,
    }))
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('rejects a hard-stop reason before exchange 60', async () => {
    const result = await saveInvitedHistorianSession(binding, body({
      interview_completion_status: 'ended_early',
      interview_termination_reason: 'hard_stop',
      question_count: 59,
    }))
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: 'Hard-stop reason is invalid before exchange 60.',
    })
    expect(getPoolMock).not.toHaveBeenCalled()
  })
})
