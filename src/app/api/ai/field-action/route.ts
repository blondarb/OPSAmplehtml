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
}

const ACTION_PROMPTS: Record<FieldActionType, string> = {
  improve: `You are a clinical documentation expert. Improve the following clinical text by:
- Correcting grammar and spelling
- Using proper medical terminology
- Making it more professional and clear
- Maintaining the original meaning and clinical accuracy
- Keeping it concise

Return ONLY the improved text without any explanations or preamble.`,

  expand: `You are a clinical documentation expert. Expand the following clinical text by:
- Adding relevant clinical details and context
- Including appropriate medical terminology
- Elaborating on key findings or symptoms
- Maintaining clinical accuracy
- Keeping a professional tone

Return ONLY the expanded text without any explanations or preamble.`,

  summarize: `You are a clinical documentation expert. Summarize the following clinical text by:
- Condensing to the essential clinical information
- Maintaining all critical findings
- Using concise medical terminology
- Removing redundancy while preserving meaning
- Keeping it clear and scannable

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

    const { action, text, fieldName, context }: FieldActionRequest = await request.json()

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

    const systemPrompt = `${ACTION_PROMPTS[action]}

${fieldContext}
${patientContext}
${complaintContext}

Important: This is for a neurology practice. Ensure the output is appropriate for neurological documentation.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      max_tokens: 1500,
      temperature: 0.5,
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
