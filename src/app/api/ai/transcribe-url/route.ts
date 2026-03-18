import { NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import crypto from 'crypto'

const REGION = 'us-east-2'
const SERVICE = 'transcribe'
const HOST = `transcribestreaming.${REGION}.amazonaws.com`
const PORT = 8443

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest()
}

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex')
}

function getSignatureKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  return hmac(kService, 'aws4_request')
}

async function getAwsCredentials(): Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken?: string }> {
  // On Amplify/Lambda, these are set automatically by the execution role
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN,
    }
  }

  // For local dev with SSO, resolve credentials via the AWS SDK
  try {
    const { fromNodeProviderChain } = await import('@aws-sdk/credential-providers')
    const provider = fromNodeProviderChain({ profile: 'sevaro-sandbox' })
    const creds = await provider()
    return {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    }
  } catch {
    throw new Error('No AWS credentials available for Transcribe Streaming')
  }
}

function createPresignedUrl(
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  sampleRate: number
): string {
  const now = new Date()
  const dateStamp = now.toISOString().replace(/[-:]/g, '').slice(0, 8) // YYYYMMDD
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z') // YYYYMMDDTHHmmssZ
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`

  // Query parameters (must be sorted alphabetically for signing)
  const queryParams: Record<string, string> = {
    'language-code': 'en-US',
    'media-encoding': 'pcm',
    'sample-rate': String(sampleRate),
    'specialty': 'NEUROLOGY',
    'type': 'DICTATION',
  }

  // Add auth query params
  queryParams['X-Amz-Algorithm'] = 'AWS4-HMAC-SHA256'
  queryParams['X-Amz-Credential'] = `${credentials.accessKeyId}/${credentialScope}`
  queryParams['X-Amz-Date'] = amzDate
  queryParams['X-Amz-Expires'] = '300'
  if (credentials.sessionToken) {
    queryParams['X-Amz-Security-Token'] = credentials.sessionToken
  }
  queryParams['X-Amz-SignedHeaders'] = 'host'

  // Build canonical query string (sorted)
  const sortedKeys = Object.keys(queryParams).sort()
  const canonicalQueryString = sortedKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&')

  // Canonical request
  const canonicalRequest = [
    'GET',
    '/medical-stream-transcription-websocket',
    canonicalQueryString,
    `host:${HOST}:${PORT}`,
    '',
    'host',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // SHA256 of empty string
  ].join('\n')

  // String to sign
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  // Calculate signature
  const signingKey = getSignatureKey(credentials.secretAccessKey, dateStamp, REGION, SERVICE)
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex')

  // Build final URL
  return `wss://${HOST}:${PORT}/medical-stream-transcription-websocket?${canonicalQueryString}&X-Amz-Signature=${signature}`
}

export async function POST(request: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const sampleRate = body.sampleRate || 48000

    const credentials = await getAwsCredentials()
    const url = createPresignedUrl(credentials, sampleRate)

    return NextResponse.json({ url, sampleRate })
  } catch (error: any) {
    console.error('Transcribe URL generation error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate transcription URL' },
      { status: 500 }
    )
  }
}
