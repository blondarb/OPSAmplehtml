import { NextResponse } from 'next/server'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { getPool } from '@/lib/db'
import { sendSms, normalizePhoneNumber } from '@/lib/follow-up/twilioClient'
import { getTwilioCredentials } from '@/lib/secrets'
import { loadSchedulingAuthorization } from '@/lib/triage/schedulingAuthorization'

interface SmsSessionBinding {
  id: string
  patient_id: string | null
  patient_name: string | null
  visit_date: string | Date | null
  provider_name: string | null
  medications: unknown
  status: string | null
  patient_phone: string | null
  consult_id: string | null
  triage_session_id: string | null
}

function parseMedications(value: unknown): Array<{ name?: string }> {
  if (Array.isArray(value)) return value as Array<{ name?: string }>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? (parsed as Array<{ name?: string }>) : []
    } catch {
      return []
    }
  }
  return []
}

function smsFragment(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function greetingFor(binding: SmsSessionBinding): string {
  const firstName = smsFragment(binding.patient_name, 60).split(' ')[0] || 'there'
  const provider = smsFragment(binding.provider_name, 80)
  const visitDate =
    binding.visit_date instanceof Date
      ? binding.visit_date.toISOString().split('T')[0]
      : smsFragment(binding.visit_date, 20)
  const medication = smsFragment(parseMedications(binding.medications)[0]?.name, 80)
  const visitPhrase = visitDate ? ` after your visit on ${visitDate}` : ''
  const providerPhrase = provider ? ` with ${provider}` : ''
  const medicationPhrase = medication ? ` about ${medication}` : ' about your care'

  return (
    `Hi ${firstName}, this is the Sevaro Neurology care team following up` +
    `${visitPhrase}${providerPhrase}. We'd like to check in${medicationPhrase}. ` +
    'Reply here to continue. Reply STOP to opt out. If this is an emergency, call 911.'
  ).slice(0, 480)
}

async function loadSafetyDecision(triageSessionId: string, tenantId: string) {
  const safety = await loadSchedulingAuthorization(triageSessionId, tenantId)
  return safety.decision
}

export async function GET() {
  const access = await authorizeClinicalAccess({
    action: 'follow_up.sms_send',
    allowedRoles: ['clinician', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: 'Access denied', reason: access.reason },
      { status: access.status },
    )
  }

  try {
    const pool = await getPool()
    const { rows } = await pool.query(
      `SELECT fs.id,
              fs.patient_name,
              fs.visit_date,
              p.phone AS patient_phone
         FROM followup_sessions fs
         JOIN patients p
           ON p.id = fs.patient_id
          AND p.tenant_id = fs.tenant_id
        WHERE fs.tenant_id = $1
          AND fs.status = 'idle'
          AND p.phone IS NOT NULL
        ORDER BY fs.created_at DESC
        LIMIT 50`,
      [access.context.tenantId],
    )
    const sessions = rows.flatMap((row) => {
      const destination = normalizePhoneNumber(row.patient_phone || '')
      if (!destination) return []
      return [
        {
          id: row.id,
          patientName: row.patient_name || 'Patient',
          visitDate: row.visit_date || null,
          destination: `***-***-${destination.slice(-4)}`,
        },
      ]
    })
    return NextResponse.json({ sessions })
  } catch {
    console.error('[follow-up/send-sms] eligible-session read failed')
    return NextResponse.json(
      { error: 'Failed to load eligible follow-up sessions' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const access = await authorizeClinicalAccess({
    action: 'follow_up.sms_send',
    allowedRoles: ['clinician', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: 'Access denied', reason: access.reason },
      { status: access.status },
    )
  }

  try {
    const body = await request.json()
    const sessionId =
      typeof body.session_id === 'string' ? body.session_id.trim() : ''
    if (!sessionId || sessionId.length > 128) {
      return NextResponse.json({ error: 'session_id is required' }, { status: 400 })
    }

    const pool = await getPool()
    const { rows } = await pool.query(
      `SELECT fs.id,
              fs.patient_id,
              fs.patient_name,
              fs.visit_date,
              fs.provider_name,
              fs.medications,
              fs.status,
              p.phone AS patient_phone,
              nc.id AS consult_id,
              nc.triage_session_id
         FROM followup_sessions fs
         JOIN patients p
           ON p.id = fs.patient_id
          AND p.tenant_id = fs.tenant_id
         LEFT JOIN neurology_consults nc
           ON nc.intake_session_id = fs.id
          AND nc.tenant_id = fs.tenant_id
        WHERE fs.id = $1
          AND fs.tenant_id = $2
        LIMIT 2`,
      [sessionId, access.context.tenantId],
    )
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Follow-up session not found' }, { status: 404 })
    }
    if (rows.length !== 1) {
      return NextResponse.json(
        {
          error: 'Follow-up session binding is inconsistent',
          reason: 'follow_up_session_binding_conflict',
        },
        { status: 409 },
      )
    }

    const binding = rows[0] as SmsSessionBinding
    if (!binding.patient_id || binding.status !== 'idle') {
      return NextResponse.json(
        {
          error: 'Follow-up session is not eligible for SMS initiation',
          reason: 'follow_up_session_not_eligible',
        },
        { status: 409 },
      )
    }
    const destination = normalizePhoneNumber(binding.patient_phone || '')
    if (!destination) {
      return NextResponse.json(
        {
          error: 'Patient does not have a valid SMS destination',
          reason: 'follow_up_destination_missing',
        },
        { status: 409 },
      )
    }
    if (body.phone_number != null) {
      const requestedDestination = normalizePhoneNumber(String(body.phone_number))
      if (requestedDestination !== destination) {
        return NextResponse.json(
          {
            error: 'Requested destination does not match the patient record',
            reason: 'follow_up_destination_mismatch',
          },
          { status: 409 },
        )
      }
    }

    if (binding.consult_id && !binding.triage_session_id) {
      return NextResponse.json(
        {
          error: 'Follow-up SMS is blocked by triage safety state',
          reason: 'triage_authorization_missing',
        },
        { status: 409 },
      )
    }
    if (binding.triage_session_id) {
      const decision = await loadSafetyDecision(
        binding.triage_session_id,
        access.context.tenantId,
      )
      if (!decision.allowed) {
        return NextResponse.json(
          { error: 'Follow-up SMS is blocked by triage safety state', reason: decision.reason },
          { status: 409 },
        )
      }
    }

    const { rows: activeRows } = await pool.query(
      `SELECT ps.id
         FROM followup_phone_sessions ps
        WHERE ps.phone_number = $1
          AND ps.opted_out = false
          AND ps.expires_at > now()
        LIMIT 1`,
      [destination],
    )
    if (activeRows.length > 0) {
      return NextResponse.json(
        { error: 'This patient already has an active SMS session.' },
        { status: 429 },
      )
    }

    const { rows: countRows } = await pool.query(
      `SELECT count(*)::int AS count
         FROM followup_phone_sessions ps
         JOIN followup_sessions fs ON fs.id = ps.session_id
        WHERE ps.phone_number = $1
          AND fs.tenant_id = $2
          AND ps.created_at >= now() - interval '24 hours'`,
      [destination, access.context.tenantId],
    )
    if (Number(countRows[0]?.count || 0) >= 5) {
      return NextResponse.json(
        { error: 'Maximum SMS sessions reached for this patient in 24 hours.' },
        { status: 429 },
      )
    }

    const credentials = await getTwilioCredentials()
    if (
      !credentials.account_sid ||
      !credentials.auth_token ||
      !credentials.phone_number
    ) {
      return NextResponse.json(
        { error: 'SMS sending is unavailable.', twilio_configured: false },
        { status: 503 },
      )
    }

    if (binding.triage_session_id) {
      const currentDecision = await loadSafetyDecision(
        binding.triage_session_id,
        access.context.tenantId,
      )
      if (!currentDecision.allowed) {
        return NextResponse.json(
          {
            error: 'Follow-up SMS is blocked by triage safety state',
            reason: currentDecision.reason,
          },
          { status: 409 },
        )
      }
    }

    const greeting = greetingFor(binding)
    const greetingEntry = {
      role: 'agent',
      text: greeting,
      timestamp: Date.now(),
    }
    const { rows: claimedRows } = await pool.query(
      `UPDATE followup_sessions
          SET status = 'in_progress',
              current_module = 'greeting',
              follow_up_method = 'sms',
              transcript = COALESCE(transcript, '[]'::jsonb) || $3::jsonb
        WHERE id = $1
          AND tenant_id = $2
          AND status = 'idle'
        RETURNING id`,
      [sessionId, access.context.tenantId, JSON.stringify([greetingEntry])],
    )
    if (!claimedRows[0]) {
      return NextResponse.json(
        { error: 'Follow-up session was already started' },
        { status: 409 },
      )
    }

    const { rows: phoneRows } = await pool.query(
      `INSERT INTO followup_phone_sessions
         (phone_number, session_id, scenario_id, twilio_number, channel, sms_history)
       SELECT $1, fs.id, $3, $4, 'sms', $5::jsonb
         FROM followup_sessions fs
        WHERE fs.id = $2
          AND fs.tenant_id = $6
       RETURNING id`,
      [
        destination,
        sessionId,
        'tenant-session',
        credentials.phone_number,
        JSON.stringify([greetingEntry]),
        access.context.tenantId,
      ],
    )
    if (!phoneRows[0]) {
      return NextResponse.json(
        { error: 'Failed to create SMS session' },
        { status: 500 },
      )
    }

    try {
      await sendSms(destination, greeting)
    } catch {
      await Promise.allSettled([
        pool.query(
          `UPDATE followup_phone_sessions
              SET expires_at = now(), opted_out = true
            WHERE id = $1`,
          [phoneRows[0].id],
        ),
        pool.query(
          `UPDATE followup_sessions
              SET status = 'idle'
            WHERE id = $1
              AND tenant_id = $2
              AND status = 'in_progress'`,
          [sessionId, access.context.tenantId],
        ),
      ])
      return NextResponse.json({ error: 'Failed to send SMS' }, { status: 502 })
    }

    return NextResponse.json({ session_id: sessionId, status: 'sent' })
  } catch {
    console.error('[follow-up/send-sms] request failed')
    return NextResponse.json({ error: 'Failed to send SMS' }, { status: 500 })
  }
}
