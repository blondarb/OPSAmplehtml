import { NextResponse } from 'next/server'
import { from } from '@/lib/db-query'
import { authorizeClinicalAccess, clinicalAccessDeniedMessage } from '@/lib/auth/clinicalAccess'

async function findThreadInTenant(threadId: string, tenantId: string) {
  return from('provider_threads')
    .select('id, participants')
    .eq('id', threadId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
}

function isThreadParticipant(thread: unknown, userId: string): boolean {
  if (!thread || typeof thread !== 'object') return false
  const participants = (thread as { participants?: unknown }).participants
  return Array.isArray(participants) && participants.includes(userId)
}

// GET /api/provider-messages?thread_id=... — Get messages in a thread
export async function GET(request: Request) {
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
    const { searchParams } = new URL(request.url)
    const threadId = searchParams.get('thread_id')

    if (!threadId) {
      return NextResponse.json({ error: 'thread_id is required' }, { status: 400 })
    }

    const { data: thread, error: threadError } = await findThreadInTenant(threadId, access.context.tenantId)
    if (threadError) {
      console.error('[provider-messages] thread authorization query failed')
      return NextResponse.json({ error: 'Provider messages are temporarily unavailable.' }, { status: 503 })
    }
    if (!thread) {
      return NextResponse.json({ error: 'Thread not found.' }, { status: 404 })
    }
    if (!isThreadParticipant(thread, access.context.userId)) {
      return NextResponse.json({ error: 'Thread not found.' }, { status: 404 })
    }

    const { data, error } = await from('provider_messages')
      .select('*')
      .eq('thread_id', threadId)
      .eq('tenant_id', access.context.tenantId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[provider-messages] message query failed')
      return NextResponse.json({ error: 'Provider messages are temporarily unavailable.' }, { status: 503 })
    }

    return NextResponse.json({ messages: data })
  } catch {
    console.error('[provider-messages] request failed')
    return NextResponse.json({ error: 'Provider messages are temporarily unavailable.' }, { status: 503 })
  }
}

// POST /api/provider-messages — Send a message in a thread
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

    const { thread_id, body: msgBody } = body

    if (!thread_id || typeof thread_id !== 'string' || !msgBody || typeof msgBody !== 'string') {
      return NextResponse.json(
        { error: 'thread_id and body are required' },
        { status: 400 },
      )
    }

    const { data: thread, error: threadError } = await findThreadInTenant(thread_id, access.context.tenantId)
    if (threadError) {
      console.error('[provider-messages] thread authorization query failed')
      return NextResponse.json({ error: 'Provider messages are temporarily unavailable.' }, { status: 503 })
    }
    if (!thread) {
      return NextResponse.json({ error: 'Thread not found.' }, { status: 404 })
    }
    if (!isThreadParticipant(thread, access.context.userId)) {
      return NextResponse.json({ error: 'Thread not found.' }, { status: 404 })
    }

    // Insert the message
    const { data: message, error: msgError } = await from('provider_messages')
      .insert({
        tenant_id: access.context.tenantId,
        thread_id,
        sender_id: access.context.userId,
        sender_name: access.context.email,
        body: msgBody,
      })
      .select()
      .single()

    if (msgError) {
      console.error('[provider-messages] message insert failed')
      return NextResponse.json({ error: 'Provider message could not be sent.' }, { status: 503 })
    }

    // Update thread's last_message_at
    await from('provider_threads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', thread_id)
      .eq('tenant_id', access.context.tenantId)

    return NextResponse.json({ message }, { status: 201 })
  } catch {
    console.error('[provider-messages] request failed')
    return NextResponse.json({ error: 'Provider message could not be sent.' }, { status: 503 })
  }
}
