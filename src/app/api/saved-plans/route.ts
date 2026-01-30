import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getTenantServer } from '@/lib/tenant'

const MAX_SAVED_PLANS = 10

// GET /api/saved-plans - List saved plans for current user
export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenant = getTenantServer()
  const { searchParams } = new URL(request.url)
  const sourcePlanKey = searchParams.get('source_plan_key')

  let query = supabase
    .from('saved_plans')
    .select('*')
    .eq('user_id', user.id)
    .eq('tenant_id', tenant)
    .order('use_count', { ascending: false })

  if (sourcePlanKey) {
    query = query.eq('source_plan_key', sourcePlanKey)
  }

  const { data: plans, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ plans })
}

// POST /api/saved-plans - Create a new saved plan
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenant = getTenantServer()
  const body = await request.json()
  const { name, description, source_plan_key, selected_items, custom_items } = body

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  // Enforce soft limit
  const { count, error: countError } = await supabase
    .from('saved_plans')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('tenant_id', tenant)

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 })
  }

  if ((count || 0) >= MAX_SAVED_PLANS) {
    return NextResponse.json(
      { error: `Maximum of ${MAX_SAVED_PLANS} saved plans reached. Delete an existing plan to save a new one.` },
      { status: 409 }
    )
  }

  const { data: plan, error } = await supabase
    .from('saved_plans')
    .insert({
      tenant_id: tenant,
      user_id: user.id,
      name,
      description: description || null,
      source_plan_key: source_plan_key || null,
      selected_items: selected_items || {},
      custom_items: custom_items || {},
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ plan }, { status: 201 })
}
