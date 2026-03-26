import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { from as mainFrom, wearableFrom as from } from '@/lib/db-query'
import { notifyWearableAlert } from '@/lib/notifications'

/**
 * POST /api/wearable/events
 *
 * Receives critical health events from the Sevaro Monitor iOS app.
 * Inserts into wearable_anomalies — a Postgres trigger automatically
 * creates the corresponding wearable_alerts row and unified notification.
 *
 * Body (single event):
 *   { patient_id, detected_at, anomaly_type, severity, trigger_data, clinical_significance }
 *
 * Body (batch):
 *   { events: [{ patient_id, ... }, ...] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Support single event or batch
    const events: Array<{
      patient_id: string
      detected_at?: string
      anomaly_type: string
      severity?: string
      trigger_data?: Record<string, unknown>
      clinical_significance?: string
    }> = body.events || [body]

    if (events.length === 0) {
      return NextResponse.json({ error: 'No events provided.' }, { status: 400 })
    }

    // Validate required fields
    for (const event of events) {
      if (!event.patient_id || !event.anomaly_type) {
        return NextResponse.json(
          { error: 'Each event requires patient_id and anomaly_type.' },
          { status: 400 }
        )
      }
    }

    // Verify patient exists (check first patient_id — in practice all events
    // from one device share the same patient_id)
    const patientIds = [...new Set(events.map(e => e.patient_id))]
    const { data: patients, error: patientError } = await from('wearable_patients')
      .select('id')
      .in('id', patientIds)

    if (patientError) {
      return NextResponse.json({ error: patientError.message }, { status: 500 })
    }

    const validIds = new Set((patients || []).map((p: any) => p.id))
    const invalidIds = patientIds.filter(id => !validIds.has(id))
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: `Unknown patient_id(s): ${invalidIds.join(', ')}` },
        { status: 404 }
      )
    }

    // Insert anomalies — the Postgres trigger handles alert + notification creation
    const rows = events.map(event => ({
      patient_id: event.patient_id,
      detected_at: event.detected_at || new Date().toISOString(),
      anomaly_type: event.anomaly_type,
      severity: event.severity || 'informational',
      trigger_data: event.trigger_data || {},
      clinical_significance: event.clinical_significance || null,
    }))

    const { data, error } = await from('wearable_anomalies')
      .insert(rows)
      .select('id, patient_id, anomaly_type, severity, detected_at')

    if (error) {
      console.error('Wearable events insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Fire wearable alert notifications with OPSAmple patient context (non-blocking)
    if (data && data.length > 0) {
      // Look up linked OPSAmple patients for richer notifications
      const wearableIds = Array.from(new Set((data as any[]).map(a => String(a.patient_id))))
      const linkMap = new Map<string, { opsPatientId: string; patientName: string }>()

      try {
        for (const wId of wearableIds) {
          const { data: linkRows } = await mainFrom('patient_wearable_links')
            .select('patient_id')
            .eq('wearable_patient_id', wId)

          if (linkRows && linkRows.length > 0) {
            const opsPatientId = (linkRows[0] as any).patient_id
            // Look up patient name from ops_amplehtml
            const { data: patientRow } = await mainFrom('patients')
              .select('first_name, last_name')
              .eq('id', opsPatientId)
              .maybeSingle()
            const name = patientRow
              ? `${(patientRow as any).first_name || ''} ${(patientRow as any).last_name || ''}`.trim()
              : `Patient ${wId.substring(0, 8)}`
            linkMap.set(wId, { opsPatientId, patientName: name })
          }
        }
      } catch (linkErr) {
        console.error('[wearable-events] link lookup error (non-fatal):', linkErr)
      }

      for (const anomaly of data) {
        const linked = linkMap.get(anomaly.patient_id)
        const patientName = linked?.patientName || `Patient ${anomaly.patient_id.substring(0, 8)}`
        const opsPatientId = linked?.opsPatientId || anomaly.patient_id

        notifyWearableAlert(
          anomaly.id,
          patientName,
          anomaly.anomaly_type,
          anomaly.severity,
          opsPatientId,
          linked ? { wearable_patient_id: anomaly.patient_id, source: 'sevaro_monitor' } : undefined,
        ).catch(err => console.error('[wearable-events] notification error:', err))
      }
    }

    return NextResponse.json(
      {
        inserted: data?.length || 0,
        anomalies: data,
      },
      { status: 201 }
    )
  } catch (err: unknown) {
    console.error('Wearable events API error:', err)
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
