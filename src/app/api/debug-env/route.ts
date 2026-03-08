import { NextResponse } from 'next/server'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

export async function GET() {
  const results: Record<string, string> = {}

  // Check if OPENAI_API_KEY env var exists (don't expose value)
  const envKey = process.env.OPENAI_API_KEY
  results.OPENAI_API_KEY_EXISTS = envKey ? `yes (${envKey.length} chars, starts with ${envKey.substring(0, 10)}...)` : 'no'
  results.DEEPGRAM_API_KEY_EXISTS = process.env.DEEPGRAM_API_KEY ? 'yes' : 'no'
  results.RDS_HOST_EXISTS = process.env.RDS_HOST ? 'yes' : 'no'
  results.NODE_ENV = process.env.NODE_ENV || 'unknown'

  // Try Secrets Manager
  try {
    const smClient = new SecretsManagerClient({ region: 'us-east-2' })
    const { SecretString } = await smClient.send(
      new GetSecretValueCommand({ SecretId: 'sevaro/openai/ops-amplehtml' })
    )
    const parsed = JSON.parse(SecretString!)
    results.SECRETS_MANAGER = `success (has api_key: ${!!parsed.api_key})`
  } catch (err: any) {
    results.SECRETS_MANAGER = `failed: ${err.name} - ${err.message}`
  }

  return NextResponse.json(results)
}
