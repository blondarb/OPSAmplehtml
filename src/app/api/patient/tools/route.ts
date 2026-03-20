/**
 * POST /api/patient/tools
 *
 * Saves patient-submitted body map markers and device measurements.
 * Part of Phase 5 — Patient Web Tools.
 *
 * GET /api/patient/tools?consult_id=...
 *
 * Retrieves saved patient tools data for a consult.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      consult_id,
      patient_id,
      body_map_markers,
      device_measurements,
      device_info,
    } = body

    if (
      (!body_map_markers || body_map_markers.length === 0) &&
      (!device_measurements || device_measurements.length === 0)
    ) {
      return NextResponse.json(
        { error: 'At least one body map marker or device measurement is required' },
        { status: 400 },
      )
    }

    const pool = await getPool()
    const now = new Date().toISOString()

    // Insert body map markers
    const markerIds: string[] = []
    if (body_map_markers && body_map_markers.length > 0) {
      for (const marker of body_map_markers) {
        const { rows } = await pool.query(
          `INSERT INTO patient_body_map_markers
             (consult_id, patient_id, region, symptom_type, severity, laterality, onset, notes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            consult_id || null,
            patient_id || null,
            marker.region,
            marker.symptom_type,
            marker.severity,
            marker.laterality,
            marker.onset || null,
            marker.notes || null,
            now,
          ],
        )
        if (rows[0]) markerIds.push(rows[0].id)
      }
    }

    // Insert device measurements
    const measurementIds: string[] = []
    if (device_measurements && device_measurements.length > 0) {
      for (const measurement of device_measurements) {
        const { rows } = await pool.query(
          `INSERT INTO patient_device_measurements
             (consult_id, patient_id, measurement_type, result, device_info, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            consult_id || null,
            patient_id || null,
            measurement.measurement_type,
            JSON.stringify(measurement.result),
            JSON.stringify(device_info || {}),
            now,
          ],
        )
        if (rows[0]) measurementIds.push(rows[0].id)
      }
    }

    return NextResponse.json({
      success: true,
      marker_ids: markerIds,
      measurement_ids: measurementIds,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[patient-tools] POST error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const consultId = searchParams.get('consult_id')
    const patientId = searchParams.get('patient_id')

    if (!consultId && !patientId) {
      return NextResponse.json(
        { error: 'consult_id or patient_id is required' },
        { status: 400 },
      )
    }

    const pool = await getPool()

    const whereClause = consultId
      ? 'consult_id = $1'
      : 'patient_id = $1'
    const paramValue = consultId || patientId

    const [markersResult, measurementsResult] = await Promise.all([
      pool.query(
        `SELECT * FROM patient_body_map_markers
         WHERE ${whereClause}
         ORDER BY created_at DESC`,
        [paramValue],
      ),
      pool.query(
        `SELECT * FROM patient_device_measurements
         WHERE ${whereClause}
         ORDER BY created_at DESC`,
        [paramValue],
      ),
    ])

    return NextResponse.json({
      markers: markersResult.rows,
      measurements: measurementsResult.rows,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[patient-tools] GET error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
