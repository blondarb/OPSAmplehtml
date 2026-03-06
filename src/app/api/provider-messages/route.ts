import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenantServer } from '@/lib/tenant'
import { from } from '@/lib/db-query'

// GET /api/provider-messages?thread_id=... — Get messages in a thread
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const threadId = searchParams.get('thread_id')

    if (!threadId) {
      return NextResponse.json({ error: 'thread_id is required' }, { status: 400 })
    }

    const { data, error } = await from('provider_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ messages: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/provider-messages — Send a message in a thread
export async function POST(request: NextRequest) {
  try {
    const tenant = getTenantServer()
    const body = await request.json()

    const { thread_id, sender_id, sender_name, body: msgBody } = body

    if (!thread_id || !sender_id || !msgBody) {
      return NextResponse.json(
        { error: 'thread_id, sender_id, and body are required' },
        { status: 400 },
      )
    }

    // Insert the message
    const { data: message, error: msgError } = await from('provider_messages')
      .insert({
        tenant_id: tenant,
        thread_id,
        sender_id,
        sender_name: sender_name || null,
        body: msgBody,
      })
      .select()
      .single()

    if (msgError) {
      return NextResponse.json({ error: msgError.message }, { status: 500 })
    }

    // Update thread's last_message_at
    await from('provider_threads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', thread_id)

    return NextResponse.json({ message }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
