import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { getTenantServer } from '@/lib/tenant'
import { from } from '@/lib/db-query'

// GET /api/provider-messages/threads — List threads for current tenant
export async function GET() {
  try {
    const tenant = getTenantServer()

    const { data, error } = await from('provider_threads')
      .select('*')
      .eq('tenant_id', tenant)
      .order('last_message_at', { ascending: false })
      .limit(50)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ threads: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/provider-messages/threads — Create a new thread
export async function POST(request: NextRequest) {
  try {
    const tenant = getTenantServer()
    const body = await request.json()

    const { thread_type, patient_id, subject, participants } = body

    if (!participants || participants.length === 0) {
      return NextResponse.json(
        { error: 'participants array is required' },
        { status: 400 },
      )
    }

    const { data, error } = await from('provider_threads')
      .insert({
        tenant_id: tenant,
        thread_type: thread_type || 'general',
        patient_id: patient_id || null,
        subject: subject || '',
        participants,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ thread: data }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
