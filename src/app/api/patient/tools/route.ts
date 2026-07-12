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
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { getPool } from '@/lib/db'

const MAX_TOOL_ITEMS = 100

type ToolBinding = {
  consultId: string | null
  patientId: string | null
}

type ToolBindingResult =
  | { ok: true; binding: ToolBinding }
  | { ok: false; status: 400 | 404 | 409; error: string }

async function resolveToolBinding(
  pool: Awaited<ReturnType<typeof getPool>>,
  tenantId: string,
  consultId: unknown,
  patientId: unknown,
): Promise<ToolBindingResult> {
  if (!consultId && !patientId) {
    return {
      ok: false,
      status: 400,
      error: 'consult_id or patient_id is required',
    }
  }
  if (
    (consultId && typeof consultId !== 'string') ||
    (patientId && typeof patientId !== 'string')
  ) {
    return {
      ok: false,
      status: 400,
      error: 'consult_id and patient_id must be strings',
    }
  }

  if (patientId) {
    const { rows } = await pool.query(
      `SELECT id
         FROM patients
        WHERE id = $1
          AND tenant_id = $2
        LIMIT 1`,
      [patientId, tenantId],
    )
    if (!rows[0]) {
      return { ok: false, status: 404, error: 'Patient not found' }
    }
  }

  let consultPatientId: string | null = null
  if (consultId) {
    const { rows } = await pool.query(
      `SELECT id, patient_id
         FROM neurology_consults
        WHERE id = $1
          AND tenant_id = $2
        LIMIT 1`,
      [consultId, tenantId],
    )
    if (!rows[0]) {
      return { ok: false, status: 404, error: 'Consult not found' }
    }
    consultPatientId = rows[0].patient_id || null
    if (patientId && consultPatientId && patientId !== consultPatientId) {
      return {
        ok: false,
        status: 409,
        error: 'Patient does not match consult',
      }
    }
  }

  return {
    ok: true,
    binding: {
      consultId: (consultId as string | undefined) || null,
      patientId: (patientId as string | undefined) || consultPatientId,
    },
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await authorizeClinicalAccess({
      action: 'patient.tools_write',
      allowedRoles: ['clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }

    const body = await req.json()
    const {
      consult_id,
      patient_id,
      body_map_markers,
      device_measurements,
      device_info,
    } = body

    if (
      (body_map_markers !== undefined && !Array.isArray(body_map_markers)) ||
      (device_measurements !== undefined && !Array.isArray(device_measurements))
    ) {
      return NextResponse.json(
        { error: 'Tool results must be arrays' },
        { status: 400 },
      )
    }

    const markers = body_map_markers || []
    const measurements = device_measurements || []

    if (
      markers.length === 0 &&
      measurements.length === 0
    ) {
      return NextResponse.json(
        { error: 'At least one body map marker or device measurement is required' },
        { status: 400 },
      )
    }
    if (markers.length + measurements.length > MAX_TOOL_ITEMS) {
      return NextResponse.json(
        { error: `At most ${MAX_TOOL_ITEMS} tool results may be saved at once` },
        { status: 400 },
      )
    }

    if (!consult_id && !patient_id) {
      return NextResponse.json(
        { error: 'consult_id or patient_id is required' },
        { status: 400 },
      )
    }

    const pool = await getPool()
    const bindingResult = await resolveToolBinding(
      pool,
      access.context.tenantId,
      consult_id,
      patient_id,
    )
    if (!bindingResult.ok) {
      return NextResponse.json(
        { error: bindingResult.error },
        { status: bindingResult.status },
      )
    }
    const binding = bindingResult.binding
    const now = new Date().toISOString()

    // Insert body map markers
    const markerIds: string[] = []
    if (markers.length > 0) {
      for (const marker of markers) {
        const { rows } = await pool.query(
          `INSERT INTO patient_body_map_markers
             (consult_id, patient_id, region, symptom_type, severity, laterality, onset, notes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            binding.consultId,
            binding.patientId,
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
    if (measurements.length > 0) {
      for (const measurement of measurements) {
        const { rows } = await pool.query(
          `INSERT INTO patient_device_measurements
             (consult_id, patient_id, measurement_type, result, device_info, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            binding.consultId,
            binding.patientId,
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
  } catch {
    console.error('[patient-tools] POST request failed')
    return NextResponse.json(
      { error: 'Failed to save patient tools data' },
      { status: 500 },
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const access = await authorizeClinicalAccess({
      action: 'patient.tools_read',
      allowedRoles: ['viewer', 'scheduler', 'clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }

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
    const bindingResult = await resolveToolBinding(
      pool,
      access.context.tenantId,
      consultId,
      patientId,
    )
    if (!bindingResult.ok) {
      return NextResponse.json(
        { error: bindingResult.error },
        { status: bindingResult.status },
      )
    }

    const whereClause = consultId
      ? 'consult_id = $1'
      : 'patient_id = $1'
    const paramValue = consultId || patientId

    const [markersResult, measurementsResult] = await Promise.all([
      pool.query(
        `SELECT * FROM patient_body_map_markers
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT 200`,
        [paramValue],
      ),
      pool.query(
        `SELECT * FROM patient_device_measurements
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT 200`,
        [paramValue],
      ),
    ])

    return NextResponse.json({
      markers: markersResult.rows,
      measurements: measurementsResult.rows,
    })
  } catch {
    console.error('[patient-tools] GET request failed')
    return NextResponse.json(
      { error: 'Failed to fetch patient tools data' },
      { status: 500 },
    )
  }
}
