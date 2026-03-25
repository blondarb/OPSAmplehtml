import { NextResponse } from 'next/server'
import { invokeBedrock } from '@/lib/bedrock'
import { getUser } from '@/lib/cognito/server'
import { from } from '@/lib/db-query'


export async function POST(request: Request) {
  try {
    const user = await getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message_id, patient_message, patient_context, physician_instructions } = await request.json()

    if (!patient_message) {
      return NextResponse.json({ error: 'patient_message is required' }, { status: 400 })
    }

    // Build patient context section
    let contextSection = ''
    if (patient_context) {
      const parts: string[] = []
      if (patient_context.name) parts.push(`Patient: ${patient_context.name}`)
      if (patient_context.diagnoses) parts.push(`Active Diagnoses: ${patient_context.diagnoses}`)
      if (patient_context.medications) parts.push(`Current Medications: ${patient_context.medications}`)
      if (patient_context.recent_visit) parts.push(`Recent Visit Summary: ${patient_context.recent_visit}`)
      if (patient_context.allergies) parts.push(`Allergies: ${patient_context.allergies}`)
      if (parts.length > 0) {
        contextSection = `\n\nPatient Context:\n${parts.join('\n')}`
      }
    }

    // Physician custom instructions
    let customInstructions = ''
    if (physician_instructions) {
      customInstructions = `\n\nPhysician Style Preferences:\n${physician_instructions}`
    }

    const systemPrompt = `You are drafting a response to a patient message on behalf of a neurology physician.

Guidelines:
- Be professional, warm, and empathetic
- Use appropriate health literacy level (avoid excessive jargon)
- Never provide specific medical advice that could contradict the treatment plan
- Do not diagnose or change treatment plans in messages
- For clinical concerns, encourage the patient to schedule a visit or call the office
- Always end with: "If your symptoms worsen or you have urgent concerns, please contact our office directly or call 911 for emergencies."
- Keep responses concise (2-4 paragraphs)
- Sign off as "Your care team at Meridian Neurology"${contextSection}${customInstructions}

Draft a response to the following patient message. The physician will review and may edit before sending.`

    const result = await invokeBedrock({
      system: systemPrompt,
      messages: [{ role: 'user', content: patient_message }],
      maxTokens: 500,
      temperature: 1,
    })

    const draft = result.text || ''

    // NOTE: Storing draft on the message record is deferred until
    // patient_messages table schema is updated with ai_draft and
    // draft_status columns. For now, the draft is returned in the
    // response for the client to use directly.

    return NextResponse.json({ draft })
  } catch (error: any) {
    console.error('AI Draft Response Error:', error)
    return NextResponse.json({
      error: error?.message || 'Failed to generate draft response',
    }, { status: 500 })
  }
}
