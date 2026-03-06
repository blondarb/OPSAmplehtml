import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { from } from '@/lib/db-query'

// PATCH /api/triage/[id]/patient — link a patient to a triage session
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: sessionId } = await params
  const { patient_id } = await request.json()

  if (!patient_id) {
    return NextResponse.json({ error: 'patient_id is required' }, { status: 400 })
  }

  const { error } = await from('triage_sessions')
    .update({ patient_id })
    .eq('id', sessionId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
