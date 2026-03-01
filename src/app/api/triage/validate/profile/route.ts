import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/triage/validate/profile — check if current user has a profile
export async function GET() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return NextResponse.json({ profile: profile || null })
}

// POST /api/triage/validate/profile — create or update profile
export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { display_name, role, organization, specialty } = body

  if (!display_name || !display_name.trim()) {
    return NextResponse.json(
      { error: 'Display name is required' },
      { status: 400 }
    )
  }

  const validRoles = ['admin', 'clinician', 'investor', 'partner', 'demo']
  const safeRole = validRoles.includes(role) ? role : 'clinician'

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({
      id: user.id,
      display_name: display_name.trim(),
      role: safeRole,
      organization: organization?.trim() || null,
      specialty: specialty?.trim() || null,
      last_login: new Date().toISOString(),
    }, {
      onConflict: 'id',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ profile: data })
}
