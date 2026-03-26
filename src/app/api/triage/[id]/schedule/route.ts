import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { from } from '@/lib/db-query'

/**
 * POST /api/triage/[id]/schedule
 *
 * Auto-creates an AI-suggested appointment for urgent/emergent triage results.
 * Called automatically from the triage route or manually by staff.
 *
 * The appointment is created with scheduling_notes indicating it was
 * AI-suggested so staff can review and confirm.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: triageSessionId } = await params

    // Fetch the triage session to get tier and patient info
    const pool = await getPool()
    const { rows } = await pool.query(
      `
      SELECT
        ts."id",
        ts."triage_tier",
        ts."patient_id",
        ts."referral_text",
        ts."clinical_reasons",
        ts."subspecialty_recommendation",
        p."first_name",
        p."last_name"
      FROM "triage_sessions" ts
      LEFT JOIN "patients" p ON p."id" = ts."patient_id"
      WHERE ts."id" = $1
      LIMIT 1
      `,
      [triageSessionId],
    )

    const triage = rows[0]
    if (!triage) {
      return NextResponse.json(
        { error: 'Triage session not found' },
        { status: 404 },
      )
    }

    // Only create appointments for urgent+ tiers
    const urgentTiers = ['urgent', 'emergent', 'critical']
    if (!urgentTiers.includes((triage.triage_tier || '').toLowerCase())) {
      return NextResponse.json(
        { error: 'Appointment auto-scheduling is only for urgent or higher triage results' },
        { status: 400 },
      )
    }

    // If no patient_id, we cannot schedule (patient must be registered first)
    if (!triage.patient_id) {
      return NextResponse.json(
        { error: 'Cannot schedule appointment — no patient linked to this triage session' },
        { status: 400 },
      )
    }

    // Determine suggested appointment timing based on tier
    const tier = (triage.triage_tier || '').toLowerCase()
    let suggestedDate: string
    let appointmentType: string
    if (tier === 'emergent' || tier === 'critical') {
      // Same day
      suggestedDate = new Date().toISOString().split('T')[0]
      appointmentType = 'urgent-consult'
    } else {
      // Within 1 week for urgent
      const nextWeek = new Date()
      nextWeek.setDate(nextWeek.getDate() + 7)
      suggestedDate = nextWeek.toISOString().split('T')[0]
      appointmentType = 'new-consult'
    }

    // Build reason from triage data
    const clinicalReasons = Array.isArray(triage.clinical_reasons)
      ? triage.clinical_reasons.join('; ')
      : ''
    const reason =
      triage.subspecialty_recommendation ||
      clinicalReasons ||
      'Urgent triage result — review needed'

    const patientName = triage.first_name && triage.last_name
      ? `${triage.first_name} ${triage.last_name}`
      : 'Unknown'

    // Create the appointment flagged as AI-suggested
    const { data: appointment, error: insertError } = await from('appointments')
      .insert({
        patient_id: triage.patient_id,
        appointment_date: suggestedDate,
        appointment_time: '09:00', // Default morning slot; staff will adjust
        duration_minutes: 45,
        appointment_type: appointmentType,
        status: 'pending-review',
        hospital_site: 'Meridian Neurology',
        reason_for_visit: reason,
        scheduling_notes: `AI-suggested: ${tier} triage result (session ${triageSessionId}). Staff review required before confirming.`,
      })
      .select()
      .single()

    if (insertError) {
      console.error('[triage/schedule] appointment insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to create appointment' },
        { status: 500 },
      )
    }

    return NextResponse.json(
      {
        appointment,
        message: `AI-suggested ${appointmentType} appointment created for ${patientName} on ${suggestedDate}`,
        ai_suggested: true,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('[triage/schedule] error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
