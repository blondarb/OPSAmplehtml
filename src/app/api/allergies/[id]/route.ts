import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getTenantServer } from '@/lib/tenant'

// GET /api/allergies/[id] — get single allergy
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

  const { data: allergy, error } = await supabase
    .from('patient_allergies')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenant)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  return NextResponse.json({ allergy })
}

// PATCH /api/allergies/[id] — update allergy
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
    'allergen', 'allergen_type', 'reaction', 'severity',
    'is_active', 'notes', 'confirmed_by_user',
  ]

  const updateData: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field]
    }
  }

  const tenant = getTenantServer()

  const { data: allergy, error } = await supabase
    .from('patient_allergies')
    .update(updateData)
    .eq('id', id)
    .eq('tenant_id', tenant)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ allergy })
}

// DELETE /api/allergies/[id] — hard delete
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
    .from('patient_allergies')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenant)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
