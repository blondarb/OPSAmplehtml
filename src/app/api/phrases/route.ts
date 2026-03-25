import { getUser } from '@/lib/cognito/server'
import { NextResponse } from 'next/server'
import { getTenantServer } from '@/lib/tenant'
import { from } from '@/lib/db-query'

// GET /api/phrases - List all phrases for current user
// Optional query param: ?scope=hpi|assessment|plan|ros|allergies (returns global + scoped)
export async function GET(request: Request) {

  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenant = getTenantServer()

  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope')

  let query = from('dot_phrases')
    .select('*')
    .eq('user_id', user.id)
    .eq('tenant_id', tenant)
    .eq('is_active', true)
    .order('use_count', { ascending: false })

  // If a scope is provided, return only global phrases and those matching the scope
  if (scope) {
    query = query.in('scope', ['global', scope])
  }

  const { data: phrases, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ phrases })
}

// POST /api/phrases - Create a new phrase
export async function POST(request: Request) {

  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { trigger_text, expansion_text, category, description, scope } = body

  if (!trigger_text || !expansion_text) {
    return NextResponse.json(
      { error: 'trigger_text and expansion_text are required' },
      { status: 400 }
    )
  }

  // Ensure trigger starts with a dot
  const normalizedTrigger = trigger_text.startsWith('.')
    ? trigger_text.toLowerCase()
    : `.${trigger_text.toLowerCase()}`

  const tenant = getTenantServer()

  const { data: phrase, error } = await from('dot_phrases')
    .insert({
      tenant_id: tenant,
      user_id: user.id,
      trigger_text: normalizedTrigger,
      expansion_text,
      category: category || 'General',
      description,
      scope: scope || 'global'
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') { // Unique constraint violation
      return NextResponse.json(
        { error: 'A phrase with this trigger already exists' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ phrase }, { status: 201 })
}
