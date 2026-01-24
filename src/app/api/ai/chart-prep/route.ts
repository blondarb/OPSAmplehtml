import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

interface UserSettings {
  globalAiInstructions?: string
  documentationStyle?: 'concise' | 'detailed' | 'narrative'
  preferredTerminology?: 'formal' | 'standard' | 'simplified'
}

export async function POST(request: Request) {
  try {
    // Check authentication
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { patient, noteData, prepNotes, userSettings } = await request.json()

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
`).join('\n') : 'No imaging studies on record'}

Provider's Pre-Visit Notes (IMPORTANT - use these to guide the summary):
${prepNotes && prepNotes.length > 0
  ? prepNotes.map((n: { category: string; text: string }) => `[${n.category?.toUpperCase() || 'NOTE'}] ${n.text}`).join('\n\n')
  : 'No pre-visit notes recorded'}`

    // Build user preferences section
    let userPreferences = ''
    if (userSettings) {
      const prefs: string[] = []

      // Global AI instructions
      if (userSettings.globalAiInstructions) {
        prefs.push(`User preferences: ${userSettings.globalAiInstructions}`)
      }

      // Documentation style
      if (userSettings.documentationStyle) {
        const styleGuide: Record<string, string> = {
          concise: 'Keep all sections brief and focused on essential information only.',
          detailed: 'Provide comprehensive coverage with thorough documentation in each section.',
          narrative: 'Write in a flowing, story-like prose format where appropriate.',
        }
        prefs.push(styleGuide[userSettings.documentationStyle])
      }

      // Terminology preference
      if (userSettings.preferredTerminology) {
        const termGuide: Record<string, string> = {
          formal: 'Use formal, academic medical terminology.',
          standard: 'Use standard clinical terminology.',
          simplified: 'Use simplified, accessible medical language.',
        }
        prefs.push(termGuide[userSettings.preferredTerminology])
      }

      if (prefs.length > 0) {
        userPreferences = `\n\nUser Style Preferences:\n${prefs.join('\n')}`
      }
    }

    const systemPrompt = `You are a clinical AI assistant preparing a concise, scannable chart prep for a neurology visit.

${patientContext}

CRITICAL: If "Provider's Pre-Visit Notes" are present above, use them as the PRIMARY source of information.
The provider has already reviewed the chart and dictated key observations. Base your summary on their notes.

Generate a JSON response with HIGH-YIELD, BULLET-STYLE summaries. Keep each section concise and actionable.
Use "•" for bullet points. Each bullet should be 1 line max.

IMPORTANT: Return ONLY valid JSON, no markdown formatting.

{
  "visitPurpose": "One sentence: reason for visit + time since last seen",
  "alerts": "2-4 bullets of URGENT items only: drug interactions, overdue screenings, critical labs, safety concerns. Use ⚠️ prefix. Return empty string if none.",
  "keyMetrics": "2-4 bullets showing trends with arrows: • MIDAS: 42 → 28 (improving) or • PHQ-9: 12 (stable). Include actual numbers when available.",
  "currentTreatment": "2-4 bullets of active medications with duration and response: • Topiramate 100mg BID (6mo, good response)",
  "lastVisitSummary": "2-3 sentences summarizing the most recent visit: what was discussed, decisions made, patient status",
  "suggestedFocus": "2-4 bullets of specific items to address THIS visit. Start each with action verb.",
  "suggestedHPI": "A draft HPI paragraph (3-5 sentences) incorporating chief complaint and relevant history context.",
  "suggestedAssessment": "1-2 sentence clinical impression based on available data",
  "suggestedPlan": "3-5 bullet points with specific, actionable recommendations"
}${userPreferences}`

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

  if (sections.visitPurpose) {
    parts.push(`**Visit Purpose**\n${sections.visitPurpose}`)
  }
  if (sections.alerts) {
    parts.push(`**Alerts**\n${sections.alerts}`)
  }
  if (sections.keyMetrics) {
    parts.push(`**Key Metrics**\n${sections.keyMetrics}`)
  }
  if (sections.currentTreatment) {
    parts.push(`**Current Treatment**\n${sections.currentTreatment}`)
  }
  if (sections.lastVisitSummary) {
    parts.push(`**Last Visit Summary**\n${sections.lastVisitSummary}`)
  }
  if (sections.suggestedFocus) {
    parts.push(`**Suggested Focus**\n${sections.suggestedFocus}`)
  }
  if (sections.suggestedHPI) {
    parts.push(`**Suggested HPI**\n${sections.suggestedHPI}`)
  }
  if (sections.suggestedAssessment) {
    parts.push(`**Suggested Assessment**\n${sections.suggestedAssessment}`)
  }
  if (sections.suggestedPlan) {
    parts.push(`**Suggested Plan**\n${sections.suggestedPlan}`)
  }

  // Support legacy field names for backwards compatibility
  if (sections.patientSummary && !sections.visitPurpose) {
    parts.unshift(`**Patient Summary**\n${sections.patientSummary}`)
  }
  if (sections.keyConsiderations && !sections.suggestedFocus) {
    parts.push(`**Key Considerations**\n${sections.keyConsiderations}`)
  }

  return parts.join('\n\n')
}
