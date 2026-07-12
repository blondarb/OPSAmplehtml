import { NextResponse } from 'next/server'
import { suggestCptCode, CPT_CODES } from '@/lib/follow-up/cptCodes'
import type { BillingMonthlySummary } from '@/lib/follow-up/billingTypes'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { getPool } from '@/lib/db'

const BILLING_STATUSES = new Set([
  'not_reviewed',
  'pending_review',
  'ready_to_bill',
  'billed',
])

function validMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

function validDate(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`))
}

function minutes(value: unknown): number | null {
  const parsed = Number(value ?? 0)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 1440
    ? parsed
    : null
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
    if (!validMonth(month)) {
      return NextResponse.json({ error: 'month is invalid' }, { status: 400 })
    }

    const pool = await getPool()
    const { rows: flatEntries } = await pool.query(
      `SELECT b.*,
              fs.follow_up_method,
              fs.escalation_level,
              fs.status AS conversation_status
         FROM followup_billing_entries b
         JOIN followup_sessions fs ON fs.id = b.session_id
        WHERE fs.tenant_id = $1
          AND b.billing_month = $2
        ORDER BY b.service_date DESC
        LIMIT 5000`,
      [access.context.tenantId, month],
    )

    const billableEntries = flatEntries.filter(
      (entry: Record<string, unknown>) => entry.meets_threshold === true,
    )
    const summary: BillingMonthlySummary = {
      totalSessions: flatEntries.length,
      billableSessions: billableEntries.length,
      totalBillableMinutes: billableEntries.reduce(
        (sum: number, entry: Record<string, unknown>) =>
          sum + (Number(entry.total_minutes) || 0),
        0,
      ),
      estimatedRevenue: billableEntries.reduce(
        (sum: number, entry: Record<string, unknown>) =>
          sum + (Number(entry.cpt_rate) || 0),
        0,
      ),
    }

    return NextResponse.json({ entries: flatEntries, summary })
  } catch {
    console.error('[follow-up/billing] read failed')
    return NextResponse.json({ error: 'Failed to fetch billing data' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const access = await authorizeClinicalAccess({
    action: 'follow_up.billing_write',
    allowedRoles: ['clinician', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: 'Access denied', reason: access.reason },
      { status: access.status },
    )
  }

  try {
    const body = await request.json()
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    const sessionId =
      typeof body.session_id === 'string' ? body.session_id.trim() : ''
    const program = body.program === 'tcm' ? 'tcm' : body.program === 'ccm' ? 'ccm' : null
    const billingStatus =
      typeof body.billing_status === 'string' && BILLING_STATUSES.has(body.billing_status)
        ? body.billing_status
        : null
    const serviceDate =
      typeof body.service_date === 'string'
        ? body.service_date
        : new Date().toISOString().split('T')[0]
    const billingMonth = serviceDate.slice(0, 7)
    const prepMinutes = minutes(body.prep_minutes)
    const callMinutes = minutes(body.call_minutes)
    const documentationMinutes = minutes(body.documentation_minutes)
    const coordinationMinutes = minutes(body.coordination_minutes)
    const notes = body.notes == null ? null : String(body.notes)
    const tcmDischargeDate =
      body.tcm_discharge_date == null || body.tcm_discharge_date === ''
        ? null
        : String(body.tcm_discharge_date)

    if (
      !sessionId ||
      sessionId.length > 128 ||
      id.length > 128 ||
      !program ||
      !billingStatus ||
      !validDate(serviceDate) ||
      !validMonth(billingMonth) ||
      prepMinutes == null ||
      callMinutes == null ||
      documentationMinutes == null ||
      coordinationMinutes == null ||
      (tcmDischargeDate != null && !validDate(tcmDischargeDate)) ||
      (notes != null && notes.length > 4000)
    ) {
      return NextResponse.json({ error: 'Billing input is invalid' }, { status: 400 })
    }

    const totalMinutes =
      prepMinutes + callMinutes + documentationMinutes + coordinationMinutes
    if (totalMinutes > 1440) {
      return NextResponse.json({ error: 'Billing time exceeds one day' }, { status: 400 })
    }

    const requestedCpt =
      typeof body.cpt_code === 'string' ? CPT_CODES[body.cpt_code] : undefined
    const cptCode =
      requestedCpt?.program === program
        ? requestedCpt.code
        : suggestCptCode(program, totalMinutes)
    const cptDefinition = CPT_CODES[cptCode]
    const reviewed = billingStatus === 'ready_to_bill' || billingStatus === 'billed'
    const reviewedBy = reviewed ? access.context.userId : null
    const reviewedAt = reviewed ? new Date().toISOString() : null
    const tcmContactWithin2Days =
      typeof body.tcm_contact_within_2_days === 'boolean'
        ? body.tcm_contact_within_2_days
        : null
    const tcmF2fScheduled =
      typeof body.tcm_f2f_scheduled === 'boolean'
        ? body.tcm_f2f_scheduled
        : null

    const writeValues = [
      serviceDate,
      billingMonth,
      program,
      cptCode,
      cptDefinition.rate,
      prepMinutes,
      callMinutes,
      documentationMinutes,
      coordinationMinutes,
      totalMinutes,
      totalMinutes >= cptDefinition.minMinutes,
      billingStatus,
      reviewedBy,
      reviewedAt,
      notes,
      tcmDischargeDate,
      tcmContactWithin2Days,
      tcmF2fScheduled,
    ]

    const pool = await getPool()
    let rows: Record<string, unknown>[]
    if (id) {
      const result = await pool.query(
        `WITH authorized AS (
           SELECT b.id, fs.patient_id, fs.patient_name
             FROM followup_billing_entries b
             JOIN followup_sessions fs ON fs.id = b.session_id
            WHERE b.id = $1
              AND b.session_id = $2
              AND fs.tenant_id = $3
         )
         UPDATE followup_billing_entries b
            SET patient_id = authorized.patient_id,
                patient_name = authorized.patient_name,
                service_date = $4,
                billing_month = $5,
                program = $6,
                cpt_code = $7,
                cpt_rate = $8,
                prep_minutes = $9,
                call_minutes = $10,
                documentation_minutes = $11,
                coordination_minutes = $12,
                total_minutes = $13,
                meets_threshold = $14,
                billing_status = $15,
                reviewed_by = $16,
                reviewed_at = $17,
                notes = $18,
                tcm_discharge_date = $19,
                tcm_contact_within_2_days = $20,
                tcm_f2f_scheduled = $21,
                updated_at = now()
           FROM authorized
          WHERE b.id = authorized.id
          RETURNING b.*`,
        [id, sessionId, access.context.tenantId, ...writeValues],
      )
      rows = result.rows
    } else {
      const result = await pool.query(
        `INSERT INTO followup_billing_entries (
           session_id, patient_id, patient_name, service_date, billing_month,
           program, cpt_code, cpt_rate, prep_minutes, call_minutes,
           documentation_minutes, coordination_minutes, total_minutes,
           meets_threshold, billing_status, reviewed_by, reviewed_at, notes,
           tcm_discharge_date, tcm_contact_within_2_days, tcm_f2f_scheduled
         )
         SELECT fs.id, fs.patient_id, fs.patient_name,
                $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                $15, $16, $17, $18, $19, $20
           FROM followup_sessions fs
          WHERE fs.id = $1
            AND fs.tenant_id = $2
         ON CONFLICT (session_id) DO UPDATE SET
           patient_id = EXCLUDED.patient_id,
           patient_name = EXCLUDED.patient_name,
           service_date = EXCLUDED.service_date,
           billing_month = EXCLUDED.billing_month,
           program = EXCLUDED.program,
           cpt_code = EXCLUDED.cpt_code,
           cpt_rate = EXCLUDED.cpt_rate,
           prep_minutes = EXCLUDED.prep_minutes,
           call_minutes = EXCLUDED.call_minutes,
           documentation_minutes = EXCLUDED.documentation_minutes,
           coordination_minutes = EXCLUDED.coordination_minutes,
           total_minutes = EXCLUDED.total_minutes,
           meets_threshold = EXCLUDED.meets_threshold,
           billing_status = EXCLUDED.billing_status,
           reviewed_by = EXCLUDED.reviewed_by,
           reviewed_at = EXCLUDED.reviewed_at,
           notes = EXCLUDED.notes,
           tcm_discharge_date = EXCLUDED.tcm_discharge_date,
           tcm_contact_within_2_days = EXCLUDED.tcm_contact_within_2_days,
           tcm_f2f_scheduled = EXCLUDED.tcm_f2f_scheduled,
           updated_at = now()
         RETURNING *`,
        [sessionId, access.context.tenantId, ...writeValues],
      )
      rows = result.rows
    }

    if (!rows[0]) {
      return NextResponse.json({ error: 'Billing entry not found' }, { status: 404 })
    }
    return NextResponse.json({ entry: rows[0] })
  } catch {
    console.error('[follow-up/billing] write failed')
    return NextResponse.json({ error: 'Failed to save billing entry' }, { status: 500 })
  }
}
