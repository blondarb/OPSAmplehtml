import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/visits/[id] - Get a visit with clinical note
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('visits')
      .select(`
        *,
        clinical_notes (*),
        patient:patients (*)
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching visit:', error)
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
    }

    return NextResponse.json({ visit: data })
  } catch (error) {
    console.error('Error in visit API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/visits/[id] - Update a visit and its clinical note
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      chiefComplaint,
      status,
      clinicalNote,
    } = body

    // Update visit if needed
    const visitUpdate: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }
    if (chiefComplaint !== undefined) visitUpdate.chief_complaint = chiefComplaint
    if (status !== undefined) visitUpdate.status = status

    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .update(visitUpdate)
      .eq('id', id)
      .select()
      .single()

    if (visitError) {
      console.error('Error updating visit:', visitError)
      return NextResponse.json({ error: 'Failed to update visit' }, { status: 500 })
    }

    // Update or create clinical note if provided
    if (clinicalNote) {
      const noteUpdate: Record<string, any> = {
        updated_at: new Date().toISOString(),
      }
      if (clinicalNote.hpi !== undefined) noteUpdate.hpi = clinicalNote.hpi
      if (clinicalNote.ros !== undefined) noteUpdate.ros = clinicalNote.ros
      if (clinicalNote.rosDetails !== undefined) noteUpdate.ros_details = clinicalNote.rosDetails
      if (clinicalNote.allergies !== undefined) noteUpdate.allergies = clinicalNote.allergies
      if (clinicalNote.allergyDetails !== undefined) noteUpdate.allergy_details = clinicalNote.allergyDetails
      if (clinicalNote.historyAvailable !== undefined) noteUpdate.history_available = clinicalNote.historyAvailable
      if (clinicalNote.historyDetails !== undefined) noteUpdate.history_details = clinicalNote.historyDetails
      if (clinicalNote.physicalExam !== undefined) noteUpdate.physical_exam = clinicalNote.physicalExam
      if (clinicalNote.assessment !== undefined) noteUpdate.assessment = clinicalNote.assessment
      if (clinicalNote.plan !== undefined) noteUpdate.plan = clinicalNote.plan
      if (clinicalNote.rawDictation !== undefined) noteUpdate.raw_dictation = clinicalNote.rawDictation
      if (clinicalNote.aiSummary !== undefined) noteUpdate.ai_summary = clinicalNote.aiSummary
      if (clinicalNote.status !== undefined) noteUpdate.status = clinicalNote.status

      // Try update first
      const { data: updated } = await supabase
        .from('clinical_notes')
        .update(noteUpdate)
        .eq('visit_id', id)
        .select()

      // If no rows updated, create the clinical note
      if (!updated || updated.length === 0) {
        await supabase
          .from('clinical_notes')
          .insert({ visit_id: id, status: 'draft', ...noteUpdate })
      }
    }

    // Fetch updated visit with clinical note
    const { data: updatedVisit } = await supabase
      .from('visits')
      .select(`
        *,
        clinical_notes (*)
      `)
      .eq('id', id)
      .single()

    return NextResponse.json({ visit: updatedVisit })
  } catch (error) {
    console.error('Error in visit API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
