import type { HistorianTranscriptEntry } from '../src/lib/historianTypes'
import {
  approveNextPatientEvidenceQuestion,
  collectPatientEvidenceEntry,
  commitApprovedPatientEvidenceQuestion,
  createPatientEvidenceState,
  patientEvidenceCompletion,
  settlePatientEvidenceAnswer,
  type PatientEvidenceState,
} from '../src/lib/historian/patientEvidenceController'
import { syntheticPatientAnswer } from '../tests/historian/patientEvidenceFixtures'

const QA_APP_ORIGIN = 'https://historian-mvp-qa.d3ietjwgco4g2t.amplifyapp.com'
const QA_COGNITO_CLIENT_ID = 'ecjsa2ifjoj85konf3ts42gf5'
const QA_COGNITO_REGION = 'us-east-2'
const QA_USERNAME = 'historian-qa-clinician'

const FIXTURE = {
  tenantId: 'historian-mvp-qa',
  patientId: '10000000-0000-4000-8000-000000000001',
  consultId: '20000000-0000-4000-8000-000000000001',
  dateOfBirth: '1985-01-15',
  wrongDateOfBirth: '1900-01-01',
} as const

type FetchLike = typeof fetch

export interface HistorianQaAcceptanceConfig {
  enabled: boolean
  dataClass: string
  appOrigin: string
  cognitoClientId: string
  cognitoRegion: string
  username: string
  password: string
  maxWorkerWaitMs: number
  pollIntervalMs: number
}

interface AcceptanceDependencies {
  fetchImpl?: FetchLike
  sleep?: (milliseconds: number) => Promise<void>
  emit?: (line: string) => void
}

interface JsonResponse {
  response: Response
  body: Record<string, unknown>
}

export class HistorianQaAcceptanceError extends Error {
  readonly code: string
  readonly status?: number

  constructor(code: string, status?: number) {
    super(code)
    this.name = 'HistorianQaAcceptanceError'
    this.code = code
    this.status = status
  }
}

function integerFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function loadHistorianQaAcceptanceConfig(
  environment: NodeJS.ProcessEnv = process.env,
): HistorianQaAcceptanceConfig {
  return {
    enabled: environment.HISTORIAN_QA_ACCEPTANCE_ENABLED === 'true',
    dataClass: environment.HISTORIAN_QA_DATA_CLASS || '',
    appOrigin: environment.HISTORIAN_QA_APP_ORIGIN || '',
    cognitoClientId: environment.HISTORIAN_QA_COGNITO_CLIENT_ID || '',
    cognitoRegion: environment.HISTORIAN_QA_COGNITO_REGION || '',
    username: environment.QA_USERNAME || '',
    password: environment.QA_PASSWORD || '',
    maxWorkerWaitMs: integerFromEnv(
      environment.HISTORIAN_QA_WORKER_WAIT_MS,
      12 * 60 * 1000,
    ),
    pollIntervalMs: integerFromEnv(
      environment.HISTORIAN_QA_POLL_INTERVAL_MS,
      10 * 1000,
    ),
  }
}

export function assertHistorianQaAcceptanceConfig(
  config: HistorianQaAcceptanceConfig,
): void {
  if (!config.enabled) throw new HistorianQaAcceptanceError('QA_ACCEPTANCE_DISABLED')
  if (config.dataClass !== 'synthetic-only') {
    throw new HistorianQaAcceptanceError('QA_DATA_CLASS_MISMATCH')
  }
  if (config.appOrigin !== QA_APP_ORIGIN) {
    throw new HistorianQaAcceptanceError('QA_ORIGIN_MISMATCH')
  }
  if (config.cognitoClientId !== QA_COGNITO_CLIENT_ID) {
    throw new HistorianQaAcceptanceError('QA_COGNITO_CLIENT_MISMATCH')
  }
  if (config.cognitoRegion !== QA_COGNITO_REGION) {
    throw new HistorianQaAcceptanceError('QA_COGNITO_REGION_MISMATCH')
  }
  if (config.username !== QA_USERNAME || !config.password) {
    throw new HistorianQaAcceptanceError('QA_MACHINE_CREDENTIAL_UNAVAILABLE')
  }
  if (config.maxWorkerWaitMs > 15 * 60 * 1000) {
    throw new HistorianQaAcceptanceError('QA_WORKER_WAIT_TOO_LONG')
  }
  if (config.pollIntervalMs > 60 * 1000) {
    throw new HistorianQaAcceptanceError('QA_POLL_INTERVAL_TOO_LONG')
  }
}

