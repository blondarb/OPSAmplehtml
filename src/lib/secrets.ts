import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

const smClient = new SecretsManagerClient({ region: 'us-east-2' })

const cache: Record<string, any> = {}

async function getSecret(secretId: string): Promise<any> {
  if (cache[secretId]) return cache[secretId]
  const { SecretString } = await smClient.send(
    new GetSecretValueCommand({ SecretId: secretId })
  )
  cache[secretId] = JSON.parse(SecretString!)
  return cache[secretId]
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
    const creds = await getSecret('sevaro/rds/credentials')
    console.log('[RDS] Using Secrets Manager credentials, host:', creds.host ? creds.host.substring(0, 15) + '...' : '(empty)')
    return creds
  } catch (err) {
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
    return secret.api_key
  } catch {
    return process.env.OPENAI_API_KEY || ''
  }
}

export async function getDeepgramKey(): Promise<string> {
  try {
    const secret = await getSecret('sevaro/deepgram')
    return secret.api_key
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
    return secret.key
  } catch {
    return process.env.MONITOR_API_KEY || ''
  }
}

export async function getTwilioCredentials(): Promise<TwilioCredentials> {
  try {
    return await getSecret('sevaro/twilio')
  } catch {
    return {
      account_sid: process.env.TWILIO_ACCOUNT_SID || '',
      auth_token: process.env.TWILIO_AUTH_TOKEN || '',
      phone_number: process.env.TWILIO_PHONE_NUMBER || '',
    }
  }
}
