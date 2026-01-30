import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getTenantServer } from '@/lib/tenant'

// GET /api/phrases/[id] - Get a single phrase
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

  const { data: phrase, error } = await supabase
    .from('dot_phrases')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('tenant_id', tenant)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  return NextResponse.json({ phrase })
}

// PUT /api/phrases/[id] - Update a phrase
export async function PUT(
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
  const { trigger_text, expansion_text, category, description, is_active, scope } = body

  const updateData: Record<string, unknown> = {}
  if (trigger_text !== undefined) {
    updateData.trigger_text = trigger_text.startsWith('.')
      ? trigger_text.toLowerCase()
      : `.${trigger_text.toLowerCase()}`
  }
  if (expansion_text !== undefined) updateData.expansion_text = expansion_text
  if (category !== undefined) updateData.category = category
  if (description !== undefined) updateData.description = description
  if (is_active !== undefined) updateData.is_active = is_active
  if (scope !== undefined) updateData.scope = scope

  const tenant = getTenantServer()

  const { data: phrase, error } = await supabase
    .from('dot_phrases')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('tenant_id', tenant)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ phrase })
}

// DELETE /api/phrases/[id] - Delete a phrase
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
    .from('dot_phrases')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('tenant_id', tenant)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// PATCH /api/phrases/[id] - Track phrase usage
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

  const tenant = getTenantServer()

  // First get the current use_count
  const { data: currentPhrase, error: fetchError } = await supabase
    .from('dot_phrases')
    .select('use_count')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('tenant_id', tenant)
    .single()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 404 })
  }

  // Increment use_count and update last_used
  const { error: updateError } = await supabase
    .from('dot_phrases')
    .update({
      last_used: new Date().toISOString(),
      use_count: (currentPhrase?.use_count || 0) + 1
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('tenant_id', tenant)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
