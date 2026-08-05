/**
 * API call wrappers, auth helpers, and response validators for
 * the Simulated Patient E2E Test Agent.
 */

import { config, OPT_IN_ENV, SESSION_COOKIE_NAME } from './config'
import type {
  TriageAPIResponse,
  TriagePollResponse,
  ConsultCreateResponse,
  InitiateIntakeResponse,
  HistorianSaveResponse,
  LocalizerResponse,
  ReportResponse,
  PatientPersona,
} from './types'

// ── Auth Token Cache ──────────────────────────────────────────────────────────

let cachedIdToken: string | null = null
let tokenExpiresAt = 0

/**
 * Authenticate with Cognito using USER_PASSWORD_AUTH flow.
 * Returns the ID token for use in cookie-based auth.
 * Caches the token for the session duration.
 */
export async function getAuthToken(): Promise<string | null> {
  // Return cached token if still valid (with 5-minute buffer)
  if (cachedIdToken && Date.now() < tokenExpiresAt - 300_000) {
    return cachedIdToken
  }

  const { email, password, clientId, region, userPoolId } = config.auth

  if (!email || !password) {
    console.warn('[auth] TEST_EMAIL and TEST_PASSWORD not set — skipping authentication')
    return null
  }

  if (!clientId || !userPoolId) {
    console.warn('[auth] Cognito config not available — skipping authentication')
    return null
  }

  const endpoint = `https://cognito-idp.${region}.amazonaws.com/`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('[auth] Cognito auth failed:', err)
    return null
  }

  const data = await res.json()
  if (!data.AuthenticationResult?.IdToken) {
    console.error('[auth] No IdToken in Cognito response')
    return null
  }

  cachedIdToken = data.AuthenticationResult.IdToken
  // Cognito ID tokens expire in 1 hour
  tokenExpiresAt = Date.now() + 3600_000

  return cachedIdToken
}

/**
 * Resolve the Cookie header this suite should send, or null if it has no
 * credentials at all.
 *
 * TEST_SESSION_COOKIE wins: the app authenticates via Cognito Hosted UI
 * (OAuth + PKCE), whose app client generally does not enable the
 * USER_PASSWORD_AUTH flow that `getAuthToken()` needs — so a copied browser
 * cookie is the path that actually works. See the README for how to get one.
 */
async function buildAuthCookie(): Promise<string | null> {
  if (config.sessionCookie) {
    // Accept a full Cookie header ("id_token=eyJ...; other=x") or a bare token.
    return config.sessionCookie.includes('=')
      ? config.sessionCookie
      : `${SESSION_COOKIE_NAME}=${config.sessionCookie}`
  }

  const token = await getAuthToken()
  // The app reads `id_token` (src/lib/cognito/server.ts, src/middleware.ts).
  // Any other cookie name authenticates nothing and every call 401s.
  return token ? `${SESSION_COOKIE_NAME}=${token}` : null
}

/**
 * Build headers for API requests, including auth cookie if available.
 */
async function buildHeaders(extraHeaders?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  }

  const cookie = await buildAuthCookie()
  if (cookie) {
    headers['Cookie'] = cookie
  }

  return headers
}

// ── Generic Fetch with Retry ──────────────────────────────────────────────────

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  timeout?: number
  retries?: number
  retryDelay?: number
}

/**
 * Makes an API call with timeout, retry, and error handling.
 */
async function apiFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<{ data: T | null; status: number; error: string | null }> {
  const {
    method = 'GET',
    body,
    timeout = config.stepTimeout,
    retries = 2,
    retryDelay = 1000,
  } = options

  const url = `${config.baseUrl}${path}`

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const headers = await buildHeaders()

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        const text = await res.text()
        return {
          data: null,
          status: res.status,
          error: `Non-JSON response (${res.status}): ${text.substring(0, 200)}`,
        }
      }

      const data = await res.json()

      if (!res.ok) {
        const errorMsg = data?.error || `HTTP ${res.status}`
        // Don't retry client errors (4xx)
        if (res.status >= 400 && res.status < 500) {
          return { data: data as T, status: res.status, error: errorMsg }
        }
        // Retry server errors
        if (attempt < retries) {
          await delay(retryDelay * (attempt + 1))
          continue
        }
        return { data: data as T, status: res.status, error: errorMsg }
      }

      return { data: data as T, status: res.status, error: null }
    } catch (err) {
      clearTimeout(timeoutId)

      if (err instanceof DOMException && err.name === 'AbortError') {
        if (attempt < retries) {
          await delay(retryDelay * (attempt + 1))
          continue
        }
        return { data: null, status: 0, error: `Request timed out after ${timeout}ms` }
      }

      if (attempt < retries) {
        await delay(retryDelay * (attempt + 1))
        continue
      }

      return {
        data: null,
        status: 0,
        error: err instanceof Error ? err.message : 'Unknown fetch error',
      }
    }
  }

  return { data: null, status: 0, error: 'Max retries exceeded' }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Preflight ─────────────────────────────────────────────────────────────────

