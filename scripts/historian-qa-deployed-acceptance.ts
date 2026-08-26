import type { HistorianTranscriptEntry } from '../src/lib/historianTypes'
import {
  LIVE_INTERVIEW_REVIEW_V2_PROMPT_VERSION,
  LIVE_REVIEW_DEPTH_DIMENSIONS,
  liveInterviewReviewCompletion,
  parseLiveInterviewReviewArtifact,
  type LiveInterviewReviewArtifactV2,
} from '../src/lib/historian/liveReviewContract'
import {
  CLINICIAN_HISTORY_REPORT_PROMPT_VERSION,
  CLINICIAN_HISTORY_REQUIRED_COMPLETE_SECTION_IDS,
  CLINICIAN_HISTORY_SECTION_IDS,
} from '../src/lib/historian/eval/clinicianHistoryReport'
import {
  ADAPTIVE_OPENING_QUESTION,
  ADAPTIVE_PRE_CLOSE_QUESTION,
} from '../src/lib/historian/adaptiveQuestionContract'
import {
  MEDICATION_INVENTORY_QUESTION,
  MEDICATION_RECONCILIATION_VERSION,
} from '../src/lib/historian/medicationReconciliation'

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

export function assertInvitedV4SessionBinding(
  body: Record<string, unknown>,
  expectedSessionId: string,
): void {
  const checks: Array<[boolean, string]> = [
    [body.sessionId === expectedSessionId, 'PATIENT_SESSION_ID_MISMATCH'],
    [body.provider === 'nova', 'PATIENT_SESSION_PROVIDER_MISMATCH'],
    [body.interviewMode === 'comprehensive', 'PATIENT_SESSION_MODE_MISMATCH'],
    [body.interviewPromptVersion === 'comprehensive-v4', 'PATIENT_SESSION_PROMPT_MISMATCH'],
    [body.turnEvidenceController === false, 'PATIENT_SESSION_EVIDENCE_CONTROLLER_MISMATCH'],
    [body.adaptiveTurnController === true, 'PATIENT_SESSION_ADAPTIVE_CONTROLLER_MISMATCH'],
  ]
  const failed = checks.find(([matches]) => !matches)
  if (failed) throw new HistorianQaAcceptanceError(failed[1])
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

function completeSyntheticAdaptiveTranscript(): HistorianTranscriptEntry[] {
  const turns: Array<[question: string, answer: string]> = [
    [
      ADAPTIVE_OPENING_QUESTION,
      'This is synthetic test data only. I was referred for recurrent headaches with light sensitivity that began six months ago and now occur twice a week.',
    ],
    ['How old are you?', 'I am 45 years old.'],
    [
      'Please describe a typical headache from beginning to end?',
      'Each headache begins gradually over about 30 minutes, stays over the right temple without switching sides, feels throbbing, reaches seven out of ten, and lasts four to six hours. They increased from about once a month to twice a week over six months, and I feel completely normal between attacks.',
    ],
    [
      'What other symptoms come with the headaches?',
      'I have nausea, sensitivity to light and sound, and worse pain with routine movement. I have no vomiting, visual zigzags or blind spots, spreading tingling, speech change, eye redness, tearing, eyelid droop, nasal symptoms, restlessness, scalp tenderness, jaw pain, fever, or neck stiffness.',
    ],
    [
      'Is there a pattern, warning, trigger, or activity relationship?',
      'There is no warning aura. Missed meals and poor sleep sometimes precede an attack, but standing, lying down, coughing, straining, exercise, and sexual activity do not trigger it. It does not wake me from sleep and is not limited to a particular time of day.',
    ],
    [
      'Have you noticed any warning signs or urgent neurologic symptoms?',
      'No sudden thunderclap onset, head injury, positional or exertional trigger, pregnancy, cancer, immune suppression, fainting, seizure, weakness, numbness, speech change, vision loss, or trouble walking.',
    ],
    [
      'Have you had similar episodes before?',
      'In college I had a mild bilateral pressure headache once or twice a year after late nights. It resolved after sleep, had no nausea or light sensitivity, and was never evaluated. I had no recurring headaches after college until this distinct pattern began six months ago. I now miss about one work afternoon each week and sometimes cancel family activities.',
    ],
    [
      'Do you have any other neurologic symptoms between headaches?',
      'Between headaches I have no persistent weakness, numbness, tremor, memory change, double vision, speech or swallowing trouble, dizziness, balance difficulty, or loss of consciousness.',
    ],
    [
      'What is your medical and surgical history?',
      'I report no chronic medical conditions, hospitalizations, or prior surgeries.',
    ],
    [
      MEDICATION_INVENTORY_QUESTION,
      'I take no prescription, over-the-counter, or supplement medications, so there are no adherence problems or medication side effects to report.',
    ],
    [
      'What have you tried for the headaches, and what effect did it have?',
      'I have tried drinking water, sleeping, and resting in a dark quiet room. The dark room helps somewhat, but the headache still lasts four to six hours. I have not tried pain relievers or prescription treatments.',
    ],
    [
      'Do you have any allergies or prior allergic reactions?',
      'I report no drug, food, or environmental allergies and no prior allergic reactions. My mother had recurrent headaches, and there is no known family seizure, stroke at a young age, or inherited neurologic disease.',
    ],
    [
      'Tell me about your living situation and daily habits?',
      'I live with my spouse, work in an office, and am independent. I report no tobacco, alcohol, recreational drugs, recent travel, tick exposure, toxic exposure, or major sleep deprivation.',
    ],
    [
      ADAPTIVE_PRE_CLOSE_QUESTION,
      'I recall a normal eye examination but no brain imaging, EEG, or spinal tap. I want the neurologist to clarify why the headaches changed and discuss safe next steps; I have no other questions today.',
    ],
  ]
  return turns.flatMap(([question, answer], index) => {
    const assistantSeq = index * 2 + 1
    const patientSeq = assistantSeq + 1
    return [
      { role: 'assistant' as const, text: question, timestamp: assistantSeq, seq: assistantSeq },
      { role: 'user' as const, text: answer, timestamp: patientSeq, seq: patientSeq },
    ]
  })
}

function fixedSaveBody(
  sessionId: string,
  transcript: HistorianTranscriptEntry[],
  liveReview: LiveInterviewReviewArtifactV2,
): Record<string, unknown> {
  const terminationReason = liveInterviewReviewCompletion(liveReview.review)
  if (terminationReason === 'incomplete') {
    throw new HistorianQaAcceptanceError('LIVE_REVIEW_NOT_READY')
  }
  return {
    sessionId,
    structured_output: {
      chief_complaint: 'Synthetic recurrent headache history',
      hpi: 'Synthetic comprehensive-v4 fixture history for persistence acceptance only.',
      age_years_patient_reported: 45,
      interview_mode: 'comprehensive',
      interview_prompt_version: 'comprehensive-v4',
      live_review_v2: liveReview,
      medication_reconciliation_v1: {
        version: MEDICATION_RECONCILIATION_VERSION,
        items: [],
        inventoryStatus: 'answered',
        inventoryPatientSeq: 20,
        pendingQuestion: null,
        medicationNameClarificationCount: 0,
        clinicalMedicationQuestionCount: 1,
      },
      // Deliberately forged empty client coverage. The deployed save boundary
      // must replace this with coverage derived from the attested review.
      history_coverage: {
        covered_domains: [],
        missing_or_uncertain: [],
      },
    },
    transcript,
    red_flags: [],
    safety_escalated: false,
    duration_seconds: transcript.length * 3,
    question_count: transcript.filter((entry) => entry.role === 'assistant').length,
    interview_completion_status: 'complete',
    interview_termination_reason: terminationReason,
  }
}

function assertGroundedClinicianReport(
  raw: unknown,
  transcript: HistorianTranscriptEntry[],
): void {
  const patientTurnCount = transcript.filter((entry) => entry.role === 'user').length
  if (!isRecord(raw) || raw.version !== 1 || raw.report_status !== 'complete' ||
    typeof raw.input_digest !== 'string' || !/^[0-9a-f]{64}$/.test(raw.input_digest) ||
    !Array.isArray(raw.sections) || raw.sections.length !== CLINICIAN_HISTORY_SECTION_IDS.length ||
    !isRecord(raw.provenance) || raw.provenance.prompt_version !== CLINICIAN_HISTORY_REPORT_PROMPT_VERSION ||
    !isRecord(raw.completion) || raw.completion.patient_turn_count !== patientTurnCount ||
    !isRecord(raw.medication_reconciliation) || !Array.isArray(raw.medication_reconciliation.items)
  ) throw new HistorianQaAcceptanceError('CLINICIAN_REPORT_SCHEMA_INVALID')

  const patientTurns = new Map(
    transcript.filter((entry) => entry.role === 'user').map((entry) => [entry.seq, entry.text]),
  )
  const sectionIds = raw.sections.map((section) => isRecord(section) ? section.id : null)
  if (new Set(sectionIds).size !== CLINICIAN_HISTORY_SECTION_IDS.length ||
    !CLINICIAN_HISTORY_SECTION_IDS.every((id) => sectionIds.includes(id))) {
    throw new HistorianQaAcceptanceError('CLINICIAN_REPORT_SECTIONS_INVALID')
  }
  const sectionsById = new Map(raw.sections.map((section) => (
    isRecord(section) && typeof section.id === 'string' ? [section.id, section] : [null, null]
  )))
  if (CLINICIAN_HISTORY_REQUIRED_COMPLETE_SECTION_IDS.some((id) => {
    const section = sectionsById.get(id)
    return !isRecord(section) || !Array.isArray(section.claims) || section.claims.length === 0
  })) throw new HistorianQaAcceptanceError('CLINICIAN_REPORT_CORE_SECTIONS_EMPTY')
  for (const section of raw.sections) {
    if (!isRecord(section) || !Array.isArray(section.claims)) {
      throw new HistorianQaAcceptanceError('CLINICIAN_REPORT_CLAIMS_INVALID')
    }
    for (const claim of section.claims) {
      if (!isRecord(claim) || typeof claim.text !== 'string' || !Array.isArray(claim.citations) ||
        claim.citations.length === 0) {
        throw new HistorianQaAcceptanceError('CLINICIAN_REPORT_CLAIMS_INVALID')
      }
      const exact = claim.citations.some((citation) => isRecord(citation) &&
        typeof citation.patient_seq === 'number' && typeof citation.quote === 'string' &&
        patientTurns.get(citation.patient_seq)?.includes(citation.quote) &&
        claim.text === citation.quote)
      if (!exact) throw new HistorianQaAcceptanceError('CLINICIAN_REPORT_GROUNDING_INVALID')
    }
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
  if (invitationPayload?.interviewPromptVersion !== 'comprehensive-v4') {
    throw new HistorianQaAcceptanceError('INVITATION_PROMPT_MISMATCH')
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
  assertInvitedV4SessionBinding(session.body, expectedSessionId)
  gate('invited_nova_session_bound')

  const flushToken = session.body.flushToken
  if (typeof flushToken !== 'string' || !flushToken) {
    throw new HistorianQaAcceptanceError('LIVE_REVIEW_AUTHORITY_MISSING')
  }
  const transcript = completeSyntheticAdaptiveTranscript()
  const reviewed = await jsonRequest(
    fetchImpl,
    `${QA_APP_ORIGIN}/api/ai/historian/live-review`,
    {
      method: 'POST',
      headers: {
        ...appHeaders(grantedCookie),
        Authorization: `Bearer ${flushToken}`,
      },
      body: JSON.stringify({ sessionId: expectedSessionId, transcript }),
    },
    'LIVE_REVIEW_FAILED',
  )
  expectStatus(reviewed, 200, 'LIVE_REVIEW_REJECTED')
  let liveReview: LiveInterviewReviewArtifactV2
  try {
    const parsed = parseLiveInterviewReviewArtifact(reviewed.body, transcript)
    if (
      parsed.review.version !== 2 ||
      parsed.provenance.promptVersion !== LIVE_INTERVIEW_REVIEW_V2_PROMPT_VERSION ||
      parsed.review.diagnosticDepth.dimensions.length !== LIVE_REVIEW_DEPTH_DIMENSIONS.length
    ) throw new Error('wrong review version or depth contract')
    liveReview = parsed
  } catch {
    throw new HistorianQaAcceptanceError('LIVE_REVIEW_ARTIFACT_INVALID')
  }
  if (!liveReview.review.readyToClose || !liveReview.review.diagnosticDepth.depthSufficient) {
    emit([
      'HISTORIAN_QA_DIAGNOSTIC live_review',
      `ready_to_close=${liveReview.review.readyToClose}`,
      `depth_sufficient=${liveReview.review.diagnosticDepth.depthSufficient}`,
      `missing_domains=${liveReview.review.domains.filter((item) => item.status === 'missing').length}`,
      `uncertain_domains=${liveReview.review.domains.filter((item) => item.status === 'uncertain').length}`,
      `critical_gaps=${liveReview.review.criticalGaps.length}`,
      `critical_gap_domains=${[...new Set(liveReview.review.criticalGaps.map((item) => item.domain))].sort().join(',') || 'none'}`,
      `missing_depth=${liveReview.review.diagnosticDepth.dimensions.filter((item) => item.status === 'missing').length}`,
      `missing_depth_dimensions=${liveReview.review.diagnosticDepth.dimensions.filter((item) => item.status === 'missing').map((item) => item.dimension).sort().join(',') || 'none'}`,
      `uncertain_depth=${liveReview.review.diagnosticDepth.dimensions.filter((item) => item.status === 'uncertain').length}`,
      `uncertain_depth_dimensions=${liveReview.review.diagnosticDepth.dimensions.filter((item) => item.status === 'uncertain').map((item) => item.dimension).sort().join(',') || 'none'}`,
      `confidence=${liveReview.review.confidence}`,
      `next_intents=${liveReview.review.nextQuestionIntents.length}`,
    ].join(' '))
  }
  const expectedTerminationReason = liveInterviewReviewCompletion(liveReview.review)
  if (expectedTerminationReason === 'incomplete') {
    throw new HistorianQaAcceptanceError('LIVE_REVIEW_NOT_READY')
  }
  gate('independent_live_review_attested')

  const saveBody = fixedSaveBody(expectedSessionId, transcript, liveReview)
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
    if (evaluationStatus === 'completed') {
      if (
        statusInvitation.report_ready !== true ||
        statusInvitation.differential_ready !== true ||
        statusInvitation.evaluation_stage !== 'completed'
      ) throw new HistorianQaAcceptanceError('DURABLE_WORKER_ARTIFACTS_NOT_READY')
      break
    }
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
    matchingSession.interview_prompt_version !== 'comprehensive-v4' ||
    matchingSession.interview_completion_status !== 'complete' ||
    matchingSession.interview_termination_reason !== expectedTerminationReason ||
    matchingSession.evaluation_status !== 'completed' ||
    !isRecord(matchingSession.diagnostic_sufficiency) ||
    matchingSession.diagnostic_sufficiency.outcome !== 'sufficient' ||
    matchingSession.diagnostic_sufficiency.ddx_allowed !== true ||
    matchingSession.diagnostic_sufficiency.patient_turn_count !==
      transcript.filter((entry) => entry.role === 'user').length ||
    !isRecord(matchingSession.final_differential) ||
    !Array.isArray(matchingSession.final_differential.differential) ||
    matchingSession.final_differential.differential.length === 0 ||
    !report.response.headers.get('cache-control')?.includes('no-store')
  ) {
    throw new HistorianQaAcceptanceError('PHYSICIAN_REPORT_CONTENT_INVALID')
  }
  assertGroundedClinicianReport(matchingSession.clinician_history_report, transcript)
  gate('authenticated_citation_grounded_clinician_report')
  gate('diagnostically_sufficient_physician_differential')

  emit(
    'HISTORIAN_QA_ACCEPTANCE_PASS mode=v4_diagnostic_depth_state_injected_persistence worker=completed grounded_report=visible differential=permitted',
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
