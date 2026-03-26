import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { getPool } from '@/lib/db'
import { from } from '@/lib/db-query'

/**
 * POST /api/visits/[id]/import-historian
 *
 * Imports structured output from a completed historian session into the
 * clinical note for the given visit. Merges HPI, medications, allergies,
 * PMH, family history, social history, and ROS into the note without
 * overwriting existing physician content.
 *
 * Body: { historian_session_id: string }
 *
 * Returns: { success: true, clinical_note: {...} }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: visitId } = await params

    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { historian_session_id } = body

    if (!historian_session_id) {
      return NextResponse.json(
        { error: 'historian_session_id is required' },
        { status: 400 }
      )
    }

    const pool = await getPool()

    // 1. Fetch the historian session
    const { rows: sessionRows } = await pool.query(
      `SELECT id, structured_output, narrative_summary, red_flags, imported_to_note, patient_name
       FROM historian_sessions
       WHERE id = $1
       LIMIT 1`,
      [historian_session_id]
    )

    const session = sessionRows[0]
    if (!session) {
      return NextResponse.json(
        { error: 'Historian session not found' },
        { status: 404 }
      )
    }

    if (session.imported_to_note) {
      return NextResponse.json(
        { error: 'This historian session has already been imported to a note' },
        { status: 409 }
      )
    }

    const so = session.structured_output
    if (!so || typeof so !== 'object') {
      return NextResponse.json(
        { error: 'Historian session has no structured output to import' },
        { status: 400 }
      )
    }

    // 2. Fetch or create clinical note for this visit
    let { data: clinicalNote } = await from('clinical_notes')
      .select('*')
      .eq('visit_id', visitId)
      .single()

    if (!clinicalNote) {
      const { data: newNote, error: createErr } = await from('clinical_notes')
        .insert({
          visit_id: visitId,
          status: 'draft',
        })
        .select()
        .single()

      if (createErr || !newNote) {
        return NextResponse.json(
          { error: 'Could not find or create clinical note for this visit' },
          { status: 500 }
        )
      }
      clinicalNote = newNote
    }

    // 3. Merge historian structured output into the clinical note
    //    Strategy: prepend historian content to existing content so the
    //    physician's manually entered text is preserved.
    const mergeField = (existing: string | null, incoming: string | undefined, label?: string): string => {
      if (!incoming) return existing || ''
      const prefix = label ? `[Historian] ${label}: ` : '[Historian] '
      if (!existing || existing.trim() === '') return `${prefix}${incoming}`
      // Don't duplicate if already imported
      if (existing.includes(incoming)) return existing
      return `${prefix}${incoming}\n\n${existing}`
    }

    // Build HPI from multiple historian fields
    const hpiParts: string[] = []
    if (so.chief_complaint) hpiParts.push(`Chief Complaint: ${so.chief_complaint}`)
    if (so.hpi) hpiParts.push(so.hpi)
    if (so.onset) hpiParts.push(`Onset: ${so.onset}`)
    if (so.location) hpiParts.push(`Location: ${so.location}`)
    if (so.duration) hpiParts.push(`Duration: ${so.duration}`)
    if (so.character) hpiParts.push(`Character: ${so.character}`)
    if (so.severity) hpiParts.push(`Severity: ${so.severity}`)
    if (so.aggravating_factors) hpiParts.push(`Aggravating: ${so.aggravating_factors}`)
    if (so.relieving_factors) hpiParts.push(`Relieving: ${so.relieving_factors}`)
    if (so.timing) hpiParts.push(`Timing: ${so.timing}`)
    if (so.associated_symptoms) hpiParts.push(`Associated Symptoms: ${so.associated_symptoms}`)
    // Follow-up fields
    if (so.interval_changes) hpiParts.push(`Interval Changes: ${so.interval_changes}`)
    if (so.treatment_response) hpiParts.push(`Treatment Response: ${so.treatment_response}`)
    if (so.new_symptoms) hpiParts.push(`New Symptoms: ${so.new_symptoms}`)
    if (so.medication_changes) hpiParts.push(`Medication Changes: ${so.medication_changes}`)
    if (so.side_effects) hpiParts.push(`Side Effects: ${so.side_effects}`)

    const historianHPI = hpiParts.length > 0 ? hpiParts.join('\n') : ''

    // Build history sections
    const historyParts: string[] = []
    if (so.past_medical_history) historyParts.push(`PMH: ${so.past_medical_history}`)
    if (so.past_surgical_history) historyParts.push(`PSH: ${so.past_surgical_history}`)
    if (so.family_history) historyParts.push(`Family History: ${so.family_history}`)
    if (so.social_history) historyParts.push(`Social History: ${so.social_history}`)
    if (so.functional_status) historyParts.push(`Functional Status: ${so.functional_status}`)
    const historianHistory = historyParts.length > 0 ? historyParts.join('\n') : ''

    // Add red flags to narrative if present
    let narrativeSuffix = ''
    if (session.red_flags && session.red_flags.length > 0) {
      const flags = session.red_flags.map((f: { flag: string; severity: string }) =>
        `${f.flag} (${f.severity})`
      ).join('; ')
      narrativeSuffix = `\n\n[Historian Red Flags: ${flags}]`
    }

    const updatedHPI = mergeField(clinicalNote.hpi, historianHPI ? `${historianHPI}${narrativeSuffix}` : undefined)
    const updatedAllergies = mergeField(clinicalNote.allergies, so.allergies, 'Allergies')
    const updatedROS = mergeField(clinicalNote.ros, so.review_of_systems, 'ROS')
    const updatedHistory = mergeField(
      clinicalNote.history_details,
      historianHistory || undefined,
      'History'
    )
    const updatedMedications = so.current_medications
      ? mergeField(clinicalNote.history_available, so.current_medications, 'Medications')
      : clinicalNote.history_available

    // 4. Update the clinical note
    const { data: updatedNote, error: updateErr } = await from('clinical_notes')
      .update({
        hpi: updatedHPI,
        allergies: updatedAllergies,
        ros: updatedROS,
        history_details: updatedHistory,
        history_available: updatedMedications,
        updated_at: new Date().toISOString(),
      })
      .eq('id', clinicalNote.id)
      .select()
      .single()

    if (updateErr) {
      console.error('[import-historian] Failed to update clinical note:', updateErr)
      return NextResponse.json(
        { error: 'Failed to update clinical note' },
        { status: 500 }
      )
    }

    // 5. Mark the historian session as imported
    await from('historian_sessions')
      .update({
        imported_to_note: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', historian_session_id)

    return NextResponse.json({
      success: true,
      clinical_note: updatedNote,
    })
  } catch (error) {
    console.error('[import-historian] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
