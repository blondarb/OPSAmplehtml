import { NextResponse } from 'next/server'
import { from } from '@/lib/db-query'
import { authorizeClinicalAccess, clinicalAccessDeniedMessage } from '@/lib/auth/clinicalAccess'

function isParticipant(thread: Record<string, unknown>, userId: string): boolean {
  return Array.isArray(thread.participants) && thread.participants.includes(userId)
}

async function patientExistsInTenant(patientId: string, tenantId: string) {
  return from('patients')
    .select('id')
    .eq('id', patientId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
}

// GET /api/provider-messages/threads — List only the caller's tenant-bound threads.
export async function GET() {
  const access = await authorizeClinicalAccess({
    action: 'patient.message_read',
    allowedRoles: ['clinician', 'scheduler', 'admin', 'viewer'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: clinicalAccessDeniedMessage(access.reason), reason: access.reason },
      { status: access.status },
    )
  }

  try {
    const { data, error } = await from('provider_threads')
      .select('*')
      .eq('tenant_id', access.context.tenantId)
      .order('last_message_at', { ascending: false })
      .limit(50)
    if (error) {
      console.error('[provider-messages/threads] thread query failed')
      return NextResponse.json({ error: 'Provider messages are temporarily unavailable.' }, { status: 503 })
    }

    const threads = Array.isArray(data)
      ? data.filter((thread): thread is Record<string, unknown> =>
          !!thread && typeof thread === 'object' && isParticipant(thread as Record<string, unknown>, access.context.userId),
        )
      : []
    return NextResponse.json({ threads })
  } catch {
    console.error('[provider-messages/threads] request failed')
    return NextResponse.json({ error: 'Provider messages are temporarily unavailable.' }, { status: 503 })
  }
}

// POST /api/provider-messages/threads — Create a tenant- and participant-bound thread.
export async function POST(request: Request) {
  const access = await authorizeClinicalAccess({
    action: 'patient.message_write',
    allowedRoles: ['clinician', 'scheduler', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: clinicalAccessDeniedMessage(access.reason), reason: access.reason },
      { status: access.status },
    )
  }

  try {
    const body = await request.json()
    const { thread_type, patient_id, subject, participants } = body
    if (!Array.isArray(participants) || participants.length === 0 || !participants.every((participant) => typeof participant === 'string' && participant.length > 0)) {
      return NextResponse.json({ error: 'participants array is required' }, { status: 400 })
    }
    if (!participants.includes(access.context.userId)) {
      return NextResponse.json({ error: 'The authenticated user must be a thread participant.' }, { status: 403 })
    }
    if (patient_id !== undefined && patient_id !== null) {
      if (typeof patient_id !== 'string') {
        return NextResponse.json({ error: 'patient_id must be a string.' }, { status: 400 })
      }
      const { data: patient, error: patientError } = await patientExistsInTenant(patient_id, access.context.tenantId)
      if (patientError) {
        console.error('[provider-messages/threads] patient authorization query failed')
        return NextResponse.json({ error: 'Provider messages are temporarily unavailable.' }, { status: 503 })
      }
      if (!patient) {
        return NextResponse.json({ error: 'Patient not found.' }, { status: 404 })
      }
    }

    const { data, error } = await from('provider_threads')
      .insert({
        tenant_id: access.context.tenantId,
        thread_type: typeof thread_type === 'string' ? thread_type : 'general',
        patient_id: patient_id || null,
        subject: typeof subject === 'string' ? subject : '',
        participants: [...new Set(participants)],
      })
      .select()
      .single()
    if (error) {
      console.error('[provider-messages/threads] thread insert failed')
      return NextResponse.json({ error: 'Provider thread could not be created.' }, { status: 503 })
    }
    return NextResponse.json({ thread: data }, { status: 201 })
  } catch {
    console.error('[provider-messages/threads] request failed')
    return NextResponse.json({ error: 'Provider thread could not be created.' }, { status: 503 })
  }
}
