/**
 * GET /api/follow-up/twilio-status
 *
 * Returns whether Twilio credentials are configured.
 * Does NOT expose actual credentials — only a boolean flag.
 */

import { NextResponse } from 'next/server'
import { getTwilioCredentials } from '@/lib/secrets'

export async function GET() {
  try {
    const creds = await getTwilioCredentials()
    const configured = !!(
      creds.account_sid &&
      creds.auth_token &&
      creds.phone_number
    )

    return NextResponse.json({
      configured,
      // Include a helpful message for operators
      message: configured
        ? 'Twilio is configured and ready for live SMS.'
        : 'Twilio credentials are not configured. Set them in AWS Secrets Manager (sevaro/twilio) or via environment variables (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER).',
    })
  } catch (err) {
    console.error('[twilio-status] Error checking credentials:', err)
    return NextResponse.json({
      configured: false,
      message: 'Unable to verify Twilio configuration. Check Secrets Manager access.',
    })
  }
}
