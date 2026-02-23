import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { suggestCptCode, CPT_CODES } from '@/lib/follow-up/cptCodes'
import type { BillingMonthlySummary } from '@/lib/follow-up/billingTypes'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7)

    const supabase = await createClient()

    // Fetch billing entries for the month, joined with session data
    const { data: entries, error } = await supabase
      .from('followup_billing_entries')
      .select(`
        *,
        followup_sessions (
          follow_up_method,
          escalation_level,
          status
        )
      `)
      .eq('billing_month', month)
      .order('service_date', { ascending: false })

    if (error) {
      console.error('Billing query error:', error)
      return NextResponse.json({ error: 'Failed to fetch billing entries' }, { status: 500 })
    }

    // Flatten joined session data onto each entry
    const flatEntries = (entries || []).map((e: Record<string, unknown>) => {
      const session = e.followup_sessions as Record<string, unknown> | null
      return {
        ...e,
        followup_sessions: undefined,
        follow_up_method: session?.follow_up_method || null,
        escalation_level: session?.escalation_level || null,
        conversation_status: session?.status || null,
      }
    })

    // Compute monthly summary
    const billableEntries = flatEntries.filter(
      (e: Record<string, unknown>) => e.meets_threshold === true
    )
    const summary: BillingMonthlySummary = {
      totalSessions: flatEntries.length,
      billableSessions: billableEntries.length,
      totalBillableMinutes: billableEntries.reduce(
        (sum: number, e: Record<string, unknown>) => sum + (Number(e.total_minutes) || 0),
        0
      ),
      estimatedRevenue: billableEntries.reduce(
        (sum: number, e: Record<string, unknown>) => sum + (Number(e.cpt_rate) || 0),
        0
      ),
    }

    return NextResponse.json({ entries: flatEntries, summary })
  } catch (error) {
    console.error('Billing API error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch billing data'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      id,
      session_id,
      patient_id,
      patient_name,
      service_date,
      billing_month,
      program,
      prep_minutes,
      call_minutes,
      documentation_minutes,
      coordination_minutes,
      billing_status,
      reviewed_by,
      notes,
      tcm_discharge_date,
      tcm_contact_within_2_days,
      tcm_f2f_scheduled,
    } = body

    // Compute derived fields
    const totalMinutes =
      (Number(prep_minutes) || 0) +
      (Number(call_minutes) || 0) +
      (Number(documentation_minutes) || 0) +
      (Number(coordination_minutes) || 0)

    const cptCode = body.cpt_code || suggestCptCode(program || 'ccm', totalMinutes)
    const cptRate = CPT_CODES[cptCode]?.rate || 0
    const meetsThreshold = totalMinutes >= (CPT_CODES[cptCode]?.minMinutes || 20)

    const supabase = await createClient()

    const entryData = {
      session_id,
      patient_id: patient_id || null,
      patient_name: patient_name || 'Unknown',
      service_date: service_date || new Date().toISOString().split('T')[0],
      billing_month: billing_month || new Date().toISOString().slice(0, 7),
      program: program || 'ccm',
      cpt_code: cptCode,
      cpt_rate: cptRate,
      prep_minutes: Number(prep_minutes) || 0,
      call_minutes: Number(call_minutes) || 0,
      documentation_minutes: Number(documentation_minutes) || 0,
      coordination_minutes: Number(coordination_minutes) || 0,
      total_minutes: totalMinutes,
      meets_threshold: meetsThreshold,
      billing_status: billing_status || 'not_reviewed',
      reviewed_by: reviewed_by || null,
      reviewed_at: reviewed_by ? new Date().toISOString() : null,
      notes: notes || null,
      tcm_discharge_date: tcm_discharge_date || null,
      tcm_contact_within_2_days: tcm_contact_within_2_days ?? null,
      tcm_f2f_scheduled: tcm_f2f_scheduled ?? null,
    }

    let result
    if (id) {
      // Update existing entry
      const { data, error } = await supabase
        .from('followup_billing_entries')
        .update(entryData)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('Billing update error:', error)
        return NextResponse.json({ error: 'Failed to update billing entry' }, { status: 500 })
      }
      result = data
    } else {
      // Upsert by session_id to avoid duplicates
      const { data, error } = await supabase
        .from('followup_billing_entries')
        .upsert(entryData, { onConflict: 'session_id' })
        .select()
        .single()

      if (error) {
        console.error('Billing upsert error:', error)
        return NextResponse.json({ error: 'Failed to create billing entry' }, { status: 500 })
      }
      result = data
    }

    return NextResponse.json({ entry: result })
  } catch (error) {
    console.error('Billing POST error:', error)
    const message = error instanceof Error ? error.message : 'Failed to save billing entry'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
