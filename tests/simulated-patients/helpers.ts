/**
 * API call wrappers, auth helpers, and response validators for
 * the Simulated Patient E2E Test Agent.
 */

import { config } from './config'
import type {
  TriageAPIResponse,
  ConsultCreateResponse,
  InitiateIntakeResponse,
  IntakeChatResponse,
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
 * Build headers for API requests, including auth cookie if available.
 */
async function buildHeaders(extraHeaders?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  }

  const token = await getAuthToken()
  if (token) {
    headers['Cookie'] = `cognito-id-token=${token}`
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

// ── Pipeline Step Helpers ─────────────────────────────────────────────────────

/**
 * Step 1: Run triage on referral text with create_consult flag.
 */
export async function runTriage(
  referralText: string,
  demographics?: { age?: number; sex?: string },
): Promise<{ data: TriageAPIResponse | null; status: number; error: string | null }> {
  return apiFetch<TriageAPIResponse>(config.endpoints.triage, {
    method: 'POST',
    body: {
      referral_text: referralText,
      patient_age: demographics?.age,
      patient_sex: demographics?.sex,
      create_consult: true,
    },
    timeout: config.stepTimeout,
  })
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
 * Step 2b: Send a message in the intake chat.
 */
export async function sendIntakeMessage(
  message: string,
  conversationHistory: Array<{ role: string; text: string }>,
  currentData: Record<string, string>,
): Promise<{ data: IntakeChatResponse | null; status: number; error: string | null }> {
  return apiFetch<IntakeChatResponse>(config.endpoints.intakeChat, {
    method: 'POST',
    body: {
      message,
      conversationHistory,
      currentData,
    },
  })
}

/**
 * Step 2c: Run a multi-turn intake conversation using persona data.
 * Returns the collected data and conversation history.
 */
export async function runIntakeConversation(
  persona: PatientPersona,
): Promise<{
  collectedData: Record<string, string>
  conversationHistory: Array<{ role: string; text: string }>
  turnCount: number
  isComplete: boolean
  error: string | null
}> {
  const intakeData = persona.intakeData
  let currentData: Record<string, string> = {}
  const conversationHistory: Array<{ role: string; text: string }> = []
  let turnCount = 0
  let isComplete = false

  // Start with a greeting
  const firstResult = await sendIntakeMessage(
    `Hi, my name is ${intakeData.patient_name}. I'm here for my appointment.`,
    [],
    {},
  )

  if (firstResult.error || !firstResult.data) {
    return {
      collectedData: currentData,
      conversationHistory,
      turnCount: 0,
      isComplete: false,
      error: firstResult.error || 'No response from intake chat',
    }
  }

  conversationHistory.push(
    { role: 'user', text: `Hi, my name is ${intakeData.patient_name}. I'm here for my appointment.` },
    { role: 'assistant', text: firstResult.data.nextQuestion },
  )
  currentData = { ...currentData, ...firstResult.data.extractedData }
  turnCount++

  // Build a response map from intake data fields
  const responseMap: Record<string, string> = {
    name: intakeData.patient_name,
    date_of_birth: intakeData.date_of_birth,
    dob: intakeData.date_of_birth,
    birthday: intakeData.date_of_birth,
    born: intakeData.date_of_birth,
    email: intakeData.email,
    phone: intakeData.phone,
    telephone: intakeData.phone,
    contact: intakeData.phone,
    chief_complaint: intakeData.chief_complaint,
    complaint: intakeData.chief_complaint,
    reason: intakeData.chief_complaint,
    visit: intakeData.chief_complaint,
    symptoms: intakeData.chief_complaint,
    problem: intakeData.chief_complaint,
    bother: intakeData.chief_complaint,
    medication: intakeData.current_medications,
    medications: intakeData.current_medications,
    medicine: intakeData.current_medications,
    drugs: intakeData.current_medications,
    prescri: intakeData.current_medications,
    allerg: intakeData.allergies,
    reaction: intakeData.allergies,
    medical_history: intakeData.medical_history,
    history: intakeData.medical_history,
    conditions: intakeData.medical_history,
    diagnos: intakeData.medical_history,
    surgeries: intakeData.medical_history,
    hospitaliz: intakeData.medical_history,
    family: intakeData.family_history,
    relatives: intakeData.family_history,
    correct: 'Yes, everything looks correct. Please submit.',
    confirm: 'Yes, looks good!',
    review: 'Yes, that is all correct.',
    change: 'No changes needed, looks good.',
    look: 'Yes, looks good!',
  }

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

    // If no match found, provide a generic response with remaining data
    if (!response) {
      const missingFields = [
        !currentData.patient_name && `My name is ${intakeData.patient_name}`,
        !currentData.date_of_birth && `My date of birth is ${intakeData.date_of_birth}`,
        !currentData.email && `My email is ${intakeData.email}`,
        !currentData.phone && `My phone number is ${intakeData.phone}`,
        !currentData.chief_complaint && `I'm here because ${intakeData.chief_complaint}`,
        !currentData.current_medications && `My medications are: ${intakeData.current_medications}`,
        !currentData.allergies && `My allergies: ${intakeData.allergies}`,
        !currentData.medical_history && `My medical history: ${intakeData.medical_history}`,
        !currentData.family_history && `Family history: ${intakeData.family_history}`,
      ].filter(Boolean)

      response = missingFields[0] || 'Yes, that is correct. Please continue.'
    }

    const result = await sendIntakeMessage(response, conversationHistory, currentData)

    if (result.error || !result.data) {
      return {
        collectedData: currentData,
        conversationHistory,
        turnCount,
        isComplete: false,
        error: result.error || 'No response from intake chat',
      }
    }

    conversationHistory.push(
      { role: 'user', text: response },
      { role: 'assistant', text: result.data.nextQuestion },
    )
    currentData = { ...currentData, ...result.data.extractedData }
    isComplete = result.data.isComplete || false
    turnCount++
  }

  return {
    collectedData: currentData,
    conversationHistory,
    turnCount,
    isComplete,
    error: null,
  }
}

/**
 * Step 3: Save a historian session (simulating what the WebRTC historian would produce).
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

  return apiFetch<HistorianSaveResponse>(config.endpoints.historianSave, {
    method: 'POST',
    body: {
      tenant_id: config.tenantId,
      patient_name: persona.demographics.name,
      session_type: 'new_patient',
      structured_output: persona.structuredHistory,
      narrative_summary: persona.narrativeSummary,
      transcript,
      red_flags: redFlags.length > 0 ? redFlags : null,
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
