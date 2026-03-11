import { NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { getTenantServer } from '@/lib/tenant'
import { getPool } from '@/lib/db'
import { from } from '@/lib/db-query'

// GET /api/incomplete-docs — Scan for unsigned/incomplete clinical notes
export async function GET() {
  try {
    const tenant = getTenantServer()
    const pool = await getPool()

    const incompleteItems: Array<{
      type: string
      patient_name: string
      patient_id: string | null
      visit_id: string | null
      note_id: string | null
      description: string
      visit_date: string | null
      missing_sections: string[]
    }> = []

    // 1. Unsigned notes: clinical_notes where signed_at is NULL
    //    and the visit was more than 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { rows: unsignedNotes } = await pool.query(`
      SELECT
        cn."id", cn."visit_id", cn."signed_at", cn."assessment", cn."plan", cn."hpi", cn."created_at",
        v."id" AS v_id, v."visit_date", v."patient_id",
        p."first_name", p."last_name"
      FROM "clinical_notes" cn
      LEFT JOIN "visits" v ON v."id" = cn."visit_id"
      LEFT JOIN "patients" p ON p."id" = v."patient_id"
      WHERE cn."signed_at" IS NULL
        AND cn."created_at" < $1
      LIMIT 20
    `, [twentyFourHoursAgo])

    for (const note of unsignedNotes) {
      const patientName = note.first_name
        ? `${note.first_name} ${note.last_name}`
        : 'Unknown Patient'

      const missingSections: string[] = []
      if (!note.assessment) missingSections.push('Assessment')
      if (!note.plan) missingSections.push('Plan')
      if (!note.hpi) missingSections.push('HPI')

      incompleteItems.push({
        type: missingSections.length > 0 ? 'missing_sections' : 'unsigned',
        patient_name: patientName,
        patient_id: note.patient_id || null,
        visit_id: note.v_id || null,
        note_id: note.id,
        description: missingSections.length > 0
          ? `Unsigned note with missing sections: ${missingSections.join(', ')}`
          : 'Note awaiting signature (>24 hours)',
        visit_date: note.visit_date || null,
        missing_sections: missingSections,
      })
    }

    // 2. Visits with no clinical note at all (visit > 24hrs ago)
    const { rows: visitsWithoutNotes } = await pool.query(`
      SELECT
        v."id", v."visit_date", v."visit_type", v."patient_id",
        p."first_name", p."last_name"
      FROM "visits" v
      LEFT JOIN "patients" p ON p."id" = v."patient_id"
      LEFT JOIN "clinical_notes" cn ON cn."visit_id" = v."id"
      WHERE v."visit_date" < $1
        AND cn."id" IS NULL
      LIMIT 20
    `, [twentyFourHoursAgo.split('T')[0]])

    for (const visit of visitsWithoutNotes) {
      const patientName = visit.first_name
        ? `${visit.first_name} ${visit.last_name}`
        : 'Unknown Patient'

      incompleteItems.push({
        type: 'no_note',
        patient_name: patientName,
        patient_id: visit.patient_id,
        visit_id: visit.id,
        note_id: null,
        description: `Visit on ${visit.visit_date} has no clinical note`,
        visit_date: visit.visit_date,
        missing_sections: [],
      })
    }

    return NextResponse.json({
      incomplete_docs: incompleteItems,
      count: incompleteItems.length,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
