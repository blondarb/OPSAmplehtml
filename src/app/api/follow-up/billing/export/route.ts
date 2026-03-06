import { NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { from } from '@/lib/db-query'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7)
    const format = searchParams.get('format') || 'csv'


    const { data: entries, error } = await from('followup_billing_entries')
      .select('*')
      .eq('billing_month', month)
      .order('service_date', { ascending: true })

    if (error) {
      console.error('Billing export query error:', error)
      return NextResponse.json({ error: 'Failed to fetch billing data' }, { status: 500 })
    }

    const rows = entries || []

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

      const csvLines = [headers.join(',')]
      for (const row of rows) {
        const r = row as Record<string, unknown>
        const values = [
          `"${String(r.patient_name || '').replace(/"/g, '""')}"`,
          r.service_date,
          r.program,
          r.cpt_code,
          r.cpt_rate,
          r.prep_minutes,
          r.call_minutes,
          r.documentation_minutes,
          r.coordination_minutes,
          r.total_minutes,
          r.meets_threshold ? 'Yes' : 'No',
          r.billing_status,
          `"${String(r.reviewed_by || '').replace(/"/g, '""')}"`,
          `"${String(r.notes || '').replace(/"/g, '""')}"`,
        ]
        csvLines.push(values.join(','))
      }

      const csv = csvLines.join('\n')
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename=billing-${month}.csv`,
        },
      })
    }

    // Text format (print-friendly) for PDF placeholder
    const lines = [
      `FOLLOW-UP BILLING REPORT`,
      `Month: ${month}`,
      `Generated: ${new Date().toISOString().split('T')[0]}`,
      `${'='.repeat(70)}`,
      '',
    ]

    for (const row of rows) {
      const r = row as Record<string, unknown>
      lines.push(`Patient: ${r.patient_name}`)
      lines.push(`Date: ${r.service_date}  |  Program: ${String(r.program).toUpperCase()}  |  CPT: ${r.cpt_code}`)
      lines.push(`Time: Prep ${r.prep_minutes}m + Call ${r.call_minutes}m + Doc ${r.documentation_minutes}m + Coord ${r.coordination_minutes}m = ${r.total_minutes}m`)
      lines.push(`Rate: $${Number(r.cpt_rate).toFixed(2)}  |  Threshold: ${r.meets_threshold ? 'Met' : 'NOT MET'}  |  Status: ${r.billing_status}`)
      if (r.reviewed_by) lines.push(`Reviewed by: ${r.reviewed_by}`)
      if (r.notes) lines.push(`Notes: ${r.notes}`)
      lines.push(`${'-'.repeat(70)}`)
    }

    // Summary
    const totalRevenue = rows.reduce(
      (sum: number, r: Record<string, unknown>) =>
        (r as Record<string, unknown>).meets_threshold ? sum + (Number((r as Record<string, unknown>).cpt_rate) || 0) : sum,
      0
    )
    lines.push('')
    lines.push(`SUMMARY`)
    lines.push(`Total Sessions: ${rows.length}`)
    lines.push(`Billable Sessions: ${rows.filter((r: Record<string, unknown>) => r.meets_threshold).length}`)
    lines.push(`Estimated Revenue: $${totalRevenue.toFixed(2)}`)

    const text = lines.join('\n')
    return new Response(text, {
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename=billing-${month}.txt`,
      },
    })
  } catch (error) {
    console.error('Billing export error:', error)
    const message = error instanceof Error ? error.message : 'Failed to export billing data'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
