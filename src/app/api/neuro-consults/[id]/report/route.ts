/**
 * POST /api/neuro-consults/[id]/report
 *
 * Generates a unified report from all pipeline data for a consult.
 *
 * GET /api/neuro-consults/[id]/report
 *
 * Retrieves the most recent report for a consult.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { getConsult } from '@/lib/consult/pipeline'
import { buildConsultReport } from '@/lib/consult/report'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    // 1. Load the consult record
    const consult = await getConsult(id)
    if (!consult) {
      return NextResponse.json({ error: 'Consult not found' }, { status: 404 })
    }

    const pool = await getPool()

    // 2. Load related data in parallel
    const [scalesResult, markersResult, measurementsResult, redFlagsResult] = await Promise.all([
      pool.query(
        `SELECT * FROM scale_results WHERE consult_id = $1 ORDER BY created_at`,
        [id],
      ).catch(() => ({ rows: [] })),

      pool.query(
        `SELECT * FROM patient_body_map_markers WHERE consult_id = $1`,
        [id],
      ).catch(() => ({ rows: [] })),

      pool.query(
        `SELECT * FROM patient_device_measurements WHERE consult_id = $1`,
        [id],
      ).catch(() => ({ rows: [] })),

      pool.query(
        `SELECT * FROM red_flag_events WHERE consult_id = $1 ORDER BY detected_at`,
        [id],
      ).catch(() => ({ rows: [] })),
    ])

    // 3. Parse localizer differential from consult
    let localizerDifferential: Array<{ diagnosis: string; likelihood: string; rationale: string }> = []
    if (consult.historian_structured_output) {
      const so = consult.historian_structured_output as Record<string, unknown>
      if (so.localizer_differential && typeof so.localizer_differential === 'string') {
        try {
          localizerDifferential = JSON.parse(so.localizer_differential)
        } catch { /* non-fatal */ }
      }
    }

    // 4. Build the report
    const report = buildConsultReport({
      consult,
      scaleResults: scalesResult.rows.map((r: Record<string, unknown>) => ({
        scale_id: r.scale_id as string,
        scale_name: r.scale_name as string,
        abbreviation: r.abbreviation as string || (r.scale_id as string),
        total_score: r.total_score as number,
        max_score: r.max_score as number || 0,
        severity: r.severity as string || '',
        interpretation: r.interpretation as string || '',
      })),
      localizerDifferential,
      bodyMapMarkers: markersResult.rows.map((r: Record<string, unknown>) => ({
        region: r.region as string,
        symptom_type: r.symptom_type as string,
        severity: r.severity as string,
      })),
      deviceMeasurements: measurementsResult.rows.map((r: Record<string, unknown>) => ({
        measurement_type: r.measurement_type as string,
        result: (typeof r.result === 'string' ? JSON.parse(r.result) : r.result) as Record<string, unknown>,
      })),
      redFlagEvents: redFlagsResult.rows.map((r: Record<string, unknown>) => ({
        flag_name: r.flag_name as string,
        severity: r.severity as string,
        confidence: r.confidence as number,
      })),
    })

    // 5. Persist the report
    const { rows } = await pool.query(
      `INSERT INTO consult_reports
         (consult_id, status, report_data, generated_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [id, 'draft', JSON.stringify(report), report.generated_at],
    )

    report.id = rows[0]?.id || ''

    // 6. Mark consult as complete
    await pool.query(
      `UPDATE neurology_consults SET status = 'complete', updated_at = NOW() WHERE id = $1`,
      [id],
    )

    return NextResponse.json({ report })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[report] POST error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const pool = await getPool()
    const { rows } = await pool.query(
      `SELECT * FROM consult_reports
       WHERE consult_id = $1
       ORDER BY generated_at DESC
       LIMIT 1`,
      [id],
    )

    if (rows.length === 0) {
      return NextResponse.json({ report: null })
    }

    const row = rows[0]
    const report = typeof row.report_data === 'string'
      ? JSON.parse(row.report_data)
      : row.report_data

    report.id = row.id

    return NextResponse.json({ report })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[report] GET error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
