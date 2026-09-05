import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { authorizeClinicalAccess, clinicalAccessDeniedMessage } from '@/lib/auth/clinicalAccess'

export async function GET(request: Request) {
  const access = await authorizeClinicalAccess({
    action: 'patient.lookup',
    allowedRoles: ['clinician', 'scheduler', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: clinicalAccessDeniedMessage(access.reason), reason: access.reason },
      { status: access.status },
    )
  }

  const { searchParams } = new URL(request.url)
  const requestedTenant = searchParams.get('tenant_id')
  if (requestedTenant && requestedTenant !== access.context.tenantId) {
    return NextResponse.json({ error: 'Requested tenant does not match the authenticated tenant.' }, { status: 403 })
  }

  const name = searchParams.get('name')?.replace(/\s+/g, ' ').trim()
  const dob = searchParams.get('dob')?.trim()
  if (!name || name.split(' ').length < 2 || !dob || !isIsoCalendarDate(dob)) {
    return NextResponse.json({ patient_id: null }, { status: 400 })
  }

  try {
    // The bound full name is compared exactly and case-insensitively, never as
    // a LIKE pattern. The window count makes duplicate matches fail closed.
    const pool = await getPool()
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, COUNT(*) OVER ()::int AS match_count
         FROM patients
        WHERE tenant_id = $1
          AND LOWER(CONCAT_WS(' ', first_name, last_name)) = LOWER($2)
          AND date_of_birth = $3::date
        LIMIT 2`,
      [access.context.tenantId, name, dob],
    )
    const patient = rows.length === 1 && Number(rows[0]?.match_count) === 1 ? rows[0] : null
    return NextResponse.json({
      patient_id: patient?.id || null,
      patient_name: patient ? `${patient.first_name} ${patient.last_name}` : null,
    })
  } catch {
    console.error('[patient/lookup] database query failed')
    return NextResponse.json({ error: 'Patient lookup is temporarily unavailable.' }, { status: 503 })
  }
}

function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}