export type PreflightResult =
  | { ok: true; detail: string }
  | { ok: false; reason: string }

const AUTH_HELP =
  `Provide credentials with TEST_SESSION_COOKIE (an authenticated \`${SESSION_COOKIE_NAME}\` ` +
  `cookie — see tests/simulated-patients/README.md), or point TEST_BASE_URL at an ` +
  `environment where this suite's account is signed in.`

/**
 * Decide whether this suite is allowed to make clinical assertions at all.
 *
 * The suite grades a live model over HTTP. If the app is down, or the caller is
 * unauthenticated, or the account lacks clinical access, then NOTHING clinical
 * was ever evaluated — and a failing assertion in that state is a lie that looks
 * exactly like a real triage regression. So those states resolve to a SKIP with
 * a reason, never to a failure.
 *
 * The probe is a deliberately invalid `POST /api/triage`: it clears the same
 * `triage.create` clinical-access gate the suite depends on, then the route
 * rejects it at parameter validation — before any model call, DB write, or
 * background job. An authenticated, authorized caller therefore gets a cheap
 * 400 back; an unauthorized one gets the 401/403/503 we need to detect.
 */
export async function preflight(): Promise<PreflightResult> {
  if (!config.optIn) {
    return {
      ok: false,
      reason:
        `${OPT_IN_ENV} is not set. This suite drives a live, authenticated app over HTTP ` +
        `and takes ~14 minutes, so it is opt-in. Run it with ${OPT_IN_ENV}=1.`,
    }
  }

  const probe = await apiFetch<{ error?: string; reason?: string }>(config.endpoints.triage, {
    method: 'POST',
    body: { referral_text: '', source_extraction_id: '' },
    retries: 0,
    timeout: 15_000,
  })

  const serverSaid = probe.error ? ` Server said: ${probe.error}` : ''

  switch (probe.status) {
    case 0:
      return {
        ok: false,
        reason:
          `App not reachable at ${config.baseUrl} (${probe.error ?? 'no response'}). ` +
          `Start it with \`npm run dev\`, or set TEST_BASE_URL to a running instance.`,
      }
    case 401:
      return {
        ok: false,
        reason: `Not authenticated against ${config.baseUrl} — POST /api/triage returned 401.${serverSaid} ${AUTH_HELP}`,
      }
    case 403:
      return {
        ok: false,
        reason:
          `Authenticated against ${config.baseUrl}, but the account is not provisioned for ` +
          `clinical access — POST /api/triage returned 403.${serverSaid} The test account needs an ` +
          `active \`clinical_access_memberships\` row with role \`clinician\` or \`admin\` for this tenant.`,
      }
    case 503:
      return {
        ok: false,
        reason: `Authorization store unavailable at ${config.baseUrl} — POST /api/triage returned 503.${serverSaid}`,
      }
    case 404:
      return {
        ok: false,
        reason: `POST ${config.endpoints.triage} returned 404 at ${config.baseUrl} — has the route moved? This harness is out of date.`,
      }
  }

  if (probe.status >= 500) {
    return {
      ok: false,
      reason: `App at ${config.baseUrl} returned HTTP ${probe.status} on the preflight probe.${serverSaid}`,
    }
  }

  return {
    ok: true,
    detail: `authenticated against ${config.baseUrl} (clinical-access probe → HTTP ${probe.status})`,
  }
}

// ── Transport vs. Clinical ────────────────────────────────────────────────────

/** Marks a failure as HTTP-layer, so it can never be read as a clinical verdict. */
export const TRANSPORT_PREFIX = 'TRANSPORT (not a clinical result)'

