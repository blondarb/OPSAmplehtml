import { NextResponse } from 'next/server'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { from } from '@/lib/db-query'

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

/**
 * GET /api/patient/lookup?name=Jane+Doe&dob=1990-01-15
 *
 * Attempts to match a patient by name and date of birth.
 * Returns { patient_id } if a match is found, or { patient_id: null } if not.
 */
export async function GET(request: Request) {
  try {
    const access = await authorizeClinicalAccess({
      action: 'patient.lookup',
      allowedRoles: ['viewer', 'scheduler', 'clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }

    const { searchParams } = new URL(request.url)
    const name = searchParams.get('name')?.trim()
    const dob = searchParams.get('dob')?.trim()

    if (!name) {
      return NextResponse.json({ patient_id: null })
    }
    if (name.length > 200) {
      return NextResponse.json({ error: 'name is too long' }, { status: 400 })
    }
    if (/[%_\\]/.test(name)) {
      return NextResponse.json(
        { error: 'name contains unsupported search characters' },
        { status: 400 },
      )
    }
    if (dob && !isValidIsoDate(dob)) {
      return NextResponse.json(
        { error: 'dob must be a valid YYYY-MM-DD date' },
        { status: 400 },
      )
    }


    // Split name into first and last parts for matching
    const nameParts = name.split(/\s+/)
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    // Try to find matching patient by name (case-insensitive) and optionally DOB
    let query = from('patients')
      .select('id, first_name, last_name, date_of_birth')
      .eq('tenant_id', access.context.tenantId)
      .ilike('first_name', firstName)

    if (lastName) {
      query = query.ilike('last_name', lastName)
    }

    if (dob) {
      query = query.eq('date_of_birth', dob)
    }

    const { data, error } = await query.limit(1).maybeSingle()

    if (error) {
      console.error('[patient/lookup] lookup failed')
      return NextResponse.json(
        { error: 'Patient lookup unavailable' },
        { status: 503 },
      )
    }

    return NextResponse.json({
      patient_id: data?.id || null,
      patient_name: data ? `${data.first_name} ${data.last_name}` : null,
    })
  } catch {
    console.error('[patient/lookup] request failed')
    return NextResponse.json(
      { error: 'Patient lookup unavailable' },
      { status: 503 },
    )
  }
}
