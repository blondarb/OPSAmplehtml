import { describe, expect, it, vi } from 'vitest'
import {
  assertInvitedV4SessionBinding,
  assertHistorianQaAcceptanceConfig,
  HistorianQaAcceptanceError,
  runHistorianQaAcceptance,
  type HistorianQaAcceptanceConfig,
} from '../../scripts/historian-qa-deployed-acceptance'
import { COMPREHENSIVE_HISTORY_DOMAINS } from '@/lib/historianTypes'
import {
  LIVE_INTERVIEW_REVIEW_V2_PROMPT_VERSION,
  LIVE_REVIEW_DEPTH_DIMENSIONS,
} from '@/lib/historian/liveReviewContract'
import { CLINICIAN_HISTORY_SECTION_IDS } from '@/lib/historian/eval/clinicianHistoryReport'
import { CLINICIAN_HISTORY_REQUIRED_COMPLETE_SECTION_IDS } from '@/lib/historian/eval/clinicianHistoryReport'
import {
  medicationReconciliationTranscriptIsValid,
  parseMedicationReconciliationState,
} from '@/lib/historian/medicationReconciliation'

const config: HistorianQaAcceptanceConfig = {
  enabled: true,
  dataClass: 'synthetic-only',
  appOrigin: 'https://historian-mvp-qa.d3ietjwgco4g2t.amplifyapp.com',
  cognitoClientId: 'ecjsa2ifjoj85konf3ts42gf5',
  cognitoRegion: 'us-east-2',
  username: 'historian-qa-clinician',
  password: 'fake-generated-password',
  maxWorkerWaitMs: 30_000,
  pollIntervalMs: 1,
}

