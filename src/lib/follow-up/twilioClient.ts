import twilio from 'twilio'
import { getTwilioCredentials } from '../secrets'

// Lazy-init Twilio client (avoid build-time env var access)
let _client: twilio.Twilio | null = null
let _cachedToken: string | null = null

async function getClient(): Promise<twilio.Twilio> {
  if (!_client) {
    const creds = await getTwilioCredentials()
    if (!creds.account_sid || !creds.auth_token) {
      throw new Error('Twilio credentials not configured')
    }
    _client = twilio(creds.account_sid, creds.auth_token)
    _cachedToken = creds.auth_token
  }
  return _client
}

/**
 * Send an SMS via Twilio.
 */
export async function sendSms(to: string, body: string): Promise<string> {
  const creds = await getTwilioCredentials()
  if (!creds.phone_number) throw new Error('Twilio phone number not configured')

  const client = await getClient()
  const message = await client.messages.create({ to, from: creds.phone_number, body })
  return message.sid
}

/**
 * Validate an inbound Twilio webhook signature.
 */
export async function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>
): Promise<boolean> {
  const creds = await getTwilioCredentials()
  if (!creds.auth_token) return false
  return twilio.validateRequest(creds.auth_token, signature, url, params)
}

/**
 * Validate and normalize a US phone number to E.164 format.
 * Returns null if invalid.
 */
export function normalizePhoneNumber(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}
