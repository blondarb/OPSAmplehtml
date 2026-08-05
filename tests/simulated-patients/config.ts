/**
 * Configuration for the Simulated Patient E2E Test Agent.
 *
 * Environment variables:
 *   RUN_SIMULATED_PATIENTS — Opt-in switch. The suite SKIPS unless this is 1/true/yes.
 *   TEST_BASE_URL          — Base URL of the running app (default: http://localhost:3000)
 *   TEST_SESSION_COOKIE    — Cookie header for an authenticated session (preferred; see README)
 *   TEST_EMAIL             — Cognito test user email (USER_PASSWORD_AUTH fallback)
 *   TEST_PASSWORD          — Cognito test user password (USER_PASSWORD_AUTH fallback)
 *   TEST_TIMEOUT           — Per-step timeout in ms (default: 60000)
 *   TEST_TRIAGE_POLL_TIMEOUT — Max wait for async triage to finish, ms (default: 180000)
 *   TEST_TENANT_ID         — Tenant ID for historian sessions (default: test-tenant)
 */

/** The env var that opts a run in. Named once so error messages can't drift from the check. */
export const OPT_IN_ENV = 'RUN_SIMULATED_PATIENTS'

/** The cookie the app actually reads for a Cognito session (src/lib/cognito/server.ts). */
export const SESSION_COOKIE_NAME = 'id_token'

export const config = {
  /**
   * Opt-in gate. This suite drives a live, authenticated app over HTTP and takes
   * ~14 minutes, so it is NOT part of a default `npx vitest run` — without this
   * flag it skips with a reason rather than failing and teaching people to
   * ignore a red file.
   */
  optIn: /^(1|true|yes)$/i.test(process.env[OPT_IN_ENV] || ''),

  /** Base URL of the running Next.js app */
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',

  /**
   * Pre-obtained session cookie — the reliable way to authenticate this suite.
   * Accepts either a full Cookie header value ("id_token=eyJ...") or a bare
   * ID token, which is wrapped in `SESSION_COOKIE_NAME` automatically.
   */
  sessionCookie: process.env.TEST_SESSION_COOKIE || '',

  /** Cognito credentials for authenticated endpoints */
  auth: {
    email: process.env.TEST_EMAIL || '',
    password: process.env.TEST_PASSWORD || '',
    /** Cognito User Pool ID (read from app env) */
    userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || process.env.COGNITO_USER_POOL_ID || '',
    /** Cognito Client ID (read from app env) */
    clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || process.env.COGNITO_CLIENT_ID || '',
    /** Cognito region */
    region: process.env.NEXT_PUBLIC_COGNITO_REGION || process.env.COGNITO_REGION || 'us-east-2',
  },

  /** Per-step timeout in milliseconds */
  stepTimeout: parseInt(process.env.TEST_TIMEOUT || '60000', 10),

  /**
   * How long to poll `/api/triage/{id}` for the async scoring to finish.
   * The route's own `maxDuration` is 120s; typical work is 25-40s.
   */
  triagePollTimeout: parseInt(process.env.TEST_TRIAGE_POLL_TIMEOUT || '180000', 10),

  /** Delay between triage poll attempts, in milliseconds */
  triagePollInterval: 2000,

  /** Maximum number of intake chat turns before giving up */
  maxIntakeTurns: 20,

  /** Tenant ID for historian session saves */
  tenantId: process.env.TEST_TENANT_ID || 'test-tenant',

  /** API endpoints (relative to baseUrl) */
  endpoints: {
    triage: '/api/triage',
    /** Poll target for async triage scoring — POST /api/triage only returns a 202 + session_id. */
    triageById: (id: string) => `/api/triage/${id}`,
    triageAutoValidate: '/api/triage/validate/cases/auto',
    neuroConsults: '/api/neuro-consults',
    neuroConsultById: (id: string) => `/api/neuro-consults/${id}`,
    initiateIntake: (id: string) => `/api/neuro-consults/${id}/initiate-intake`,
    intakeChat: '/api/ai/intake/chat',
    followUpMessage: '/api/follow-up/message',
    historianSave: '/api/ai/historian/save',
    localizer: '/api/ai/historian/localizer',
    scales: '/api/ai/historian/scales',
    report: (id: string) => `/api/neuro-consults/${id}/report`,
    authSession: '/api/auth/session',
  },
} as const