function response(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('deployed Historian QA acceptance runner', () => {
  it('runs the authenticated state-injected persistence contract without logging credentials or bearer tokens', async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method || 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : null
      const cookie = new Headers(init?.headers).get('cookie') || ''
      const origin = new Headers(init?.headers).get('origin') || ''

      if (url.includes('/api/ai/historian/save?patient_id=') && !cookie) {
        return response(401, { error: 'denied' })
      }
      if (url.startsWith('https://cognito-idp.') && method === 'POST') {
        expect(body.AuthParameters.PASSWORD).toBe(config.password)
        return response(200, { AuthenticationResult: { IdToken: 'fake-id-token' } })
      }
      if (url.endsWith('/api/ai/historian/invites') && method === 'POST') {
        expect(cookie).toBe('id_token=fake-id-token')
        return response(200, {
          invitation: {
            sessionId: 'session-1',
            url: `${config.appOrigin}/patient/historian/invite#token=fake-invite-token`,
            interviewPromptVersion: 'comprehensive-v4',
          },
        })
      }
      if (url.endsWith('/api/ai/historian/invites/redeem') && origin !== config.appOrigin) {
        return response(403, { error: 'origin' })
      }
      if (url.endsWith('/api/ai/historian/invites/redeem') && body.dateOfBirth === '1900-01-01') {
        return response(401, { error: 'dob' })
      }
      if (url.endsWith('/api/ai/historian/invites/redeem')) {
        return response(200, { context: { patientName: 'Synthetic Casey' } }, {
          'Set-Cookie': 'historian_patient_grant=fake-grant; Path=/; HttpOnly; Secure; SameSite=Strict',
        })
      }
      if (url.endsWith('/api/ai/historian/invites/context')) {
        expect(cookie).toBe('historian_patient_grant=fake-grant')
        return response(200, { context: { patientName: 'Synthetic Casey' } }, {
          'Cache-Control': 'no-store',
        })
      }
      if (url.endsWith('/api/ai/historian/session')) {
        return response(200, {
          sessionId: 'session-1',
          provider: 'nova',
          interviewMode: 'comprehensive',
          interviewPromptVersion: 'comprehensive-v4',
          turnEvidenceController: false,
          adaptiveTurnController: true,
          flushToken: 'fake-flush-token',
          relayToken: 'fake-relay-token',
        })
      }
      if (url.endsWith('/api/ai/historian/live-review') && method === 'POST') {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer fake-flush-token')
        expect(body.transcript).toHaveLength(28)
        const patientSeqs = body.transcript
          .filter((entry: { role: string }) => entry.role === 'user')
          .map((entry: { seq: number }) => entry.seq)
        return response(200, {
          review: {
            version: 2,
            reviewedThroughSeq: patientSeqs.at(-1),
            patientTurnCount: patientSeqs.length,
            integrity: 'valid',
            domains: COMPREHENSIVE_HISTORY_DOMAINS.map((domain, index) => ({
              domain: domain.id,
              status: 'covered',
              patientSeqs: [patientSeqs[index % patientSeqs.length]],
            })),
            criticalGaps: [],
            contradictions: [],
            repetitions: [],
            medications: [],
            activeSafetyConcern: { present: false, patientSeqs: [] },
            diagnosticDepth: {
              dimensions: LIVE_REVIEW_DEPTH_DIMENSIONS.map((dimension, index) => ({
                dimension,
                status: 'adequate',
                patientSeqs: [patientSeqs[index % patientSeqs.length]],
              })),
              depthSufficient: true,
            },
            readyToClose: true,
            nextQuestionIntents: [],
            confidence: 'high',
          },
          provenance: {
            modelId: 'synthetic-independent-reviewer',
            promptVersion: LIVE_INTERVIEW_REVIEW_V2_PROMPT_VERSION,
            generatedAt: '2026-08-25T12:00:00.000Z',
          },
          attestation: 'a'.repeat(43),
        })
      }
      if (url.endsWith('/api/ai/historian/save') && method === 'POST') {
        expect(body.structured_output).toMatchObject({
          interview_mode: 'comprehensive',
          interview_prompt_version: 'comprehensive-v4',
          live_review_v2: { attestation: 'a'.repeat(43) },
          medication_reconciliation_v1: {
            inventoryStatus: 'answered',
            inventoryPatientSeq: 20,
          },
          history_coverage: { covered_domains: [], missing_or_uncertain: [] },
        })
        expect(body.question_count).toBe(14)
        expect(body.transcript).toHaveLength(28)
        const medicationState = parseMedicationReconciliationState(
          body.structured_output.medication_reconciliation_v1,
          body.transcript,
        )
        expect(medicationReconciliationTranscriptIsValid(
          medicationState,
          body.transcript,
        )).toBe(true)
        expect(body.interview_completion_status).toBe('complete')
        expect(body.interview_termination_reason).toBe('coverage_complete')
        const previousSaveCount = fetchMock.mock.calls.filter(([priorInput, priorInit]) =>
          String(priorInput).endsWith('/api/ai/historian/save') && priorInit?.method === 'POST',
        ).length
        return response(200, {
          session: { id: 'session-1' },
          consult_id: '20000000-0000-4000-8000-000000000001',
          evaluation_status: previousSaveCount > 1 ? 'already_queued' : 'pending',
          replayed: previousSaveCount > 1,
        })
      }
      if (url.includes('/api/ai/historian/invites?consultId=')) {
        return response(200, {
          invitation: {
            session_id: 'session-1', evaluation_status: 'completed',
            evaluation_stage: 'completed', report_ready: true, differential_ready: true,
          },
        })
      }
      if (url.includes('/api/ai/historian/save?patient_id=') && cookie) {
        return response(200, {
          sessions: [{
            id: 'session-1',
            patient_id: '10000000-0000-4000-8000-000000000001',
            tenant_id: 'historian-mvp-qa',
            consult_id: '20000000-0000-4000-8000-000000000001',
            interview_prompt_version: 'comprehensive-v4',
            interview_completion_status: 'complete',
            interview_termination_reason: 'coverage_complete',
            evaluation_status: 'completed',
            diagnostic_sufficiency: {
              version: 1, outcome: 'sufficient', ddx_allowed: true, patient_turn_count: 14,
            },
            clinician_history_report: {
              version: 1,
              report_status: 'complete',
              input_digest: 'c'.repeat(64),
              sections: CLINICIAN_HISTORY_SECTION_IDS.map((id) => ({
                id,
                claims: CLINICIAN_HISTORY_REQUIRED_COMPLETE_SECTION_IDS.includes(id as never)
                  ? [{
                      text: 'This is synthetic test data only.',
                      citations: [{ patient_seq: 2, quote: 'This is synthetic test data only.' }],
                    }]
                  : [],
              })),
              medication_reconciliation: { items: [] },
              limitations: [],
              completion: { patient_turn_count: 14 },
              provenance: { prompt_version: 'clinician-history-report-v1' },
            },
            final_differential: { differential: [{ diagnosis: 'Synthetic physician-only output' }] },
          }],
        }, { 'Cache-Control': 'no-store' })
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    }) as unknown as typeof fetch

    const emitted: string[] = []
    const result = await runHistorianQaAcceptance(config, {
      fetchImpl: fetchMock,
      sleep: async () => {},
      emit: (line) => emitted.push(line),
    })

    expect(result).toEqual({ gates: 14, evaluationStatus: 'completed' })
    expect(emitted.at(-1)).toContain('HISTORIAN_QA_ACCEPTANCE_PASS')
    const output = emitted.join('\n')
    for (const forbidden of [
      config.password,
      'fake-id-token',
      'fake-invite-token',
      'fake-grant',
      'fake-relay-token',
      'fake-flush-token',
      'Synthetic Casey',
    ]) {
      expect(output).not.toContain(forbidden)
    }
  })

  it('fails closed if the runner is repointed away from the exact synthetic QA deployment', () => {
    expect(() => assertHistorianQaAcceptanceConfig({
      ...config,
      appOrigin: 'https://app.neuroplans.app',
    })).toThrowError(new HistorianQaAcceptanceError('QA_ORIGIN_MISMATCH'))
    expect(() => assertHistorianQaAcceptanceConfig({
      ...config,
      dataClass: 'clinical',
    })).toThrowError(new HistorianQaAcceptanceError('QA_DATA_CLASS_MISMATCH'))
    expect(() => assertHistorianQaAcceptanceConfig({
      ...config,
      cognitoClientId: 'production-client',
    })).toThrowError(new HistorianQaAcceptanceError('QA_COGNITO_CLIENT_MISMATCH'))
  })

  it('reports only a fixed structural code for each invited session binding mismatch', () => {
    const valid = {
      sessionId: 'session-1',
      provider: 'nova',
      interviewMode: 'comprehensive',
      interviewPromptVersion: 'comprehensive-v4',
      turnEvidenceController: false,
      adaptiveTurnController: true,
    }
    expect(() => assertInvitedV4SessionBinding(valid, 'session-1')).not.toThrow()
    expect(() => assertInvitedV4SessionBinding(
      { ...valid, interviewPromptVersion: 'comprehensive-v3' },
      'session-1',
    )).toThrowError(new HistorianQaAcceptanceError('PATIENT_SESSION_PROMPT_MISMATCH'))
  })

  it('never incorporates a rejected Cognito response body into the surfaced error', async () => {
    const secretLikeBody = 'fake-generated-password must not be surfaced'
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      if (String(input).includes('/api/ai/historian/save?patient_id=')) {
        return response(401, { error: 'denied' })
      }
      return response(401, { error: secretLikeBody })
    }) as unknown as typeof fetch

    await expect(runHistorianQaAcceptance(config, {
      fetchImpl: fetchMock,
      emit: () => {},
    })).rejects.toMatchObject({
      code: 'COGNITO_AUTH_REJECTED',
      status: 401,
    })
  })
})