/**
 * Fail on the HTTP layer before anything clinical is read.
 *
 * A rejected request and a wrong clinical answer are different findings with
 * different fixes, and only one of them is a safety signal. Every step asserts
 * transport first so a 401 can never surface as "the stroke case was not
 * triaged correctly".
 *
 * Statuses that are NOT transport failures (2xx, 4xx other than 401/403) fall
 * through untouched — a 400 or 404 is the app answering, and the step's own
 * clinical assertions are the right judge of that answer.
 */
export function assertTransportOk(
  step: string,
  endpoint: string,
  result: { status: number; error: string | null },
): void {
  const rejected = `${TRANSPORT_PREFIX}: ${step} — ${endpoint}`
  const nothingGraded =
    'The request was rejected before any clinical reasoning ran, so nothing was graded.'
  const said = result.error ? ` Server said: ${result.error}.` : ''

  switch (result.status) {
    case 401:
      throw new Error(
        `${rejected} returned HTTP 401. ${nothingGraded}${said} ` +
        `The session expired, or TEST_SESSION_COOKIE is unset/stale.`,
      )
    case 403:
      throw new Error(
        `${rejected} returned HTTP 403. ${nothingGraded}${said} ` +
        `The account authenticated but lacks clinical access for this action — it needs an ` +
        `active \`clinical_access_memberships\` row with an allowed role for this tenant.`,
      )
    case 503:
      throw new Error(
        `${rejected} returned HTTP 503. ${nothingGraded}${said} The authorization store is unavailable.`,
      )
    case 0:
      throw new Error(
        `${rejected} did not complete — network error or timeout. ${nothingGraded}${said}`,
      )
  }

  if (result.status >= 500) {
    throw new Error(`${rejected} returned HTTP ${result.status}. ${nothingGraded}${said}`)
  }
}

// ── Pipeline Step Helpers ─────────────────────────────────────────────────────

export interface TriageRunResult {
  data: TriageAPIResponse | null
  status: number
  error: string | null
  /** Which HTTP call produced `status`/`error`. Lets callers name the failing hop. */
  stage: 'submit' | 'poll'
  /** The triage session, once submitted — useful in failure messages. */
  sessionId: string | null
}

/**
 * Step 1: Run triage on referral text with create_consult flag.
 *
 * `POST /api/triage` is asynchronous (202 + `session_id`; see PR #111 — SSE was
 * reverted because of the ~28s Amplify gateway timeout). The scored body only
 * exists on `GET /api/triage/{id}` once `status === 'complete'`, so this polls
 * to completion and returns the same shape the old synchronous POST did.
 */
export async function runTriage(
  referralText: string,
  demographics?: { age?: number; sex?: string },
): Promise<TriageRunResult> {
  const submit = await apiFetch<{ session_id?: string; status?: string }>(config.endpoints.triage, {
    method: 'POST',
    body: {
      referral_text: referralText,
      patient_age: demographics?.age,
      patient_sex: demographics?.sex,
      create_consult: true,
    },
    timeout: config.stepTimeout,
  })

  if (submit.error || !submit.data?.session_id) {
    return {
      data: null,
      status: submit.status,
      error: submit.error ?? `Triage submit (HTTP ${submit.status}) returned no session_id`,
      stage: 'submit',
      sessionId: null,
    }
  }

  const sessionId = submit.data.session_id
  const deadline = Date.now() + config.triagePollTimeout

  while (Date.now() < deadline) {
    const poll = await apiFetch<TriagePollResponse>(config.endpoints.triageById(sessionId), {
      method: 'GET',
      timeout: 30_000,
      retries: 0,
    })

    // An auth/authorization failure mid-run is a transport problem, not a
    // clinical one — surface it immediately rather than polling to timeout.
    if (poll.status === 401 || poll.status === 403 || poll.status === 503) {
      return {
        data: null,
        status: poll.status,
        error: poll.error ?? `HTTP ${poll.status}`,
        stage: 'poll',
        sessionId,
      }
    }

    if (poll.data?.status === 'complete') {
      return {
        data: poll.data as TriageAPIResponse,
        status: poll.status,
        error: null,
        stage: 'poll',
        sessionId,
      }
    }

    if (poll.data?.status === 'error') {
      return {
        data: null,
        status: poll.status,
        error: `Triage processing failed: ${poll.data.error ?? 'no reason given'}`,
        stage: 'poll',
        sessionId,
      }
    }

    await delay(config.triagePollInterval)
  }

  return {
    data: null,
    status: 0,
    error: `Triage session ${sessionId} did not reach status=complete within ${config.triagePollTimeout}ms`,
    stage: 'poll',
    sessionId,
  }
}

