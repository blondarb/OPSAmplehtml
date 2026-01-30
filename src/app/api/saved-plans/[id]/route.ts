import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getTenantServer } from '@/lib/tenant'

// GET /api/saved-plans/[id] - Get a single saved plan
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

  const { data: plan, error } = await supabase
    .from('saved_plans')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('tenant_id', tenant)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  return NextResponse.json({ plan })
}

// PUT /api/saved-plans/[id] - Update a saved plan
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
  const { name, description, selected_items, custom_items, is_default } = body

  const updateData: Record<string, unknown> = {}
  if (name !== undefined) updateData.name = name
  if (description !== undefined) updateData.description = description
  if (selected_items !== undefined) updateData.selected_items = selected_items
  if (custom_items !== undefined) updateData.custom_items = custom_items
  if (is_default !== undefined) updateData.is_default = is_default

  const tenant = getTenantServer()

  const { data: plan, error } = await supabase
    .from('saved_plans')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('tenant_id', tenant)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ plan })
}

// DELETE /api/saved-plans/[id] - Delete a saved plan
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
    .from('saved_plans')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('tenant_id', tenant)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// PATCH /api/saved-plans/[id] - Track usage (increment use_count + set last_used)
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

  // Get current use_count
  const { data: current, error: fetchError } = await supabase
    .from('saved_plans')
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
    .from('saved_plans')
    .update({
      last_used: new Date().toISOString(),
      use_count: (current?.use_count || 0) + 1,
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('tenant_id', tenant)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
