import {
  PutSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager'
import { Pool } from 'pg'
import { RDS_CA_BUNDLE } from '../src/lib/rds-ca-bundle'

const QA_APP_ORIGIN = 'https://historian-mvp-qa.d3ietjwgco4g2t.amplifyapp.com'
const QA_COGNITO_CLIENT_ID = 'ecjsa2ifjoj85konf3ts42gf5'
const QA_COGNITO_REGION = 'us-east-2'
const QA_USERNAME = 'historian-qa-clinician'
const QA_DATABASE_HOST = 'historian-mvp-qa.cxe2y0soqa7a.us-east-2.rds.amazonaws.com'
const QA_DATABASE_NAME = 'ops_amplehtml_historian_qa'
const QA_OUTPUT_SECRET_ARN = /^arn:aws:secretsmanager:us-east-2:873370528823:secret:historian-mvp-qa-temp-link-output-[A-Za-z0-9]{6}$/
const QA_LINK_HOURS = 82

const FIXTURE = {
  tenantId: 'historian-mvp-qa',
  consultId: '20000000-0000-4000-8000-000000000001',
  dateOfBirth: '1985-01-15',
} as const

type FetchLike = typeof fetch

export interface HistorianQaTempLinkConfig {
  enabled: boolean
  dataClass: string
  appOrigin: string
  cognitoClientId: string
  cognitoRegion: string
  username: string
  password: string
  databaseHost: string
  databasePort: number
  databaseUser: string
  databasePassword: string
  databaseName: string
  outputSecretArn: string
  linkHours: number
}

interface InvitationDetails {
  inviteId: string
  sessionId: string
  url: string
}

interface TempLinkDependencies {
  fetchImpl?: FetchLike
  extendInviteExpiry?: (
    config: HistorianQaTempLinkConfig,
    invitation: InvitationDetails,
  ) => Promise<string>
  storeSecurePayload?: (
    config: HistorianQaTempLinkConfig,
    payload: string,
  ) => Promise<void>
  emit?: (line: string) => void
}

interface JsonResponse {
  response: Response
  body: Record<string, unknown>
}

export class HistorianQaTempLinkError extends Error {
  readonly code: string
  readonly status?: number

  constructor(code: string, status?: number) {
    super(code)
    this.name = 'HistorianQaTempLinkError'
    this.code = code
    this.status = status
  }
}

function positiveInteger(value: string | undefined): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

export function loadHistorianQaTempLinkConfig(
  environment: NodeJS.ProcessEnv = process.env,
): HistorianQaTempLinkConfig {
  return {
    enabled: environment.HISTORIAN_QA_TEMP_LINK_ENABLED === 'true',
    dataClass: environment.HISTORIAN_QA_DATA_CLASS || '',
    appOrigin: environment.HISTORIAN_QA_APP_ORIGIN || '',
    cognitoClientId: environment.HISTORIAN_QA_COGNITO_CLIENT_ID || '',
    cognitoRegion: environment.HISTORIAN_QA_COGNITO_REGION || '',
    username: environment.QA_USERNAME || '',
    password: environment.QA_PASSWORD || '',
    databaseHost: environment.QA_DATABASE_HOST || '',
    databasePort: positiveInteger(environment.QA_DATABASE_PORT),
    databaseUser: environment.QA_DATABASE_USER || '',
    databasePassword: environment.QA_DATABASE_PASSWORD || '',
    databaseName: environment.QA_DATABASE_NAME || '',
    outputSecretArn: environment.HISTORIAN_QA_TEMP_LINK_OUTPUT_SECRET_ARN || '',
    linkHours: positiveInteger(environment.HISTORIAN_QA_TEMP_LINK_HOURS),
  }
}

export function assertHistorianQaTempLinkConfig(
  config: HistorianQaTempLinkConfig,
): void {
  if (!config.enabled) throw new HistorianQaTempLinkError('QA_TEMP_LINK_DISABLED')
  if (config.dataClass !== 'synthetic-only') {
    throw new HistorianQaTempLinkError('QA_DATA_CLASS_MISMATCH')
  }
  if (config.appOrigin !== QA_APP_ORIGIN) {
    throw new HistorianQaTempLinkError('QA_ORIGIN_MISMATCH')
  }
  if (
    config.cognitoClientId !== QA_COGNITO_CLIENT_ID ||
    config.cognitoRegion !== QA_COGNITO_REGION
  ) {
    throw new HistorianQaTempLinkError('QA_COGNITO_TARGET_MISMATCH')
  }
  if (config.username !== QA_USERNAME || !config.password) {
    throw new HistorianQaTempLinkError('QA_MACHINE_CREDENTIAL_UNAVAILABLE')
  }
  if (
    config.databaseHost !== QA_DATABASE_HOST ||
    config.databasePort !== 5432 ||
    config.databaseName !== QA_DATABASE_NAME
  ) {
    throw new HistorianQaTempLinkError('QA_DATABASE_TARGET_MISMATCH')
  }
  if (!config.databaseUser || !config.databasePassword) {
    throw new HistorianQaTempLinkError('QA_DATABASE_CREDENTIAL_UNAVAILABLE')
  }
  if (!QA_OUTPUT_SECRET_ARN.test(config.outputSecretArn)) {
    throw new HistorianQaTempLinkError('QA_OUTPUT_TARGET_MISMATCH')
  }
  if (config.linkHours !== QA_LINK_HOURS) {
    throw new HistorianQaTempLinkError('QA_LINK_DURATION_MISMATCH')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
    throw new HistorianQaTempLinkError(`${failureCode}_NETWORK`)
  }

  let body: Record<string, unknown> = {}
  try {
    body = await response.json() as Record<string, unknown>
  } catch {
    // Never surface an upstream body: it may contain a credential or bearer.
  }
  return { response, body }
}

function requireStatus(result: JsonResponse, expected: number, code: string): void {
  if (result.response.status !== expected) {
    throw new HistorianQaTempLinkError(code, result.response.status)
  }
}

function validateInvitationUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HistorianQaTempLinkError('INVITATION_URL_MISSING')
  }
  const url = new URL(value)
  const token = new URLSearchParams(url.hash.slice(1)).get('token')
  if (
    url.origin !== QA_APP_ORIGIN ||
    url.pathname !== '/patient/historian/invite' ||
    url.search ||
    !url.hash.startsWith('#token=') ||
    !token
  ) {
    throw new HistorianQaTempLinkError('INVITATION_URL_BOUNDARY_FAILED')
  }
  return value
}

