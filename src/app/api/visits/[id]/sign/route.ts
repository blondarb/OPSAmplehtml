import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

// POST /api/visits/[id]/sign - Sign and complete a visit
export async function POST(
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

    // Get the visit with clinical note and patient info
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select(`
        *,
        clinical_notes (*),
        patient:patients (first_name, last_name, date_of_birth, gender),
        appointment:appointments!visits_appointment_id_fkey (id)
      `)
      .eq('id', id)
      .single()

    if (visitError || !visit) {
      console.error('Error fetching visit:', visitError)
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
    }

    let clinicalNote = visit.clinical_notes?.[0]
    if (!clinicalNote) {
      // Clinical note not found in join - try fetching directly
      const { data: existingNote } = await supabase
        .from('clinical_notes')
        .select('*')
        .eq('visit_id', id)
        .single()

      if (existingNote) {
        clinicalNote = existingNote
      } else {
        // Create a clinical note if one truly doesn't exist
        const { data: newNote, error: createNoteError } = await supabase
          .from('clinical_notes')
          .insert({ visit_id: id, status: 'draft' })
          .select()
          .single()
        if (createNoteError || !newNote) {
          console.error('Error creating clinical note:', createNoteError)
          return NextResponse.json({ error: 'No clinical note found and could not create one' }, { status: 400 })
        }
        clinicalNote = newNote
      }
    }

    // Generate AI summary
    let aiSummary = ''
    try {
      // Get OpenAI API key
      const { data: settings } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'openai_api_key')
        .single()

      const apiKey = settings?.value || process.env.OPENAI_API_KEY
      if (apiKey) {
        const openai = new OpenAI({ apiKey })

        // Calculate age
        const age = visit.patient?.date_of_birth
          ? Math.floor((Date.now() - new Date(visit.patient.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
          : null

        const patientInfo = visit.patient
          ? `${age || ''} year old ${visit.patient.gender || ''} patient ${visit.patient.first_name} ${visit.patient.last_name}`
          : 'Patient'

        const prompt = `Generate a concise clinical summary (2-4 sentences) for the following visit note. Focus on the chief complaint, key findings, diagnosis, and plan. Use standard medical abbreviations where appropriate.

Patient: ${patientInfo}
Chief Complaint: ${visit.chief_complaint?.join(', ') || 'Not documented'}

HPI: ${clinicalNote.hpi || 'Not documented'}

Assessment: ${clinicalNote.assessment || 'Not documented'}

Plan: ${clinicalNote.plan || 'Not documented'}

Generate a professional clinical summary:`

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_completion_tokens: 300,
          temperature: 0.3,
        })

        aiSummary = completion.choices[0]?.message?.content?.trim() || ''
      }
    } catch (aiError) {
      console.error('Error generating AI summary:', aiError)
      // Continue without AI summary - not a fatal error
    }

    // Update the clinical note to signed status with AI summary
    const { error: noteUpdateError } = await supabase
      .from('clinical_notes')
      .update({
        status: 'signed',
        ai_summary: aiSummary || clinicalNote.ai_summary,
        is_signed: true,
        signed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', clinicalNote.id)

    if (noteUpdateError) {
      console.error('Error signing clinical note:', noteUpdateError)
      return NextResponse.json({ error: 'Failed to sign clinical note' }, { status: 500 })
    }

    // Update visit status to completed
    const { error: visitUpdateError } = await supabase
      .from('visits')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (visitUpdateError) {
      console.error('Error completing visit:', visitUpdateError)
    }

    // Update appointment status to completed
    if (visit.appointment?.id) {
      await supabase
        .from('appointments')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', visit.appointment.id)
    }

    // Fetch the updated visit
    const { data: updatedVisit } = await supabase
      .from('visits')
      .select(`
        *,
        clinical_notes (*)
      `)
      .eq('id', id)
      .single()

    return NextResponse.json({
      visit: updatedVisit,
      aiSummary,
      message: 'Visit signed and completed successfully',
    })
  } catch (error) {
    console.error('Error in sign visit API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
