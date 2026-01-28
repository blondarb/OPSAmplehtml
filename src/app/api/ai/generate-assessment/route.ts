import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

interface DiagnosisInput {
  id: string
  name: string
  icd10: string
}

interface AssessmentContext {
  patientName?: string
  patientAge?: number
  patientGender?: string
  chiefComplaints?: string[]
  hpi?: string
  ros?: string
  physicalExam?: string
  selectedDiagnoses?: DiagnosisInput[]
}

interface UserSettings {
  globalAiInstructions?: string
  sectionAiInstructions?: Record<string, string>
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

    const { context, userSettings }: { context: AssessmentContext; userSettings?: UserSettings } = await request.json()

    if (!context?.selectedDiagnoses || context.selectedDiagnoses.length === 0) {
      return NextResponse.json({
        error: 'At least one diagnosis must be selected to generate an assessment'
      }, { status: 400 })
    }

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

    // Format diagnoses for the prompt
    const diagnosisListFormatted = context.selectedDiagnoses
      .map((d, i) => `${i + 1}. ${d.name} (${d.icd10})`)
      .join('\n')

    // Build user preferences section
    let userPreferences = ''
    if (userSettings) {
      const prefs: string[] = []

      // Global AI instructions
      if (userSettings.globalAiInstructions) {
        prefs.push(`User preferences: ${userSettings.globalAiInstructions}`)
      }

      // Section-specific instructions for assessment
      if (userSettings.sectionAiInstructions?.assessment) {
        prefs.push(`Assessment section instructions: ${userSettings.sectionAiInstructions.assessment}`)
      }

      // Documentation style
      if (userSettings.documentationStyle) {
        const styleGuide: Record<string, string> = {
          concise: 'Keep the output brief and focused on essential information only.',
          detailed: 'Provide comprehensive coverage with thorough documentation.',
          narrative: 'Write in a flowing, story-like prose format.',
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

    const systemPrompt = `You are a clinical documentation assistant for a neurology practice. Generate a concise, professional clinical assessment based on the provided patient information and selected diagnoses.

Guidelines:
- Write in standard medical documentation style (brief, factual)
- Include the diagnosis name and ICD-10 code for each diagnosis
- Reference relevant findings from the HPI and exam that support each diagnosis
- Keep the assessment focused and concise (2-4 sentences per diagnosis)
- Use appropriate clinical terminology
- Do NOT make up information not provided in the context
- If information is missing, focus on what IS available${userPreferences}`

    const userPrompt = `Generate a clinical assessment for the following patient:

Patient: ${context.patientAge || 'Unknown age'} ${context.patientGender === 'F' ? 'female' : context.patientGender === 'M' ? 'male' : 'patient'}${context.patientName ? ` (${context.patientName})` : ''}

Chief Complaint(s): ${context.chiefComplaints?.join(', ') || 'Not specified'}

History of Present Illness:
${context.hpi || 'Not provided'}

${context.ros ? `Review of Systems:\n${context.ros}\n` : ''}
${context.physicalExam ? `Physical Examination:\n${context.physicalExam}\n` : ''}

Selected Diagnoses:
${diagnosisListFormatted}

Generate a clinical assessment that addresses each diagnosis with relevant supporting findings. Format as a numbered list matching the diagnosis order above.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-5', // Complex clinical reasoning task - use gpt-5 for better accuracy
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 1500,
      temperature: 0.3, // Lower temperature for more consistent clinical output
    })

    const assessment = completion.choices[0]?.message?.content || 'Unable to generate assessment'

    return NextResponse.json({ assessment })

  } catch (error: any) {
    console.error('Generate Assessment API Error:', error)

    if (error?.status === 401) {
      return NextResponse.json({
        error: 'Invalid OpenAI API key'
      }, { status: 500 })
    }

    return NextResponse.json({
      error: error?.message || 'An error occurred while generating assessment'
    }, { status: 500 })
  }
}
