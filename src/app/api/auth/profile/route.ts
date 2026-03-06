import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { from } from '@/lib/db-query'

// GET /api/auth/profile — fetch current user's profile
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await from('user_profiles')
    .select('id, display_name, role, organization, specialty')
    .eq('id', user.id)
    .single()

  return NextResponse.json({ profile: profile || null })
}
