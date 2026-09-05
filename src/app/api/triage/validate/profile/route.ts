import { NextRequest, NextResponse } from 'next/server'
import { authorizeClinicalAccess, clinicalAccessDeniedMessage } from '@/lib/auth/clinicalAccess'
import { from } from '@/lib/db-query'

// GET /api/triage/validate/profile — check if current user has a profile
export async function GET() {

  const access = await authorizeClinicalAccess({ action: 'triage.validate', allowedRoles: ['clinician', 'admin'] })
  if (!access.ok) return NextResponse.json({ error: clinicalAccessDeniedMessage(access.reason) }, { status: access.status })
  const user = { id: access.context.userId }

  const { data: profile } = await from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return NextResponse.json({ profile: profile || null })
}

// POST /api/triage/validate/profile — create or update profile
export async function POST(req: NextRequest) {

  const access = await authorizeClinicalAccess({ action: 'triage.validate', allowedRoles: ['clinician', 'admin'] })
  if (!access.ok) return NextResponse.json({ error: clinicalAccessDeniedMessage(access.reason) }, { status: access.status })
  const user = { id: access.context.userId }

  const body = await req.json()
  const { display_name, organization, specialty } = body

  if (!display_name || !display_name.trim()) {
    return NextResponse.json(
      { error: 'Display name is required' },
      { status: 400 }
    )
  }

  const safeRole = access.context.role

  const { data, error } = await from('user_profiles')
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
    return NextResponse.json({ error: 'Unable to save reviewer profile' }, { status: 500 })
  }

  return NextResponse.json({ profile: data })
}
