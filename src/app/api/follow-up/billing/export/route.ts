import { NextResponse } from 'next/server'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { getPool } from '@/lib/db'

function validMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

function csvCell(value: unknown): string {
  let text = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export async function GET(request: Request) {
  const access = await authorizeClinicalAccess({
    action: 'follow_up.billing_read',
    allowedRoles: ['clinician', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: 'Access denied', reason: access.reason },
      { status: access.status },
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7)
    const format = searchParams.get('format') || 'csv'
    if (!validMonth(month) || !['csv', 'pdf'].includes(format)) {
      return NextResponse.json({ error: 'Export filters are invalid' }, { status: 400 })
    }

    const pool = await getPool()
    const { rows } = await pool.query(
      `SELECT b.*
         FROM followup_billing_entries b
         JOIN followup_sessions fs ON fs.id = b.session_id
        WHERE fs.tenant_id = $1
          AND b.billing_month = $2
        ORDER BY b.service_date ASC
        LIMIT 5001`,
      [access.context.tenantId, month],
    )
    if (rows.length > 5000) {
      return NextResponse.json(
        { error: 'Export contains too many entries; use a shorter period' },
        { status: 422 },
      )
    }

    if (format === 'csv') {
      const headers = [
        'Patient Name',
        'Service Date',
        'Program',
        'CPT Code',
        'CPT Rate',
        'Prep (min)',
        'Call (min)',
        'Documentation (min)',
        'Coordination (min)',
        'Total (min)',
        'Meets Threshold',
        'Billing Status',
        'Reviewed By',
        'Notes',
      ]

      const csvLines = [headers.map(csvCell).join(',')]
      for (const row of rows) {
        const values = [
          row.patient_name,
          row.service_date,
          row.program,
          row.cpt_code,
          row.cpt_rate,
          row.prep_minutes,
          row.call_minutes,
          row.documentation_minutes,
          row.coordination_minutes,
          row.total_minutes,
          row.meets_threshold ? 'Yes' : 'No',
          row.billing_status,
          row.reviewed_by,
          row.notes,
        ]
        csvLines.push(values.map(csvCell).join(','))
      }

      return new Response(csvLines.join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="billing-${month}.csv"`,
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    const lines = [
      'FOLLOW-UP BILLING REPORT',
      `Month: ${month}`,
      `Generated: ${new Date().toISOString().split('T')[0]}`,
      '='.repeat(70),
      '',
    ]

    for (const row of rows) {
      lines.push(`Patient: ${row.patient_name}`)
      lines.push(
        `Date: ${row.service_date}  |  Program: ${String(row.program).toUpperCase()}  |  CPT: ${row.cpt_code}`,
      )
      lines.push(
        `Time: Prep ${row.prep_minutes}m + Call ${row.call_minutes}m + Doc ${row.documentation_minutes}m + Coord ${row.coordination_minutes}m = ${row.total_minutes}m`,
      )
      lines.push(
        `Rate: $${Number(row.cpt_rate).toFixed(2)}  |  Threshold: ${row.meets_threshold ? 'Met' : 'NOT MET'}  |  Status: ${row.billing_status}`,
      )
      if (row.reviewed_by) lines.push(`Reviewed by: ${row.reviewed_by}`)
      if (row.notes) lines.push(`Notes: ${row.notes}`)
      lines.push('-'.repeat(70))
    }

    const totalRevenue = rows.reduce(
      (sum: number, row: Record<string, unknown>) =>
        row.meets_threshold ? sum + (Number(row.cpt_rate) || 0) : sum,
      0,
    )
    lines.push('')
    lines.push('SUMMARY')
    lines.push(`Total Sessions: ${rows.length}`)
    lines.push(
      `Billable Sessions: ${rows.filter((row: Record<string, unknown>) => row.meets_threshold).length}`,
    )
    lines.push(`Estimated Revenue: $${totalRevenue.toFixed(2)}`)

    return new Response(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="billing-${month}.txt"`,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    console.error('[follow-up/billing/export] request failed')
    return NextResponse.json({ error: 'Failed to export billing data' }, { status: 500 })
  }
}
