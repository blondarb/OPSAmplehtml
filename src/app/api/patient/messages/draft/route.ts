import { NextRequest, NextResponse } from 'next/server'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
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
    const access = await authorizeClinicalAccess({
      action: 'patient.message_draft_review',
      allowedRoles: ['clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
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

    const tenant = access.context.tenantId

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
        console.error('[patient/messages/draft] rejection update failed')
        return NextResponse.json(
          { error: 'Failed to update message draft' },
          { status: 500 },
        )
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
        console.error('[patient/messages/draft] approval update failed')
        return NextResponse.json(
          { error: 'Failed to update message draft' },
          { status: 500 },
        )
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
      .eq('tenant_id', tenant)

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
      console.error('[patient/messages/draft] outbound insert failed')
      return NextResponse.json(
        { error: 'Failed to send message draft' },
        { status: 500 },
      )
    }

    return NextResponse.json({ message: outbound, original_message_id: message_id })
  } catch {
    console.error('[patient/messages/draft] request failed')
    return NextResponse.json(
      { error: 'Failed to update message draft' },
      { status: 500 },
    )
  }
}

/**
 * GET /api/patient/messages/draft — List messages with pending AI drafts
 */
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
      .eq('draft_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('[patient/messages/draft] pending list failed')
      return NextResponse.json(
        { error: 'Failed to fetch pending drafts' },
        { status: 500 },
      )
    }

    return NextResponse.json({ messages: data || [] })
  } catch {
    console.error('[patient/messages/draft] list request failed')
    return NextResponse.json(
      { error: 'Failed to fetch pending drafts' },
      { status: 500 },
    )
  }
}