function pass(emit: (line: string) => void, gate: string): void {
  emit(`HISTORIAN_QA_GATE PASS ${gate}`)
}

async function jsonRequest(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  failureCode: string,
): Promise<JsonResponse> {
  let response: Response
  try {
    response = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new HistorianQaAcceptanceError(`${failureCode}_NETWORK`)
  }

  let body: Record<string, unknown> = {}
  try {
    body = await response.json() as Record<string, unknown>
  } catch {
    // Response bodies can carry credentials or clinical text. Never include
    // them in an exception or build log; status and a fixed code are enough.
  }
  return { response, body }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function expectStatus(
  result: JsonResponse,
  expected: number,
  code: string,
): void {
  if (result.response.status !== expected) {
    throw new HistorianQaAcceptanceError(code, result.response.status)
  }
}

function cookieFromSetCookie(setCookie: string | null, name: string): string | null {
  if (!setCookie) return null
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = setCookie.match(new RegExp(`(?:^|,\\s*)${escaped}=([^;]+)`))
  return match?.[1] || null
}

function bearerFromInvitationUrl(urlValue: unknown): string {
  if (typeof urlValue !== 'string') {
    throw new HistorianQaAcceptanceError('INVITATION_URL_MISSING')
  }
  const invitationUrl = new URL(urlValue)
  if (
    invitationUrl.origin !== QA_APP_ORIGIN ||
    invitationUrl.pathname !== '/patient/historian/invite' ||
    invitationUrl.search ||
    !invitationUrl.hash.startsWith('#token=')
  ) {
    throw new HistorianQaAcceptanceError('INVITATION_URL_BOUNDARY_FAILED')
  }
  const token = new URLSearchParams(invitationUrl.hash.slice(1)).get('token')
  if (!token) throw new HistorianQaAcceptanceError('INVITATION_TOKEN_MISSING')
  return token
}

function clinicianCookie(idToken: string): string {
  return `id_token=${idToken}`
}

function patientCookie(grant: string): string {
  return `historian_patient_grant=${grant}`
}

function appHeaders(cookie?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Origin: QA_APP_ORIGIN,
    ...(cookie ? { Cookie: cookie } : {}),
  }
}

function completeSyntheticV2Evidence(): {
  state: PatientEvidenceState
  transcript: HistorianTranscriptEntry[]
} {
  let state = createPatientEvidenceState()
  const transcript: HistorianTranscriptEntry[] = []
  let seq = 1

  while (patientEvidenceCompletion(state) === 'incomplete') {
    const approved = approveNextPatientEvidenceQuestion(state)
    if (!approved.ok || !approved.value) {
      throw new HistorianQaAcceptanceError('V2_FIXTURE_APPROVAL_FAILED')
    }
    state = approved.value.state

    const committed = commitApprovedPatientEvidenceQuestion(
      state,
      seq,
      approved.value.questionText,
    )
    if (!committed.ok || !committed.value) {
      throw new HistorianQaAcceptanceError('V2_FIXTURE_COMMIT_FAILED')
    }
    state = committed.value
    transcript.push({
      role: 'assistant',
      text: approved.value.questionText,
      timestamp: seq,
      seq,
    })
    seq += 1

    const patientEntry: HistorianTranscriptEntry = {
      role: 'user',
      text: syntheticPatientAnswer(approved.value.obligation.id),
      timestamp: seq,
      seq,
    }
    transcript.push(patientEntry)
    const collected = collectPatientEvidenceEntry(state, patientEntry)
    if (!collected.ok || !collected.value) {
      throw new HistorianQaAcceptanceError('V2_FIXTURE_COLLECTION_FAILED')
    }
    state = collected.value

    const settled = settlePatientEvidenceAnswer(state, transcript)
    if (!settled.ok || !settled.value) {
      throw new HistorianQaAcceptanceError('V2_FIXTURE_SETTLEMENT_FAILED')
    }
    state = settled.value
    seq += 1
  }

  if (patientEvidenceCompletion(state) !== 'coverage_complete') {
    throw new HistorianQaAcceptanceError('V2_FIXTURE_COMPLETION_FAILED')
  }
  return { state, transcript }
}

