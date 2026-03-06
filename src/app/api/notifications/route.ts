import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { getTenantServer } from '@/lib/tenant'
import { from } from '@/lib/db-query'

// GET /api/notifications — List notifications with optional filters
export async function GET(request: NextRequest) {
  try {
    const tenant = getTenantServer()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // unread, read, etc.
    const priority = searchParams.get('priority') // critical, high, normal, low
    const sourceType = searchParams.get('source_type')
    const limit = parseInt(searchParams.get('limit') || '50', 10)

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
    const filtered = (data || []).filter((n: any) => {
      if (n.status === 'snoozed' && n.snoozed_until && n.snoozed_until > now) {
        return false
      }
      return true
    })

    return NextResponse.json({ notifications: filtered })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH /api/notifications — Update notification status (read, dismiss, snooze, action)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()

    const { id, ids, status, snoozed_until } = body

    if (!status) {
      return NextResponse.json({ error: 'status is required' }, { status: 400 })
    }

    const updateData: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (status === 'snoozed' && snoozed_until) {
      updateData.snoozed_until = snoozed_until
    }

    // Support single ID or batch IDs
    const targetIds = ids || (id ? [id] : [])
    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'id or ids required' }, { status: 400 })
    }

    const { data, error } = await from('notifications')
      .update(updateData)
      .in('id', targetIds)
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ notifications: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/notifications — Create a notification (used by other services)
export async function POST(request: NextRequest) {
  try {
    const tenant = getTenantServer()
    const body = await request.json()

    const { source_type, source_id, patient_id, priority, title, body: notifBody, metadata, recipient_user_id } = body

    if (!source_type || !title) {
      return NextResponse.json({ error: 'source_type and title are required' }, { status: 400 })
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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