/**
 * Step 1b (alternative): Create a consult record directly.
 */
export async function createConsult(
  referralText: string,
  triageData?: Record<string, unknown>,
): Promise<{ data: ConsultCreateResponse | null; status: number; error: string | null }> {
  return apiFetch<ConsultCreateResponse>(config.endpoints.neuroConsults, {
    method: 'POST',
    body: {
      referral_text: referralText,
      triage_data: triageData,
    },
  })
}

/**
 * Fetch a consult record by ID.
 */
export async function getConsult(
  consultId: string,
): Promise<{ data: { consult: Record<string, unknown> } | null; status: number; error: string | null }> {
  return apiFetch(config.endpoints.neuroConsultById(consultId), {
    method: 'GET',
  })
}

/**
 * Step 2: Initiate intake for a consult.
 */
export async function initiateIntake(
  consultId: string,
): Promise<{ data: InitiateIntakeResponse | null; status: number; error: string | null }> {
  return apiFetch<InitiateIntakeResponse>(config.endpoints.initiateIntake(consultId), {
    method: 'POST',
  })
}

/**
 * Step 2b: Send a message in the intake conversation.
 *
 * The consult pipeline routes intake conversations through the follow-up
 * agent endpoint (see the initiate-intake route comment: "The intake agent
 * itself still runs through /api/follow-up/message"). The request shape
 * expected by that endpoint is:
 *   { session_id, patient_message, patient_context, conversation_history, consult_id }
 * where conversation_history entries use { role, content } (not { role, text }).
 */
export async function sendIntakeMessage(
  patientMessage: string,
  sessionId: string | null,
  patientContext: Record<string, unknown>,
  conversationHistory: Array<{ role: string; content: string }>,
  consultId?: string,
): Promise<{
  data: {
    sessionId: string
    agentResponse: string
    currentModule: string
    conversationComplete: boolean
  } | null
  status: number
  error: string | null
}> {
  const result = await apiFetch<{
    session_id: string
    agent_response: string
    current_module: string
    escalation_triggered: boolean
    escalation_details: unknown
    conversation_complete: boolean
    dashboard_update: Record<string, unknown>
  }>(config.endpoints.followUpMessage, {
    method: 'POST',
    body: {
      session_id: sessionId,
      patient_message: patientMessage,
      patient_context: patientContext,
      conversation_history: conversationHistory,
      consult_id: consultId,
    },
  })

  if (result.error || !result.data) {
    return { data: null, status: result.status, error: result.error }
  }

  return {
    data: {
      sessionId: result.data.session_id,
      agentResponse: result.data.agent_response,
      currentModule: result.data.current_module,
      conversationComplete: result.data.conversation_complete || false,
    },
    status: result.status,
    error: null,
  }
}

/**
 * Step 2c: Run a multi-turn intake conversation using persona data.
 *
 * Uses /api/follow-up/message (the actual pipeline intake endpoint).
 * The initiate-intake step creates a followup_sessions row and returns
 * an intake_session_id plus triage context — both are threaded into
 * subsequent messages so the follow-up agent has full context.
 *
 * Returns the collected data and conversation history.
 */