async function extendInviteExpiry(
  config: HistorianQaTempLinkConfig,
  invitation: InvitationDetails,
): Promise<string> {
  const pool = new Pool({
    host: config.databaseHost,
    port: config.databasePort,
    user: config.databaseUser,
    password: config.databasePassword,
    database: config.databaseName,
    max: 1,
    connectionTimeoutMillis: 15_000,
    ssl: { ca: RDS_CA_BUNDLE, rejectUnauthorized: true },
  })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query<{
      expires_at: Date | string
      remaining_seconds: string | number
    }>(
      `UPDATE historian_invites
          SET expires_at = clock_timestamp() + ($5::integer * interval '1 hour'),
              updated_at = clock_timestamp()
        WHERE id = $1
          AND session_id = $2
          AND tenant_id = $3
          AND consult_id = $4
          AND status = 'pending'
          AND redeemed_at IS NULL
        RETURNING expires_at,
                  EXTRACT(EPOCH FROM (expires_at - clock_timestamp())) AS remaining_seconds`,
      [
        invitation.inviteId,
        invitation.sessionId,
        FIXTURE.tenantId,
        FIXTURE.consultId,
        config.linkHours,
      ],
    )
    const row = result.rows[0]
    const remainingSeconds = Number(row?.remaining_seconds)
    const expectedSeconds = config.linkHours * 60 * 60
    if (
      !row ||
      !Number.isFinite(remainingSeconds) ||
      remainingSeconds < expectedSeconds - 120 ||
      remainingSeconds > expectedSeconds + 5
    ) {
      throw new HistorianQaTempLinkError('INVITATION_EXPIRY_UPDATE_FAILED')
    }
    await client.query('COMMIT')
    return new Date(row.expires_at).toISOString()
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    if (error instanceof HistorianQaTempLinkError) throw error
    throw new HistorianQaTempLinkError('INVITATION_EXPIRY_UPDATE_FAILED')
  } finally {
    client.release()
    await pool.end()
  }
}

