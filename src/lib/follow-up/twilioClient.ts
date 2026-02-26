import twilio from 'twilio'

// Lazy-init Twilio client (avoid build-time env var access)
let _client: twilio.Twilio | null = null

function getClient(): twilio.Twilio {
  if (!_client) {
    const sid = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    if (!sid || !token) {
      throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set')
    }
    _client = twilio(sid, token)
  }
  return _client
}

/**
 * Send an SMS via Twilio.
 */
export async function sendSms(to: string, body: string): Promise<string> {
  const from = process.env.TWILIO_PHONE_NUMBER
  if (!from) throw new Error('TWILIO_PHONE_NUMBER must be set')

  const message = await getClient().messages.create({ to, from, body })
  return message.sid
}

/**
 * Validate an inbound Twilio webhook signature.
 */
export function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!token) return false
  return twilio.validateRequest(token, signature, url, params)
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
