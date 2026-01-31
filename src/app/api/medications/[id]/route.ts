import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getTenantServer } from '@/lib/tenant'

// GET /api/medications/[id] — get single medication
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenant = getTenantServer()

  const { data: medication, error } = await supabase
    .from('patient_medications')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenant)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  return NextResponse.json({ medication })
}

// PATCH /api/medications/[id] — update medication
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const allowedFields = [
    'medication_name', 'generic_name', 'dosage', 'frequency', 'route',
    'start_date', 'end_date', 'prescriber', 'indication', 'status',
    'discontinue_reason', 'notes', 'confirmed_by_user',
  ]

  const updateData: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field]
    }
  }

  // When discontinuing, set end_date if not provided
  if (updateData.status === 'discontinued' && !updateData.end_date) {
    updateData.end_date = new Date().toISOString().split('T')[0]
  }

  const tenant = getTenantServer()

  const { data: medication, error } = await supabase
    .from('patient_medications')
    .update(updateData)
    .eq('id', id)
    .eq('tenant_id', tenant)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ medication })
}

// DELETE /api/medications/[id] — hard delete
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenant = getTenantServer()

  const { error } = await supabase
    .from('patient_medications')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenant)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
