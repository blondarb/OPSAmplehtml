import { NextResponse } from 'next/server'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { getPool } from '@/lib/db'
import { from } from '@/lib/db-query'
import { notifyPatientMessage } from '@/lib/notifications'

// POST /api/patient/messages — Send a patient message
export async function POST(request: Request) {
  try {
    const access = await authorizeClinicalAccess({
      action: 'patient.message_write',
      allowedRoles: ['scheduler', 'clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }

    const body = await request.json()

    const { patient_name, body: msgBody } = body
    if (!patient_name || !msgBody) {
      return NextResponse.json(
        { error: 'patient_name and body are required' },
        { status: 400 },
      )
    }

    if (body.patient_id) {
      if (typeof body.patient_id !== 'string') {
        return NextResponse.json(
          { error: 'patient_id must be a string' },
          { status: 400 },
        )
      }

      const pool = await getPool()
      const { rows } = await pool.query(
        `SELECT id
           FROM patients
          WHERE id = $1
            AND tenant_id = $2
          LIMIT 1`,
        [body.patient_id, access.context.tenantId],
      )
      if (!rows[0]) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
      }
    }

    const insertData: Record<string, unknown> = {
      tenant_id: access.context.tenantId,
      patient_name: body.patient_name,
      subject: body.subject || '',
      body: msgBody,
      direction: 'inbound',
    }

    // Link to patient record if patient_id is provided
    if (body.patient_id) {
      insertData.patient_id = body.patient_id
    }

    const { data, error } = await from('patient_messages')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.error('[patient/messages] message insert failed')
      return NextResponse.json(
        { error: 'Failed to save message' },
        { status: 500 },
      )
    }

    // Generate notification for the clinical team
    try {
      await notifyPatientMessage(
        data?.id || '',
        body.patient_name,
        body.subject || msgBody.substring(0, 100),
        body.patient_id || null,
        access.context.tenantId,
      )
    } catch (notifErr) {
      // Non-fatal — the message is saved regardless
      console.error('[messages] Notification error (non-fatal):', notifErr)
    }

    return NextResponse.json({ message: data }, { status: 201 })
  } catch {
    console.error('[patient/messages] request failed')
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
  }
}

// GET /api/patient/messages — List messages for current tenant
export async function GET() {
  try {
    const access = await authorizeClinicalAccess({
      action: 'patient.message_read',
      allowedRoles: ['viewer', 'scheduler', 'clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }

    const { data, error } = await from('patient_messages')
      .select('*')
      .eq('tenant_id', access.context.tenantId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('[patient/messages] message list failed')
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 },
      )
    }

    return NextResponse.json({ messages: data })
  } catch {
    console.error('[patient/messages] list request failed')
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 },
    )
  }
}
