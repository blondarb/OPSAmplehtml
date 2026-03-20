/**
 * Configuration for the Simulated Patient E2E Test Agent.
 *
 * Environment variables:
 *   TEST_BASE_URL   — Base URL of the running app (default: http://localhost:3000)
 *   TEST_EMAIL      — Cognito test user email
 *   TEST_PASSWORD   — Cognito test user password
 *   TEST_TIMEOUT    — Per-step timeout in ms (default: 60000)
 *   TEST_TENANT_ID  — Tenant ID for historian sessions (default: test-tenant)
 */

export const config = {
  /** Base URL of the running Next.js app */
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',

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

  /** Maximum number of intake chat turns before giving up */
  maxIntakeTurns: 20,

  /** Tenant ID for historian session saves */
  tenantId: process.env.TEST_TENANT_ID || 'test-tenant',

  /** API endpoints (relative to baseUrl) */
  endpoints: {
    triage: '/api/triage',
    triageAutoValidate: '/api/triage/validate/cases/auto',
    neuroConsults: '/api/neuro-consults',
    neuroConsultById: (id: string) => `/api/neuro-consults/${id}`,
    initiateIntake: (id: string) => `/api/neuro-consults/${id}/initiate-intake`,
    intakeChat: '/api/ai/intake/chat',
    historianSave: '/api/ai/historian/save',
    localizer: '/api/ai/historian/localizer',
    scales: '/api/ai/historian/scales',
    report: (id: string) => `/api/neuro-consults/${id}/report`,
    authSession: '/api/auth/session',
  },
} as const
