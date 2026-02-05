import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

export type FieldActionType = 'improve' | 'expand' | 'summarize'

interface FieldActionRequest {
  action: FieldActionType
  text: string
  fieldName: string
  context?: {
    patient?: string
    chiefComplaint?: string
  }
  userSettings?: {
    globalAiInstructions?: string
    sectionAiInstructions?: Record<string, string>
    documentationStyle?: 'concise' | 'detailed' | 'narrative'
    preferredTerminology?: 'formal' | 'standard' | 'simplified'
  }
}

const ACTION_PROMPTS: Record<FieldActionType, string> = {
  improve: `You are a clinical documentation expert. Improve the following clinical text by:
- Correcting grammar and spelling
- Using proper medical terminology
- Making it more professional and clear
- Maintaining the original meaning and clinical accuracy
- Keeping it concise

CRITICAL: Do NOT add any new clinical information, symptoms, findings, or details that are not present in the original text. Only improve the writing quality of what is already stated.

Return ONLY the improved text without any explanations or preamble.`,

  expand: `You are a clinical documentation expert. Expand the following clinical text by:
- Elaborating on findings or symptoms ALREADY MENTIONED in the text
- Adding appropriate medical terminology for concepts already present
- Providing more complete descriptions of what is already stated
- Structuring the information more thoroughly

CRITICAL SAFETY RULES - YOU MUST FOLLOW THESE:
1. NEVER invent, fabricate, or hallucinate any new clinical information
2. NEVER add symptoms, findings, test results, or diagnoses not explicitly mentioned
3. NEVER assume or infer clinical details that are not stated
4. ONLY expand on what is ACTUALLY WRITTEN in the original text
5. If the text mentions "headache", you may describe it more fully, but do NOT add nausea, photophobia, or other symptoms unless they are mentioned
6. If unsure whether something is implied, DO NOT ADD IT

The expansion should make the existing content more detailed and professional, NOT add new clinical facts.

Return ONLY the expanded text without any explanations or preamble.`,

  summarize: `You are a clinical documentation expert. Summarize the following clinical text by:
- Condensing to the essential clinical information
- Maintaining all critical findings
- Using concise medical terminology
- Removing redundancy while preserving meaning
- Keeping it clear and scannable

CRITICAL: Include ONLY information that is explicitly stated in the original text. Do NOT add any new findings, symptoms, or clinical details during summarization.

Return ONLY the summarized text without any explanations or preamble.`,
}

const FIELD_CONTEXT: Record<string, string> = {
  hpi: 'This is the History of Present Illness section of a clinical note.',
  ros: 'This is the Review of Systems section of a clinical note.',
  assessment: 'This is the Assessment section of a clinical note, containing diagnoses and clinical impressions.',
  plan: 'This is the Plan section of a clinical note, containing treatment recommendations and follow-up.',
  allergies: 'This is the Allergies section listing patient allergies and reactions.',
  findings: 'This is the Findings section for an imaging or diagnostic study.',
}

export async function POST(request: Request) {
  try {
    // Check authentication
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { action, text, fieldName, context, userSettings }: FieldActionRequest = await request.json()

    if (!action || !['improve', 'expand', 'summarize'].includes(action)) {
      return NextResponse.json({ error: 'Valid action (improve, expand, summarize) is required' }, { status: 400 })
    }

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text content is required' }, { status: 400 })
    }

    // Get OpenAI API key - first try environment variable, then try Supabase
    let apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      const { data: setting } = await supabase.rpc('get_openai_key')
      apiKey = setting
    }

    if (!apiKey) {
      return NextResponse.json({
        error: 'OpenAI API key not configured. Please add your API key to the environment variables or Supabase settings.'
      }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey })

    // Build the system prompt with field context
    const fieldContext = FIELD_CONTEXT[fieldName] || 'This is a clinical documentation field.'
    const patientContext = context?.patient ? `Patient: ${context.patient}` : ''
    const complaintContext = context?.chiefComplaint ? `Chief Complaint: ${context.chiefComplaint}` : ''

    // Build safety reminder for clinical accuracy
    const safetyReminder = action === 'expand'
      ? `\n\nREMINDER: Patient safety is paramount. Hallucinating or fabricating clinical information could lead to medical errors. Only elaborate on information explicitly present in the input text.`
      : ''

    // Build user preferences section
    let userPreferences = ''
    if (userSettings) {
      const prefs: string[] = []

      // Global AI instructions
      if (userSettings.globalAiInstructions) {
        prefs.push(`User preferences: ${userSettings.globalAiInstructions}`)
      }

      // Section-specific instructions
      if (userSettings.sectionAiInstructions?.[fieldName]) {
        prefs.push(`Section-specific instructions: ${userSettings.sectionAiInstructions[fieldName]}`)
      }

      // Documentation style
      if (userSettings.documentationStyle) {
        const styleGuide = {
          concise: 'Keep the output brief and focused on essential information only.',
          detailed: 'Provide comprehensive coverage with thorough documentation.',
          narrative: 'Write in a flowing, story-like prose format.',
        }
        prefs.push(styleGuide[userSettings.documentationStyle])
      }

      // Terminology preference
      if (userSettings.preferredTerminology) {
        const termGuide = {
          formal: 'Use formal, academic medical terminology.',
          standard: 'Use standard clinical terminology.',
          simplified: 'Use simplified, accessible medical language.',
        }
        prefs.push(termGuide[userSettings.preferredTerminology])
      }

      if (prefs.length > 0) {
        userPreferences = `\n\n${prefs.join('\n')}`
      }
    }

    const systemPrompt = `${ACTION_PROMPTS[action]}

${fieldContext}
${patientContext}
${complaintContext}

Important: This is for a neurology practice. Ensure the output is appropriate for neurological documentation.${safetyReminder}${userPreferences}`

    // Use lower temperature for expand to reduce hallucination risk
    const temperature = action === 'expand' ? 0.3 : 0.5

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-mini', // Cost-effective for text transformation ($0.25/$2 per 1M tokens)
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      max_completion_tokens: 1500,
      temperature,
    })

    const result = completion.choices[0]?.message?.content || text

    return NextResponse.json({
      result,
      action,
      originalLength: text.length,
      resultLength: result.length,
    })

  } catch (error: any) {
    console.error('Field Action API Error:', error)

    if (error?.status === 401) {
      return NextResponse.json({
        error: 'Invalid OpenAI API key. Please check your configuration.'
      }, { status: 500 })
    }

    return NextResponse.json({
      error: error?.message || 'An error occurred while processing your request'
    }, { status: 500 })
  }
}
