import { NextRequest, NextResponse } from 'next/server'
import { from } from '@/lib/db-query'
import { getPool } from '@/lib/db'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'

const NOTIFICATION_STATUSES = new Set([
  'unread',
  'read',
  'snoozed',
  'dismissed',
  'actioned',
])

const NOTIFICATION_SOURCE_TYPES = new Set([
  'patient_message',
  'triage_result',
  'historian_red_flag',
  'followup_escalation',
  'wearable_alert',
  'incomplete_doc',
  'intake_received',
  'visit_signed',
  'system',
])

// GET /api/notifications — List notifications with optional filters
export async function GET(request: NextRequest) {
  try {
    const access = await authorizeClinicalAccess({
      action: 'notification.read',
      allowedRoles: ['viewer', 'scheduler', 'clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }
    const tenant = access.context.tenantId

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // unread, read, etc.
    const priority = searchParams.get('priority') // critical, high, normal, low
    const sourceType = searchParams.get('source_type')
    const requestedLimit = Number.parseInt(searchParams.get('limit') || '50', 10)
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, requestedLimit))
      : 50

    let query = from('notifications')
      .select('*')
      .eq('tenant_id', tenant)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status) {
      query = query.eq('status', status)
    } else {
      // Default: exclude dismissed and old snoozed
      query = query.in('status', ['unread', 'read', 'snoozed'])
    }

    if (priority) {
      query = query.eq('priority', priority)
    }

    if (sourceType) {
      query = query.eq('source_type', sourceType)
    }

    // Exclude snoozed notifications that haven't expired
    // (snoozed items whose snooze time is still in the future)

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Filter out actively snoozed items client-side for simplicity
    const now = new Date().toISOString()
    const filtered = (data || []).filter((raw: unknown) => {
      const n = raw as { status?: string; snoozed_until?: string }
      if (n.status === 'snoozed' && n.snoozed_until && n.snoozed_until > now) {
        return false
      }
      return true
    })

    return NextResponse.json({ notifications: filtered })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/notifications — Update notification status (read, dismiss, snooze, action)
export async function PATCH(request: NextRequest) {
  try {
    const access = await authorizeClinicalAccess({
      action: 'notification.write',
      allowedRoles: ['scheduler', 'clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }

    const body = await request.json()

    const { id, ids, status, snoozed_until } = body

    if (typeof status !== 'string' || !NOTIFICATION_STATUSES.has(status)) {
      return NextResponse.json(
        { error: 'status is invalid' },
        { status: 400 },
      )
    }

    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (status === 'snoozed' && snoozed_until) {
      updateData.snoozed_until = snoozed_until
    }

    // Support single ID or batch IDs
    const candidateIds = ids || (id ? [id] : [])
    const targetIds = Array.isArray(candidateIds)
      ? candidateIds.filter(
          (candidate): candidate is string =>
            typeof candidate === 'string' && candidate.trim().length > 0,
        )
      : []
    if (targetIds.length === 0 || targetIds.length > 100) {
      return NextResponse.json({ error: 'id or ids required' }, { status: 400 })
    }

    const { data, error } = await from('notifications')
      .update(updateData)
      .in('id', targetIds)
      .eq('tenant_id', access.context.tenantId)
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ notifications: data })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/notifications — Create a notification (used by other services)
export async function POST(request: NextRequest) {
  try {
    const access = await authorizeClinicalAccess({
      action: 'notification.create',
      allowedRoles: ['clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }
    const tenant = access.context.tenantId
    const body = await request.json()

    const { source_type, source_id, patient_id, priority, title, body: notifBody, metadata, recipient_user_id } = body

    if (
      typeof source_type !== 'string' ||
      !NOTIFICATION_SOURCE_TYPES.has(source_type) ||
      typeof title !== 'string' ||
      !title.trim() ||
      title.length > 250
    ) {
      return NextResponse.json({ error: 'source_type and title are required' }, { status: 400 })
    }

    if (patient_id) {
      const pool = await getPool()
      const patientResult = await pool.query(
        `SELECT id
           FROM patients
          WHERE id = $1
            AND tenant_id = $2
          LIMIT 1`,
        [patient_id, tenant],
      )
      if (!patientResult.rows[0]) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
      }
    }

    const { data, error } = await from('notifications')
      .insert({
        tenant_id: tenant,
        recipient_user_id: recipient_user_id || null,
        source_type,
        source_id: source_id || null,
        patient_id: patient_id || null,
        priority: priority || 'normal',
        title,
        body: notifBody || '',
        metadata: metadata || {},
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ notification: data }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
