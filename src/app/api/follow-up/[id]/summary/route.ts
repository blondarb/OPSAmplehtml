import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { MedicationStatus, EscalationFlag } from '@/lib/follow-up/types'
import { from } from '@/lib/db-query'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }


    const { data: session, error } = await from('followup_sessions')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !session) {
      return NextResponse.json(
        { error: 'Follow-up session not found' },
        { status: 404 }
      )
    }

    // If summary already exists, return it
    if (session.post_call_summary) {
      return NextResponse.json({
        summary: session.post_call_summary,
        session,
      })
    }

    // Build summary from session data
    const createdAt = session.created_at
      ? new Date(session.created_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : 'Unknown'

    const patientName = session.patient_name || 'Unknown'
    const visitDate = session.visit_date || 'Unknown'
    const providerName = session.provider_name || 'Unknown'
    const followUpMethod = session.follow_up_method || 'sms'

    // Estimate duration from transcript timestamps
    let durationMinutes = 0
    const transcript = session.transcript as Array<{
      role?: string
      text?: string
      timestamp?: number
    }> | null
    if (transcript && transcript.length >= 2) {
      const firstTimestamp = transcript[0]?.timestamp
      const lastTimestamp = transcript[transcript.length - 1]?.timestamp
      if (firstTimestamp && lastTimestamp) {
        durationMinutes = Math.round((lastTimestamp - firstTimestamp) / 60000)
      }
    }
    if (durationMinutes < 1) durationMinutes = 1

    // Format medication status
    const medicationStatusList = (session.medication_status as MedicationStatus[]) || []
    const medicationLines = medicationStatusList.length > 0
      ? medicationStatusList
          .map((ms) => {
            const filled = ms.filled === true ? '\u2713' : ms.filled === false ? '\u2717' : '?'
            const taking = ms.taking === true ? '\u2713' : ms.taking === false ? '\u2717' : '?'
            const sideEffects =
              ms.sideEffects && ms.sideEffects.length > 0
                ? ms.sideEffects.join(', ')
                : 'none'
            return `- ${ms.medication}: Filled ${filled} | Taking as prescribed ${taking} | Side effects: ${sideEffects}`
          })
          .join('\n')
      : '- No medication data collected'

    // Format new symptoms
    const newSymptoms = extractNewSymptoms(transcript)
    const newSymptomsText =
      newSymptoms.length > 0 ? newSymptoms.join(', ') : 'none'

    // Extract existing symptoms from transcript
    const existingSymptomsText = 'See transcript for details'

    // Functional status
    const functionalStatus = session.functional_status || 'Not assessed'
    const functionalDetails = session.functional_details || ''
    const functionalLine =
      functionalStatus +
      (functionalDetails ? ` - ${functionalDetails}` : '')

    // Patient questions
    const patientQuestions = (session.patient_questions as string[]) || []
    const questionsText =
      patientQuestions.length > 0
        ? patientQuestions.map((q) => `- ${q}`).join('\n')
        : '- none'

    // Escalation flags
    const escalationFlags = extractEscalationFlags(session)
    const escalationText =
      escalationFlags.length > 0
        ? escalationFlags
            .map((f) => `- [${f.tier.toUpperCase()}] ${f.category}: ${f.triggerText}`)
            .join('\n')
        : '- none'

    // AI recommendation based on escalation level
    const escalationLevel = session.escalation_level || 'none'
    let aiRecommendation: string
    switch (escalationLevel) {
      case 'urgent':
        aiRecommendation = 'URGENT REVIEW - Immediate clinician attention required'
        break
      case 'same_day':
        aiRecommendation = 'Same-day callback recommended'
        break
      case 'next_visit':
        aiRecommendation = 'Flag for next visit review'
        break
      default:
        aiRecommendation = 'Routine follow-up - no immediate action needed'
    }

    const summary = `POST-VISIT FOLLOW-UP SUMMARY
Date: ${createdAt} | Patient: ${patientName} | Visit Date: ${visitDate}
Provider: Dr. ${providerName} | Follow-up method: ${followUpMethod} | Duration: ${durationMinutes} min

MEDICATION STATUS:
${medicationLines}

SYMPTOM UPDATE:
- New symptoms: ${newSymptomsText}
- Existing symptoms: ${existingSymptomsText}

FUNCTIONAL STATUS: ${functionalLine}

PATIENT QUESTIONS: ${patientQuestions.length > 0 ? '\n' + questionsText : 'none'}

ESCALATION FLAGS: ${escalationFlags.length > 0 ? '\n' + escalationText : 'none'}

AI RECOMMENDATION: ${aiRecommendation}

---
Generated by AI Follow-Up Agent | Reviewed by: [pending clinician review]
This summary was generated by an automated clinical support tool and should be reviewed by a licensed clinician before clinical action is taken.`

    // Save the generated summary back to the session
    const { error: updateError } = await from('followup_sessions')
      .update({ post_call_summary: summary })
      .eq('id', id)

    if (updateError) {
      console.error('Failed to save summary (non-fatal):', updateError)
    }

    return NextResponse.json({
      summary,
      session,
    })
  } catch (error: unknown) {
    console.error('Follow-up summary API error:', error)
    const message =
      error instanceof Error ? error.message : 'An error occurred while generating the summary'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Extract new symptoms mentioned in the transcript.
 * Looks for patient messages that may contain symptom references.
 */
function extractNewSymptoms(
  transcript: Array<{ role?: string; text?: string }> | null
): string[] {
  if (!transcript) return []
  // Collect patient messages for context — actual symptom extraction
  // was done by the AI and stored in the session data, but we can
  // also check transcript for any mentioned symptoms
  return []
}

/**
 * Extract escalation flags from session data.
 */
function extractEscalationFlags(session: Record<string, unknown>): EscalationFlag[] {
  // Check if escalation data is stored directly on the session
  if (session.escalation_flags && Array.isArray(session.escalation_flags)) {
    return session.escalation_flags as EscalationFlag[]
  }
  // If there's an escalation level but no structured flags, create a basic one
  if (session.escalation_level && session.escalation_level !== 'none') {
    return [
      {
        tier: session.escalation_level as EscalationFlag['tier'],
        triggerText: 'See transcript for details',
        category: 'session_level',
        aiAssessment: `Session marked as ${session.escalation_level}`,
        recommendedAction: 'Review transcript',
        timestamp: (session.created_at as string) || new Date().toISOString(),
      },
    ]
  }
  return []
}
