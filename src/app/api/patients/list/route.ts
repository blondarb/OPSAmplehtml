import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { from } from '@/lib/db-query'

// GET /api/patients/list — lightweight patient list for selectors/dropdowns
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: patients, error } = await from('patients')
    .select('id, first_name, last_name, date_of_birth')
    .order('last_name')
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ patients: patients || [] })
}
