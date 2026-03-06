import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenantServer } from '@/lib/tenant'
import { from } from '@/lib/db-query'

// GET /api/consults — List consult requests
export async function GET(request: NextRequest) {
  try {
    const tenant = getTenantServer()

    const { searchParams } = new URL(request.url)
    const role = searchParams.get('role') // 'requester' or 'recipient'
    const userId = searchParams.get('user_id')
    const patientId = searchParams.get('patient_id')
    const status = searchParams.get('status')

    let query = from('consult_requests')
      .select('*')
      .eq('tenant_id', tenant)
      .order('created_at', { ascending: false })
      .limit(50)

    if (role === 'recipient' && userId) {
      query = query.eq('recipient_id', userId)
    } else if (role === 'requester' && userId) {
      query = query.eq('requester_id', userId)
    }

    if (patientId) {
      query = query.eq('patient_id', patientId)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ consults: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/consults — Create a consult request
export async function POST(request: NextRequest) {
  try {
    const tenant = getTenantServer()
    const body = await request.json()

    const {
      requester_id, requester_name, recipient_id, recipient_name,
      patient_id, patient_name, consult_type, urgency, question,
    } = body

    if (!requester_id || !recipient_id || !consult_type || !question) {
      return NextResponse.json(
        { error: 'requester_id, recipient_id, consult_type, and question are required' },
        { status: 400 },
      )
    }

    const { data, error } = await from('consult_requests')
      .insert({
        tenant_id: tenant,
        requester_id,
        requester_name: requester_name || null,
        recipient_id,
        recipient_name: recipient_name || null,
        patient_id: patient_id || null,
        patient_name: patient_name || null,
        consult_type,
        urgency: urgency || 'routine',
        question,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ consult: data }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH /api/consults — Update consult status or add response
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()

    const { id, status, response } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (status) updateData.status = status
    if (response) updateData.response = response

    const { data, error } = await from('consult_requests')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ consult: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
