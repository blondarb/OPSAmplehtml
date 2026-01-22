import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/phrases - List all phrases for current user
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: phrases, error } = await supabase
    .from('dot_phrases')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('use_count', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ phrases })
}

// POST /api/phrases - Create a new phrase
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { trigger_text, expansion_text, category, description } = body

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

  const { data: phrase, error } = await supabase
    .from('dot_phrases')
    .insert({
      user_id: user.id,
      trigger_text: normalizedTrigger,
      expansion_text,
      category: category || 'General',
      description
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