async function storeSecurePayload(
  config: HistorianQaTempLinkConfig,
  payload: string,
): Promise<void> {
  const client = new SecretsManagerClient({ region: QA_COGNITO_REGION })
  try {
    await client.send(new PutSecretValueCommand({
      SecretId: config.outputSecretArn,
      SecretString: payload,
      VersionStages: ['AWSCURRENT'],
    }))
  } catch {
    throw new HistorianQaTempLinkError('SECURE_OUTPUT_WRITE_FAILED')
  } finally {
    client.destroy()
  }
}

export async function runHistorianQaTempLink(
  config: HistorianQaTempLinkConfig,
  dependencies: TempLinkDependencies = {},
): Promise<{ expiresAt: string; linkHours: number }> {
  assertHistorianQaTempLinkConfig(config)
  const fetchImpl = dependencies.fetchImpl ?? fetch
  const emit = dependencies.emit ?? console.log

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
  requireStatus(cognito, 200, 'COGNITO_AUTH_REJECTED')
  const authenticationResult = isRecord(cognito.body.AuthenticationResult)
    ? cognito.body.AuthenticationResult
    : null
  const idToken = authenticationResult?.IdToken
  if (typeof idToken !== 'string' || !idToken) {
    throw new HistorianQaTempLinkError('COGNITO_ID_TOKEN_MISSING')
  }

  const invitationResult = await jsonRequest(
    fetchImpl,
    `${QA_APP_ORIGIN}/api/ai/historian/invites`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: QA_APP_ORIGIN,
        Cookie: `id_token=${idToken}`,
      },
      body: JSON.stringify({ consultId: FIXTURE.consultId, replaceActive: true }),
    },
    'INVITATION_CREATE_FAILED',
  )
  requireStatus(invitationResult, 200, 'INVITATION_CREATE_REJECTED')
  const invitationPayload = isRecord(invitationResult.body.invitation)
    ? invitationResult.body.invitation
    : null
  const inviteId = invitationPayload?.id
  const sessionId = invitationPayload?.sessionId
  if (typeof inviteId !== 'string' || !inviteId) {
    throw new HistorianQaTempLinkError('INVITATION_ID_MISSING')
  }
  if (typeof sessionId !== 'string' || !sessionId) {
    throw new HistorianQaTempLinkError('INVITATION_SESSION_ID_MISSING')
  }
  const invitation: InvitationDetails = {
    inviteId,
    sessionId,
    url: validateInvitationUrl(invitationPayload?.url),
  }

  const expiresAt = await (
    dependencies.extendInviteExpiry ?? extendInviteExpiry
  )(config, invitation)
  const parsedExpiry = new Date(expiresAt)
  if (!Number.isFinite(parsedExpiry.getTime())) {
    throw new HistorianQaTempLinkError('INVITATION_EXPIRY_INVALID')
  }

  const securePayload = JSON.stringify({
    url: invitation.url,
    expiresAt,
    dateOfBirth: FIXTURE.dateOfBirth,
    dataClass: 'synthetic-only',
    oneTime: true,
    grantAfterRedemptionHours: 4,
  })
  await (dependencies.storeSecurePayload ?? storeSecurePayload)(config, securePayload)

  emit(
    `HISTORIAN_QA_TEMP_LINK_PASS expires_in_hours=${config.linkHours} output=encrypted_stack_secret`,
  )
  return { expiresAt, linkHours: config.linkHours }
}

async function main(): Promise<void> {
  const config = loadHistorianQaTempLinkConfig()
  delete process.env.QA_USERNAME
  delete process.env.QA_PASSWORD
  delete process.env.QA_DATABASE_USER
  delete process.env.QA_DATABASE_PASSWORD
  try {
    await runHistorianQaTempLink(config)
  } catch (error) {
    const safeError = error instanceof HistorianQaTempLinkError
      ? error
      : new HistorianQaTempLinkError('UNEXPECTED_TEMP_LINK_FAILURE')
    console.error(
      `HISTORIAN_QA_TEMP_LINK_FAIL code=${safeError.code}` +
        (safeError.status ? ` status=${safeError.status}` : ''),
    )
    process.exitCode = 1
  }
}

if (process.argv[1]?.endsWith('historian-qa-issue-temp-link.ts')) {
  void main()
}