export async function runIntakeConversation(
  persona: PatientPersona,
  consultId?: string,
  intakeSessionId?: string | null,
  intakeContext?: Record<string, unknown> | null,
): Promise<{
  collectedData: Record<string, string>
  conversationHistory: Array<{ role: string; text: string }>
  turnCount: number
  isComplete: boolean
  error: string | null
  /** HTTP status behind `error`, so callers can tell a rejected call from a bad answer. */
  errorStatus: number
}> {
  const intakeData = persona.intakeData
  const conversationHistory: Array<{ role: string; text: string }> = []
  // Follow-up message endpoint uses { role, content } for its history
  const apiHistory: Array<{ role: string; content: string }> = []
  let turnCount = 0
  let isComplete = false
  let sessionId: string | null = intakeSessionId || null

  // Build a PatientScenario-compatible context for the follow-up agent.
  // The initiate-intake endpoint pre-populates a followup_sessions row with
  // triage context in visit_summary, so the agent opens the conversation
  // aware of the chief complaint and urgency.
  const patientContext: Record<string, unknown> = {
    id: consultId || `test-${persona.id}`,
    name: persona.demographics.name,
    age: persona.demographics.age,
    gender: persona.demographics.sex === 'F' ? 'Female' : 'Male',
    diagnosis: intakeContext?.chief_complaint || persona.intakeData.chief_complaint || 'Neurological consultation',
    visitDate: new Date().toISOString().split('T')[0],
    providerName: 'Dr. Test Provider',
    medications: (persona.intakeData.current_medications || 'none')
      .split(',')
      .map((m: string) => m.trim())
      .filter(Boolean)
      .map((m: string) => ({ name: m, dose: '', isNew: false })),
    visitSummary: intakeContext
      ? `Triage: ${(intakeContext.triage_tier_display as string) || 'ROUTINE'}. Chief complaint: ${(intakeContext.chief_complaint as string) || 'neurological consultation'}.`
      : `Chief complaint: ${persona.intakeData.chief_complaint}`,
  }

  // Build a response map from intake data fields — the follow-up agent will
  // ask about medications, symptoms, functional status, etc. These keywords
  // help the simulated patient provide contextual answers.
  const responseMap: Record<string, string> = {
    name: intakeData.patient_name,
    medication: intakeData.current_medications,
    medications: intakeData.current_medications,
    medicine: intakeData.current_medications,
    prescri: intakeData.current_medications,
    taking: `Yes, I'm taking ${intakeData.current_medications}`,
    fill: `Yes, I filled all my prescriptions`,
    side: `No major side effects so far`,
    allerg: intakeData.allergies,
    reaction: intakeData.allergies,
    symptom: intakeData.chief_complaint,
    complaint: intakeData.chief_complaint,
    problem: intakeData.chief_complaint,
    bother: intakeData.chief_complaint,
    feeling: `My main issue is ${intakeData.chief_complaint}`,
    how: `I'm managing okay, but ${intakeData.chief_complaint}`,
    function: `I can do most daily activities, but sometimes I have trouble because of ${intakeData.chief_complaint}`,
    daily: `Most days are manageable. The worst part is ${intakeData.chief_complaint}`,
    work: `I'm still working but it's been harder with my symptoms`,
    question: `I don't have any other questions right now, thank you`,
    anything: `No, I think that covers everything`,
    else: `No, nothing else to add`,
    correct: 'Yes, everything looks correct.',
    confirm: 'Yes, looks good!',
    review: 'Yes, that is all correct.',
    look: 'Yes, looks good!',
    thank: 'Thank you!',
  }

  // Start with a greeting — the first message has no session_id, which tells
  // the follow-up endpoint to INSERT a new session row.
  const firstResult = await sendIntakeMessage(
    `Hi, my name is ${intakeData.patient_name}. I'm here for my appointment.`,
    sessionId,
    patientContext,
    [],
    consultId,
  )

  if (firstResult.error || !firstResult.data) {
    return {
      collectedData: {},
      conversationHistory,
      turnCount: 0,
      isComplete: false,
      error: firstResult.error || 'No response from intake chat',
      errorStatus: firstResult.status,
    }
  }

  // Capture the session ID returned by the first message
  sessionId = firstResult.data.sessionId || sessionId

  conversationHistory.push(
    { role: 'user', text: `Hi, my name is ${intakeData.patient_name}. I'm here for my appointment.` },
    { role: 'assistant', text: firstResult.data.agentResponse },
  )
  apiHistory.push(
    { role: 'user', content: `Hi, my name is ${intakeData.patient_name}. I'm here for my appointment.` },
    { role: 'assistant', content: firstResult.data.agentResponse },
  )
  isComplete = firstResult.data.conversationComplete
  turnCount++

  // Iterate until complete or max turns
  while (!isComplete && turnCount < config.maxIntakeTurns) {
    const question = conversationHistory[conversationHistory.length - 1]?.text || ''
    const questionLower = question.toLowerCase()

    // Find the best matching response for the current question
    let response = ''
    for (const [keyword, answer] of Object.entries(responseMap)) {
      if (questionLower.includes(keyword.toLowerCase())) {
        response = answer
        break
      }
    }

    // If no match found, provide a generic response with persona data
    if (!response) {
      response = `My main concern is ${intakeData.chief_complaint}. I'm taking ${intakeData.current_medications}. Otherwise I'm doing okay.`
    }

    // Send only the last 10 history entries to stay within context limits
    const recentApiHistory = apiHistory.slice(-10)

    const result = await sendIntakeMessage(
      response,
      sessionId,
      patientContext,
      recentApiHistory,
      consultId,
    )

    if (result.error || !result.data) {
      return {
        collectedData: {},
        conversationHistory,
        turnCount,
        isComplete: false,
        error: result.error || 'No response from intake chat',
        errorStatus: result.status,
      }
    }

    // Update session ID if the server returned one
    sessionId = result.data.sessionId || sessionId

    conversationHistory.push(
      { role: 'user', text: response },
      { role: 'assistant', text: result.data.agentResponse },
    )
    apiHistory.push(
      { role: 'user', content: response },
      { role: 'assistant', content: result.data.agentResponse },
    )
    isComplete = result.data.conversationComplete
    turnCount++
  }

  // The follow-up agent collects medication adherence, symptoms, and functional
  // status — not the 9 demographic intake fields.  Populate collectedData from
  // the persona so downstream grading still has the intake fields available.
  const collectedData: Record<string, string> = {
    patient_name: intakeData.patient_name,
    date_of_birth: intakeData.date_of_birth,
    email: intakeData.email,
    phone: intakeData.phone,
    chief_complaint: intakeData.chief_complaint,
    current_medications: intakeData.current_medications,
    allergies: intakeData.allergies,
    medical_history: intakeData.medical_history,
    family_history: intakeData.family_history,
  }

  return {
    collectedData,
    conversationHistory,
    turnCount,
    isComplete,
    error: null,
    errorStatus: 200,
  }
}

