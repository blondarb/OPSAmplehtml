import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { from } from '@/lib/db-query'

/**
 * POST /api/wearable/hourly
 *
 * Receives hourly metric snapshots from the Sevaro Monitor iOS app.
 * Upserts into wearable_hourly_snapshots (UNIQUE on patient_id + hour_timestamp).
 *
 * Body (single snapshot):
 *   { patient_id, hour_timestamp, avg_hr?, hrv_sdnn?, spo2_avg?, steps?, active_calories? }
 *
 * Body (batch):
 *   { snapshots: [{ patient_id, hour_timestamp, ... }, ...] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Support single snapshot or batch
    const snapshots: Array<{
      patient_id: string
      hour_timestamp: string
      avg_hr?: number | null
      hrv_sdnn?: number | null
      spo2_avg?: number | null
      steps?: number | null
      active_calories?: number | null
    }> = body.snapshots || [body]

    if (snapshots.length === 0) {
      return NextResponse.json({ error: 'No snapshots provided.' }, { status: 400 })
    }

    // Validate required fields
    for (const snap of snapshots) {
      if (!snap.patient_id || !snap.hour_timestamp) {
        return NextResponse.json(
          { error: 'Each snapshot requires patient_id and hour_timestamp.' },
          { status: 400 }
        )
      }
    }

    // Verify patient exists
    const patientIds = [...new Set(snapshots.map(s => s.patient_id))]
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

    // Upsert snapshots — on conflict (patient_id, hour_timestamp) update metrics
    const rows = snapshots.map(snap => ({
      patient_id: snap.patient_id,
      hour_timestamp: snap.hour_timestamp,
      avg_hr: snap.avg_hr ?? null,
      hrv_sdnn: snap.hrv_sdnn ?? null,
      spo2_avg: snap.spo2_avg ?? null,
      steps: snap.steps ?? null,
      active_calories: snap.active_calories ?? null,
    }))

    const { data, error } = await from('wearable_hourly_snapshots')
      .upsert(rows, { onConflict: 'patient_id,hour_timestamp' })
      .select('id, patient_id, hour_timestamp')

    if (error) {
      console.error('Wearable hourly upsert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(
      {
        upserted: data?.length || 0,
        snapshots: data,
      },
      { status: 201 }
    )
  } catch (err: unknown) {
    console.error('Wearable hourly API error:', err)
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
