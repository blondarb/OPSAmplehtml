import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { getTenantServer } from '@/lib/tenant'
import { from } from '@/lib/db-query'

/**
 * PATCH /api/patient/messages/draft — Approve, reject, or send an AI draft
 *
 * Body: { message_id, action: 'approve' | 'reject' | 'send', edited_draft?: string }
 *
 * - approve: sets draft_status = 'approved' (physician has reviewed)
 * - reject: sets draft_status = 'rejected', clears ai_draft
 * - send: sets draft_status = 'sent', creates an outbound message row
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { message_id, action, edited_draft } = body

    if (!message_id || !action) {
      return NextResponse.json(
        { error: 'message_id and action are required' },
        { status: 400 },
      )
    }

    if (!['approve', 'reject', 'send'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be approve, reject, or send' },
        { status: 400 },
      )
    }

    const tenant = getTenantServer()

    if (action === 'reject') {
      const { data, error } = await from('patient_messages')
        .update({
          ai_draft: null,
          draft_status: 'rejected',
        })
        .eq('id', message_id)
        .eq('tenant_id', tenant)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ message: data })
    }

    if (action === 'approve') {
      const updateData: Record<string, unknown> = { draft_status: 'approved' }
      if (edited_draft) {
        updateData.ai_draft = edited_draft
      }

      const { data, error } = await from('patient_messages')
        .update(updateData)
        .eq('id', message_id)
        .eq('tenant_id', tenant)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ message: data })
    }

    // action === 'send'
    // 1. Get the original message to extract context
    const { data: original, error: fetchErr } = await from('patient_messages')
      .select('*')
      .eq('id', message_id)
      .eq('tenant_id', tenant)
      .single()

    if (fetchErr || !original) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    const draftText = edited_draft || original.ai_draft
    if (!draftText) {
      return NextResponse.json({ error: 'No draft text to send' }, { status: 400 })
    }

    // 2. Mark the original message's draft as sent
    await from('patient_messages')
      .update({ draft_status: 'sent' })
      .eq('id', message_id)

    // 3. Create outbound message
    const { data: outbound, error: insertErr } = await from('patient_messages')
      .insert({
        tenant_id: tenant,
        patient_name: original.patient_name,
        patient_id: original.patient_id || null,
        subject: `Re: ${original.subject || ''}`,
        body: draftText,
        direction: 'outbound',
        in_reply_to: message_id,
      })
      .select()
      .single()

    if (insertErr) {
      console.error('[draft/send] Outbound insert error:', insertErr)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    return NextResponse.json({ message: outbound, original_message_id: message_id })
  } catch (err: any) {
    console.error('Draft action error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * GET /api/patient/messages/draft — List messages with pending AI drafts
 */
export async function GET() {
  try {
    const tenant = getTenantServer()

    const { data, error } = await from('patient_messages')
      .select('*')
      .eq('tenant_id', tenant)
      .eq('draft_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ messages: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