function fixedSaveBody(sessionId: string): Record<string, unknown> {
  const fixture = completeSyntheticV2Evidence()
  return {
    sessionId,
    structured_output: {
      chief_complaint: 'Synthetic recurrent headache history',
      hpi: 'Synthetic fixed-fixture history for persistence acceptance only.',
      age_years_patient_reported: 45,
      interview_mode: 'comprehensive',
      interview_prompt_version: 'comprehensive-v2',
      history_evidence_v1: fixture.state,
      // Deliberately forged empty model coverage. The deployed save boundary
      // must replace this with coverage derived from the transcript ledger.
      history_coverage: {
        covered_domains: [],
        missing_or_uncertain: [],
      },
    },
    narrative_summary:
      'SYNTHETIC TEST DATA - NOT FOR CLINICAL CARE. Transcript-grounded v2 persistence acceptance.',
    transcript: fixture.transcript,
    red_flags: [],
    safety_escalated: false,
    duration_seconds: fixture.state.records.length * 5,
    question_count: fixture.state.records.length,
    interview_completion_status: 'complete',
    interview_termination_reason: 'coverage_complete',
  }
}

export async function runHistorianQaAcceptance(
  config: HistorianQaAcceptanceConfig,
  dependencies: AcceptanceDependencies = {},
): Promise<{ gates: number; evaluationStatus: 'completed' }> {
  assertHistorianQaAcceptanceConfig(config)

  const fetchImpl = dependencies.fetchImpl || fetch
  const sleep = dependencies.sleep || ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  const emit = dependencies.emit || console.log
  let gateCount = 0
  const gate = (name: string) => {
    gateCount += 1
    pass(emit, name)
  }

  const unauthenticatedReport = await jsonRequest(
    fetchImpl,
    `${QA_APP_ORIGIN}/api/ai/historian/save?patient_id=${FIXTURE.patientId}`,
    { method: 'GET', headers: { Origin: QA_APP_ORIGIN } },
    'UNAUTHENTICATED_REPORT_CHECK_FAILED',
  )
  expectStatus(unauthenticatedReport, 401, 'UNAUTHENTICATED_REPORT_NOT_DENIED')
  gate('unauthenticated_physician_report_denied')

  const cognito = await jsonRequest(
    fetchImpl,
    `https://cognito-idp.${QA_COGNITO_REGION}.amazonaws.com/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: QA_COGNITO_CLIENT_ID,
        AuthParameters: {
          USERNAME: config.username,
          PASSWORD: config.password,
        },
      }),
    },
    'COGNITO_AUTH_FAILED',
  )
  expectStatus(cognito, 200, 'COGNITO_AUTH_REJECTED')
  const authenticationResult = isRecord(cognito.body.AuthenticationResult)
    ? cognito.body.AuthenticationResult
    : null
  const idToken = authenticationResult?.IdToken
  if (typeof idToken !== 'string' || !idToken) {
    throw new HistorianQaAcceptanceError('COGNITO_ID_TOKEN_MISSING')
  }
  gate('server_side_cognito_auth')

  const clinicalCookie = clinicianCookie(idToken)
  const invitation = await jsonRequest(
    fetchImpl,
    `${QA_APP_ORIGIN}/api/ai/historian/invites`,
    {
      method: 'POST',
      headers: appHeaders(clinicalCookie),
      body: JSON.stringify({ consultId: FIXTURE.consultId, replaceActive: true }),
    },
    'INVITATION_CREATE_FAILED',
  )
  expectStatus(invitation, 200, 'INVITATION_CREATE_REJECTED')
  const invitationPayload = isRecord(invitation.body.invitation)
    ? invitation.body.invitation
    : null
  const invitationToken = bearerFromInvitationUrl(invitationPayload?.url)
  const expectedSessionId = invitationPayload?.sessionId
  if (typeof expectedSessionId !== 'string' || !expectedSessionId) {
    throw new HistorianQaAcceptanceError('INVITATION_SESSION_ID_MISSING')
  }
  gate('clinician_invitation_created')

  const wrongOrigin = await jsonRequest(
    fetchImpl,
    `${QA_APP_ORIGIN}/api/ai/historian/invites/redeem`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://app.neuroplans.app',
      },
      body: JSON.stringify({
        token: invitationToken,
        dateOfBirth: FIXTURE.dateOfBirth,
      }),
    },
    'WRONG_ORIGIN_CHECK_FAILED',
  )
  expectStatus(wrongOrigin, 403, 'WRONG_ORIGIN_NOT_DENIED')
  gate('production_origin_denied')

  const wrongDob = await jsonRequest(
    fetchImpl,
    `${QA_APP_ORIGIN}/api/ai/historian/invites/redeem`,
    {
      method: 'POST',
      headers: appHeaders(),
      body: JSON.stringify({
        token: invitationToken,
        dateOfBirth: FIXTURE.wrongDateOfBirth,
      }),
    },
    'WRONG_DOB_CHECK_FAILED',
  )
  expectStatus(wrongDob, 401, 'WRONG_DOB_NOT_DENIED')
  gate('wrong_dob_denied')

  const redeemed = await jsonRequest(
    fetchImpl,
    `${QA_APP_ORIGIN}/api/ai/historian/invites/redeem`,
    {
      method: 'POST',
      headers: appHeaders(),
      body: JSON.stringify({
        token: invitationToken,
        dateOfBirth: FIXTURE.dateOfBirth,
      }),
    },
    'CORRECT_DOB_REDEEM_FAILED',
  )
  expectStatus(redeemed, 200, 'CORRECT_DOB_REDEEM_REJECTED')
  const setCookie = redeemed.response.headers.get('set-cookie')
  const patientGrant = cookieFromSetCookie(setCookie, 'historian_patient_grant')
  const normalizedSetCookie = (setCookie || '').toLowerCase()
  if (
    !patientGrant ||
    !normalizedSetCookie.includes('httponly') ||
    !normalizedSetCookie.includes('secure') ||
    !normalizedSetCookie.includes('samesite=strict')
  ) {
    throw new HistorianQaAcceptanceError('PATIENT_GRANT_COOKIE_INVALID')
  }
  gate('correct_dob_secure_grant')

  const grantedCookie = patientCookie(patientGrant)
  const publicContext = await jsonRequest(
    fetchImpl,
    `${QA_APP_ORIGIN}/api/ai/historian/invites/context`,
    { method: 'GET', headers: appHeaders(grantedCookie) },
    'PATIENT_CONTEXT_FAILED',
  )
  expectStatus(publicContext, 200, 'PATIENT_CONTEXT_REJECTED')
  const publicContextText = JSON.stringify(publicContext.body).toLowerCase()
  if (
    publicContextText.includes('differential') ||
    publicContextText.includes('diagnosis') ||
    !publicContext.response.headers.get('cache-control')?.includes('no-store')
  ) {
    throw new HistorianQaAcceptanceError('PATIENT_CONTEXT_BOUNDARY_FAILED')
  }
  gate('patient_context_non_diagnostic_no_store')

  const session = await jsonRequest(
    fetchImpl,
    `${QA_APP_ORIGIN}/api/ai/historian/session`,
    {
      method: 'POST',
      headers: appHeaders(grantedCookie),
      body: JSON.stringify({ sessionType: 'new_patient', interviewMode: 'comprehensive' }),
    },
    'PATIENT_SESSION_START_FAILED',
  )
  expectStatus(session, 200, 'PATIENT_SESSION_START_REJECTED')
  if (
    session.body.sessionId !== expectedSessionId ||
    session.body.provider !== 'nova' ||
    session.body.interviewMode !== 'comprehensive' ||
    session.body.interviewPromptVersion !== 'comprehensive-v2' ||
    session.body.turnEvidenceController !== true
  ) {
    throw new HistorianQaAcceptanceError('PATIENT_SESSION_BINDING_FAILED')
  }
  gate('invited_nova_session_bound')

  const saveBody = fixedSaveBody(expectedSessionId)
  const saved = await jsonRequest(
    fetchImpl,
    `${QA_APP_ORIGIN}/api/ai/historian/save`,
    {
      method: 'POST',
      headers: appHeaders(grantedCookie),
      body: JSON.stringify(saveBody),
    },
    'TRANSACTIONAL_SAVE_FAILED',
  )
  expectStatus(saved, 200, 'TRANSACTIONAL_SAVE_REJECTED')
  const savedSession = isRecord(saved.body.session) ? saved.body.session : null
  if (
    savedSession?.id !== expectedSessionId ||
    saved.body.consult_id !== FIXTURE.consultId ||
    saved.body.evaluation_status !== 'pending' ||
    saved.body.replayed !== false
  ) {
    throw new HistorianQaAcceptanceError('TRANSACTIONAL_SAVE_RECEIPT_INVALID')
  }
  gate('state_injected_transactional_save')

  const replayed = await jsonRequest(
    fetchImpl,
    `${QA_APP_ORIGIN}/api/ai/historian/save`,
    {
      method: 'POST',
      headers: appHeaders(grantedCookie),
      body: JSON.stringify(saveBody),
    },
    'SAVE_REPLAY_FAILED',
  )
  expectStatus(replayed, 200, 'SAVE_REPLAY_REJECTED')
  const replayedSession = isRecord(replayed.body.session) ? replayed.body.session : null
  if (
    replayedSession?.id !== expectedSessionId ||
    replayed.body.replayed !== true ||
    replayed.body.evaluation_status !== 'already_queued'
  ) {
    throw new HistorianQaAcceptanceError('SAVE_REPLAY_RECEIPT_INVALID')
  }
  gate('idempotent_save_replay')

  const deadline = Date.now() + config.maxWorkerWaitMs
  let evaluationStatus = ''
  while (Date.now() < deadline) {
    const status = await jsonRequest(
      fetchImpl,
      `${QA_APP_ORIGIN}/api/ai/historian/invites?consultId=${FIXTURE.consultId}`,
      { method: 'GET', headers: appHeaders(clinicalCookie) },
      'EVALUATION_STATUS_FAILED',
    )
    expectStatus(status, 200, 'EVALUATION_STATUS_REJECTED')
    const statusInvitation = isRecord(status.body.invitation)
      ? status.body.invitation
      : null
    if (statusInvitation?.session_id !== expectedSessionId) {
      throw new HistorianQaAcceptanceError('EVALUATION_SESSION_BINDING_FAILED')
    }
    evaluationStatus = typeof statusInvitation.evaluation_status === 'string'
      ? statusInvitation.evaluation_status
      : ''
    if (evaluationStatus === 'completed') break
    if (evaluationStatus === 'failed') {
      throw new HistorianQaAcceptanceError('DURABLE_WORKER_FAILED')
    }
    await sleep(config.pollIntervalMs)
  }
  if (evaluationStatus !== 'completed') {
    throw new HistorianQaAcceptanceError('DURABLE_WORKER_TIMEOUT')
  }
  gate('durable_worker_completed')

  const report = await jsonRequest(
    fetchImpl,
    `${QA_APP_ORIGIN}/api/ai/historian/save?patient_id=${FIXTURE.patientId}`,
    { method: 'GET', headers: appHeaders(clinicalCookie) },
    'PHYSICIAN_REPORT_FAILED',
  )
  expectStatus(report, 200, 'PHYSICIAN_REPORT_REJECTED')
  const matchingSession = Array.isArray(report.body.sessions)
    ? report.body.sessions.find((candidate: unknown) =>
      isRecord(candidate) && candidate.id === expectedSessionId)
    : null
  if (
    !matchingSession ||
    matchingSession.patient_id !== FIXTURE.patientId ||
    matchingSession.tenant_id !== FIXTURE.tenantId ||
    matchingSession.consult_id !== FIXTURE.consultId ||
    matchingSession.interview_prompt_version !== 'comprehensive-v2' ||
    matchingSession.interview_completion_status !== 'complete' ||
    matchingSession.interview_termination_reason !== 'coverage_complete' ||
    matchingSession.evaluation_status !== 'completed' ||
    !matchingSession.final_differential ||
    !report.response.headers.get('cache-control')?.includes('no-store')
  ) {
    throw new HistorianQaAcceptanceError('PHYSICIAN_REPORT_CONTENT_INVALID')
  }
  gate('authenticated_physician_report_with_differential')

  emit(
    'HISTORIAN_QA_ACCEPTANCE_PASS mode=v2_transcript_grounded_state_injected_persistence worker=completed physician_report=visible',
  )
  return { gates: gateCount, evaluationStatus: 'completed' }
}

async function main(): Promise<void> {
  const config = loadHistorianQaAcceptanceConfig()
  // Minimize the lifetime of secret-bearing environment variables. The local
  // copies remain process-memory-only and are never interpolated into logs.
  delete process.env.QA_USERNAME
  delete process.env.QA_PASSWORD
  try {
    await runHistorianQaAcceptance(config)
  } catch (error) {
    const safeError = error instanceof HistorianQaAcceptanceError
      ? error
      : new HistorianQaAcceptanceError('UNEXPECTED_ACCEPTANCE_FAILURE')
    console.error(
      `HISTORIAN_QA_ACCEPTANCE_FAIL code=${safeError.code}` +
        (safeError.status ? ` status=${safeError.status}` : ''),
    )
    process.exitCode = 1
  }
}

if (process.argv[1]?.endsWith('historian-qa-deployed-acceptance.ts')) {
  void main()
}