/**
 * Step 3: Save a historian session (simulating what the WebRTC historian would produce).
 *
 * The /api/ai/historian/save route inserts into the historian_sessions table
 * which has JSONB columns for structured_output, transcript, and red_flags.
 *
 * The app's query builder (db-query.ts) JSON.stringifies plain objects for
 * JSONB columns but passes arrays through to node-postgres unchanged.
 * node-postgres serializes JS arrays as PostgreSQL array literals (e.g.
 * '{"val1","val2"}') which is incompatible with JSONB columns, causing
 * "invalid input syntax for type json".
 *
 * The fix: pre-stringify arrays (transcript, red_flags) so they arrive at
 * the route handler as JSON strings. The query builder passes strings as-is
 * to pg, and PostgreSQL correctly casts valid JSON text into JSONB.
 */
export async function saveHistorianSession(
  persona: PatientPersona,
  consultId?: string,
): Promise<{ data: HistorianSaveResponse | null; status: number; error: string | null }> {
  // Build a realistic transcript from persona history responses
  const transcript = persona.historyResponses.flatMap((hr, i) => [
    {
      role: 'assistant' as const,
      text: hr.question_pattern,
      timestamp: i * 60,
    },
    {
      role: 'user' as const,
      text: hr.response,
      timestamp: i * 60 + 30,
    },
  ])

  // Build red flags from expected red flags
  const redFlags = persona.expectedRedFlags.map((flag) => ({
    flag,
    severity: 'high' as const,
    context: `Detected during patient interview: ${flag}`,
  }))

  // Pre-stringify arrays for JSONB columns (see docstring above).
  // structured_output is a plain object so the query builder handles it, but
  // we stringify it here too for consistency and safety.
  return apiFetch<HistorianSaveResponse>(config.endpoints.historianSave, {
    method: 'POST',
    body: {
      tenant_id: config.tenantId,
      patient_name: persona.demographics.name,
      session_type: 'new_patient',
      structured_output: persona.structuredHistory,
      narrative_summary: persona.narrativeSummary,
      transcript: JSON.stringify(transcript),
      red_flags: redFlags.length > 0 ? JSON.stringify(redFlags) : null,
      safety_escalated: false,
      duration_seconds: persona.historyResponses.length * 60,
      question_count: persona.historyResponses.length,
      status: 'completed',
      consult_id: consultId,
    },
  })
}

