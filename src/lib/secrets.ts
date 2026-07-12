import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'

const smClient = new SecretsManagerClient({
  region: process.env.AWS_REGION || process.env.BEDROCK_REGION || 'us-east-2',
})

interface CachedSecret {
  value: Record<string, unknown>
  cachedAt: number
}

const cache: Record<string, CachedSecret> = {}

const NOVA_SECRET_CACHE_TTL_DEFAULT_MS = 30_000
const NOVA_SECRET_CACHE_TTL_MIN_MS = 5_000
const NOVA_SECRET_CACHE_TTL_MAX_MS = 60_000

function getNovaSecretCacheTtlMs(): number {
  const rawValue = process.env.NOVA_RELAY_SECRET_CACHE_TTL_MS?.trim()
  if (!rawValue) return NOVA_SECRET_CACHE_TTL_DEFAULT_MS
  const configured = Number(rawValue)
  if (!Number.isFinite(configured)) return NOVA_SECRET_CACHE_TTL_DEFAULT_MS
  return Math.min(
    NOVA_SECRET_CACHE_TTL_MAX_MS,
    Math.max(NOVA_SECRET_CACHE_TTL_MIN_MS, Math.trunc(configured)),
  )
}

async function getSecret(
  secretId: string,
  maxAgeMs?: number,
): Promise<Record<string, unknown>> {
  const cached = cache[secretId]
  if (
    cached &&
    (maxAgeMs === undefined || Date.now() - cached.cachedAt < maxAgeMs)
  ) {
    return cached.value
  }
  const { SecretString } = await smClient.send(
    new GetSecretValueCommand({ SecretId: secretId })
  )
  if (!SecretString) {
    throw new Error('Secret value is unavailable.')
  }
  const parsed: unknown = JSON.parse(SecretString)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Secret value has an invalid shape.')
  }
  const value = parsed as Record<string, unknown>
  cache[secretId] = { value, cachedAt: Date.now() }
  return value
}

function secretString(
  secret: Record<string, unknown>,
  field: string,
): string {
  const value = secret[field]
  return typeof value === 'string' && value.trim() ? value : ''
}

async function getRuntimeSecretField(
  secretId: string,
  field: 'client_secret' | 'shared_secret',
  environmentName: 'COGNITO_CLIENT_SECRET' | 'NOVA_RELAY_SHARED_SECRET',
): Promise<string> {
  // Unit tests and local development may use process-local values. Production
  // resolves Secrets Manager first so no secret has to enter a Next build.
  if (process.env.NODE_ENV !== 'production') {
    return process.env[environmentName]?.trim() || ''
  }
  try {
    return secretString(await getSecret(secretId), field)
  } catch {
    // A runtime-injected fallback is supported for rollback, but because the
    // Next config no longer embeds these fields it cannot leak into artifacts.
    return process.env[environmentName]?.trim() || ''
  }
}

export async function getCognitoClientSecret(): Promise<string> {
  return getRuntimeSecretField(
    process.env.COGNITO_CLIENT_SECRET_ID ||
      'sevaro/ops-amplehtml/cognito',
    'client_secret',
    'COGNITO_CLIENT_SECRET',
  )
}

export async function getNovaRelaySharedSecret(): Promise<string> {
  const secretId =
    process.env.NOVA_RELAY_SECRET_ID || 'sevaro/nova-relay/shared-secret'
  if (process.env.NODE_ENV !== 'production') {
    return process.env.NOVA_RELAY_SHARED_SECRET?.trim() || ''
  }
  try {
    return secretString(
      await getSecret(secretId, getNovaSecretCacheTtlMs()),
      'shared_secret',
    )
  } catch {
    return process.env.NOVA_RELAY_SHARED_SECRET?.trim() || ''
  }
}

export interface RdsCredentials {
  host: string
  port: string
  username: string
  password: string
  database: string
}

export async function getRdsCredentials(): Promise<RdsCredentials> {
  try {
    const secret = await getSecret(
      process.env.RDS_SECRET_ID || 'sevaro/rds/credentials',
    )
    const creds: RdsCredentials = {
      host: secretString(secret, 'host'),
      port: secretString(secret, 'port') || '5432',
      username:
        secretString(secret, 'username') || secretString(secret, 'user'),
      password: secretString(secret, 'password'),
      database: secretString(secret, 'database'),
    }
    if (
      !creds.host ||
      !creds.username ||
      !creds.password ||
      !creds.database
    ) {
      throw new Error('RDS secret is incomplete.')
    }
    // The shared `sevaro/rds/credentials` secret's `database` field is a stale
    // default (`github_showcase`, a different app's 21-table DB). This app's full
    // schema (neurology_consults, notifications, historian_sessions, scale_results,
    // consult_reports, …) lives in `ops_amplehtml` on the same RDS instance, and
    // RDS_DATABASE is set to it in every environment (Amplify prod + .env.local).
    // Honor RDS_DATABASE in ALL envs so the app stays on the correct DB even if the
    // Secrets Manager fetch succeeds — e.g. if a compute role is later attached to
    // the Amplify app, which would otherwise make this path return github_showcase
    // and silently break /consult + notifications in prod.
    if (process.env.RDS_DATABASE) creds.database = process.env.RDS_DATABASE
    console.log('[RDS] Using Secrets Manager credentials, host:', creds.host ? creds.host.substring(0, 15) + '...' : '(empty)', 'db:', creds.database)
    return creds
  } catch (err) {
    if (process.env.NODE_ENV === 'production' && !process.env.RDS_HOST) {
      console.error('[RDS] Secrets Manager failed in production with no env fallback:', (err as Error).message?.substring(0, 80))
      throw new Error('RDS credentials unavailable — Secrets Manager failed and no env vars configured')
    }
    const host = process.env.RDS_HOST || ''
    console.log('[RDS] Secrets Manager failed:', (err as Error).message?.substring(0, 80))
    console.log('[RDS] Falling back to env vars, RDS_HOST:', host ? host.substring(0, 15) + '...' : '(empty)')
    return {
      host,
      port: process.env.RDS_PORT || '5432',
      username: process.env.RDS_USER || '',
      password: process.env.RDS_PASSWORD || '',
      database: process.env.RDS_DATABASE || '',
    }
  }
}

export async function getOpenAIKey(): Promise<string> {
  try {
    const secret = await getSecret('sevaro/openai/ops-amplehtml')
    return secretString(secret, 'api_key')
  } catch {
    return process.env.OPENAI_API_KEY || ''
  }
}

export async function getDeepgramKey(): Promise<string> {
  try {
    const secret = await getSecret('sevaro/deepgram')
    return secretString(secret, 'api_key')
  } catch {
    return process.env.DEEPGRAM_API_KEY || ''
  }
}

export interface TwilioCredentials {
  account_sid: string
  auth_token: string
  phone_number: string
}

export async function getMonitorApiKey(): Promise<string> {
  try {
    const secret = await getSecret('sevaro/monitor-api-key')
    return secretString(secret, 'key')
  } catch {
    return process.env.MONITOR_API_KEY || ''
  }
}

export async function getTwilioCredentials(): Promise<TwilioCredentials> {
  try {
    const secret = await getSecret('sevaro/twilio')
    return {
      account_sid: secretString(secret, 'account_sid'),
      auth_token: secretString(secret, 'auth_token'),
      phone_number: secretString(secret, 'phone_number'),
    }
  } catch {
    return {
      account_sid: process.env.TWILIO_ACCOUNT_SID || '',
      auth_token: process.env.TWILIO_AUTH_TOKEN || '',
      phone_number: process.env.TWILIO_PHONE_NUMBER || '',
    }
  }
}
