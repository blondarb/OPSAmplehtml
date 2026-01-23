import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    // Check authentication
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { patient, noteData } = await request.json()

    // Get OpenAI API key
    let apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      const { data: setting } = await supabase.rpc('get_openai_key')
      apiKey = setting
    }

    if (!apiKey) {
      return NextResponse.json({
        error: 'OpenAI API key not configured'
      }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey })

    // Fetch patient's visit history for context
    const { data: visits } = await supabase
      .from('visits')
      .select(`
        *,
        clinical_notes(hpi, assessment, plan, ai_summary),
        clinical_scales(scale_type, score, interpretation),
        diagnoses(icd10_code, description)
      `)
      .eq('patient_id', patient?.id)
      .eq('status', 'completed')
      .order('visit_date', { ascending: false })
      .limit(3)

    // Fetch imaging studies
    const { data: imaging } = await supabase
      .from('imaging_studies')
      .select('*')
      .eq('patient_id', patient?.id)
      .order('study_date', { ascending: false })
      .limit(5)

    const visitHistory = visits?.map(v => ({
      date: new Date(v.visit_date).toLocaleDateString(),
      type: v.visit_type,
      chiefComplaint: v.chief_complaint?.join(', '),
      hpi: v.clinical_notes?.hpi,
      assessment: v.clinical_notes?.assessment,
      scales: v.clinical_scales?.map((s: any) => `${s.scale_type}: ${s.score} (${s.interpretation})`).join(', '),
      diagnoses: v.diagnoses?.map((d: any) => `${d.icd10_code} - ${d.description}`).join(', '),
    })) || []

    const imagingSummary = imaging?.map(i => ({
      date: new Date(i.study_date).toLocaleDateString(),
      type: i.study_type,
      description: i.description,
      impression: i.impression,
    })) || []

    // Build context for the AI
    const patientContext = `Patient Information:
- Name: ${patient?.first_name} ${patient?.last_name}
- Age: ${patient?.date_of_birth ? new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear() : 'Unknown'}
- Gender: ${patient?.gender || 'Unknown'}
- MRN: ${patient?.mrn || 'Unknown'}

Current Visit:
- Chief Complaint: ${noteData?.chiefComplaint?.join(', ') || 'Not specified'}

Visit History:
${visitHistory.length > 0 ? visitHistory.map(v => `
- ${v.date} (${v.type}): ${v.chiefComplaint}
  HPI: ${v.hpi?.substring(0, 300) || 'N/A'}
  Assessment: ${v.assessment || 'N/A'}
  Scales: ${v.scales || 'None recorded'}
  Diagnoses: ${v.diagnoses || 'None recorded'}
`).join('\n') : 'No prior visits on record'}

Imaging Studies:
${imagingSummary.length > 0 ? imagingSummary.map(i => `
- ${i.date}: ${i.type} - ${i.description}
  Impression: ${i.impression || 'N/A'}
`).join('\n') : 'No imaging studies on record'}`

    const systemPrompt = `You are a clinical AI assistant preparing a structured chart prep for a neurology visit.

${patientContext}

Generate a JSON response with the following sections. Each section should be clinically relevant and actionable.
For sections where you have insufficient data, provide a reasonable clinical template or indicate what information is needed.

IMPORTANT: Return ONLY valid JSON, no markdown formatting.

{
  "patientSummary": "2-3 sentence overview of this patient including key demographics and primary diagnoses",
  "suggestedHPI": "A draft HPI paragraph based on the chief complaint and history. Should be 3-5 sentences suitable for documentation. Include relevant history context.",
  "relevantHistory": "Bulleted summary of pertinent medical history, prior treatments, and outcomes",
  "currentMedications": "List of current/recent medications mentioned in prior notes, or 'Review with patient' if unknown",
  "imagingFindings": "Summary of relevant imaging findings and their clinical significance",
  "scaleTrends": "Summary of clinical scale scores over time (e.g., MIDAS, HIT-6, PHQ-9) and trends",
  "keyConsiderations": "3-5 bullet points of important things to address this visit",
  "suggestedAssessment": "Draft assessment statement based on chief complaint and history",
  "suggestedPlan": "Draft plan with 3-5 specific recommendations based on the clinical picture"
}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Generate the structured chart prep JSON for this patient visit.' }
      ],
      max_tokens: 2000,
      temperature: 0.4,
    })

    const responseText = completion.choices[0]?.message?.content || ''

    // Parse the JSON response
    try {
      // Clean up the response - remove markdown code blocks if present
      let cleanedResponse = responseText.trim()
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.slice(7)
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.slice(3)
      }
      if (cleanedResponse.endsWith('```')) {
        cleanedResponse = cleanedResponse.slice(0, -3)
      }
      cleanedResponse = cleanedResponse.trim()

      const sections = JSON.parse(cleanedResponse)

      return NextResponse.json({
        sections,
        // Also include raw response for backwards compatibility
        response: formatSectionsAsText(sections)
      })
    } catch (parseError) {
      // If JSON parsing fails, return the raw text
      console.error('Failed to parse chart prep JSON:', parseError)
      return NextResponse.json({
        response: responseText,
        sections: null
      })
    }

  } catch (error: any) {
    console.error('Chart Prep Error:', error)
    return NextResponse.json({
      error: error?.message || 'An error occurred'
    }, { status: 500 })
  }
}

// Helper function to format sections as readable text
function formatSectionsAsText(sections: any): string {
  const parts = []

  if (sections.patientSummary) {
    parts.push(`**Patient Summary**\n${sections.patientSummary}`)
  }
  if (sections.suggestedHPI) {
    parts.push(`**Suggested HPI**\n${sections.suggestedHPI}`)
  }
  if (sections.relevantHistory) {
    parts.push(`**Relevant History**\n${sections.relevantHistory}`)
  }
  if (sections.currentMedications) {
    parts.push(`**Current Medications**\n${sections.currentMedications}`)
  }
  if (sections.imagingFindings) {
    parts.push(`**Imaging Findings**\n${sections.imagingFindings}`)
  }
  if (sections.scaleTrends) {
    parts.push(`**Clinical Scale Trends**\n${sections.scaleTrends}`)
  }
  if (sections.keyConsiderations) {
    parts.push(`**Key Considerations**\n${sections.keyConsiderations}`)
  }
  if (sections.suggestedAssessment) {
    parts.push(`**Suggested Assessment**\n${sections.suggestedAssessment}`)
  }
  if (sections.suggestedPlan) {
    parts.push(`**Suggested Plan**\n${sections.suggestedPlan}`)
  }

  return parts.join('\n\n')
}