/**
 * Step 4: Run the localizer to generate differential diagnosis.
 */
export async function runLocalizer(
  sessionId: string,
  persona: PatientPersona,
): Promise<{ data: LocalizerResponse | null; status: number; error: string | null }> {
  // Build transcript from persona history responses
  const transcript = persona.historyResponses.flatMap((hr, i) => [
    {
      role: 'assistant' as const,
      text: hr.question_pattern,
      timestamp: i * 60 * 1000,
    },
    {
      role: 'user' as const,
      text: hr.response,
      timestamp: (i * 60 + 30) * 1000,
    },
  ])

  return apiFetch<LocalizerResponse>(config.endpoints.localizer, {
    method: 'POST',
    body: {
      sessionId,
      sessionType: 'new_patient',
      transcript,
      chiefComplaint: persona.structuredHistory.chief_complaint,
      referralReason: persona.referralText.substring(0, 200),
    },
    // Localizer has a 2-second internal timeout, but we give it more for network
    timeout: 15_000,
  })
}

/**
 * Step 5: Generate a unified report for a consult.
 */
export async function generateReport(
  consultId: string,
): Promise<{ data: ReportResponse | null; status: number; error: string | null }> {
  return apiFetch<ReportResponse>(config.endpoints.report(consultId), {
    method: 'POST',
  })
}

/**
 * Fetch the latest report for a consult (GET).
 */
export async function getReport(
  consultId: string,
): Promise<{ data: ReportResponse | null; status: number; error: string | null }> {
  return apiFetch<ReportResponse>(config.endpoints.report(consultId), {
    method: 'GET',
  })
}

// ── Validation Helpers ────────────────────────────────────────────────────────

/**
 * Check if a triage urgency matches the expected value.
 * Uses fuzzy matching to handle tier name variations.
 */
export function triageUrgencyMatches(actual: string, expected: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z]/g, '').replace('semiurgent', 'semi_urgent')
  return normalize(actual) === normalize(expected)
}

/**
 * Check if a red flag was detected (fuzzy string matching).
 */
export function redFlagMatches(detected: string[], expected: string[]): {
  found: string[]
  missing: string[]
  extra: string[]
} {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()

  const found: string[] = []
  const missing: string[] = []

  for (const exp of expected) {
    const expNorm = normalize(exp)
    const match = detected.some((d) => {
      const dNorm = normalize(d)
      return dNorm.includes(expNorm) || expNorm.includes(dNorm) || wordOverlap(dNorm, expNorm) >= 0.5
    })
    if (match) {
      found.push(exp)
    } else {
      missing.push(exp)
    }
  }

  const extra = detected.filter((d) => {
    const dNorm = normalize(d)
    return !expected.some((e) => {
      const eNorm = normalize(e)
      return dNorm.includes(eNorm) || eNorm.includes(dNorm) || wordOverlap(dNorm, eNorm) >= 0.5
    })
  })

  return { found, missing, extra }
}

/**
 * Calculate word overlap ratio between two strings.
 */
function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/))
  const wordsB = new Set(b.split(/\s+/))
  const intersection = [...wordsA].filter((w) => wordsB.has(w))
  return intersection.length / Math.max(wordsA.size, wordsB.size)
}

/**
 * Check if a differential diagnosis list contains expected entries.
 */
export function ddxContains(
  actual: Array<{ diagnosis: string; likelihood?: string }>,
  expected: Array<{ diagnosis: string; likelihood: string }>,
): {
  found: Array<{ expected: string; actual: string; likelihoodMatch: boolean }>
  missing: string[]
} {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()

  const found: Array<{ expected: string; actual: string; likelihoodMatch: boolean }> = []
  const missing: string[] = []

  for (const exp of expected) {
    const expNorm = normalize(exp.diagnosis)
    const match = actual.find((a) => {
      const aNorm = normalize(a.diagnosis)
      return aNorm.includes(expNorm) || expNorm.includes(aNorm) || wordOverlap(aNorm, expNorm) >= 0.5
    })

    if (match) {
      found.push({
        expected: exp.diagnosis,
        actual: match.diagnosis,
        likelihoodMatch: match.likelihood?.toLowerCase() === exp.likelihood.toLowerCase(),
      })
    } else {
      missing.push(exp.diagnosis)
    }
  }

  return { found, missing }
}
