import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { INTAKE_CHAT_SYSTEM_PROMPT } from '@/lib/intakePrompts'

export async function POST(request: Request) {
  try {
    const { message, conversationHistory, currentData } = await request.json()

    // Patient portal is publicly accessible — no auth required.
    // Create a Supabase client only for the OpenAI key lookup.
    const supabase = await createClient()

    // Get OpenAI key
    let apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      const { data: setting } = await supabase.rpc('get_openai_key')
      apiKey = setting
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey })

    // Keep only the last 10 messages of conversation history to stay within
    // context limits. The currentData object already has all extracted info,
    // so older exchanges are redundant.
    const recentHistory = Array.isArray(conversationHistory)
      ? conversationHistory.slice(-10)
      : []

    // Build messages array
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: INTAKE_CHAT_SYSTEM_PROMPT },
      { role: 'system', content: `Current collected data: ${JSON.stringify(currentData)}` },
      ...recentHistory.map((msg: { role: string; text: string }) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.text
      })),
      { role: 'user', content: message }
    ]

    // Call GPT-5-mini
    // Note: gpt-5-mini only supports default temperature (1)
    // Use 2000 tokens to ensure the summary response (listing all 9 fields) isn't truncated
    const response = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages,
      response_format: { type: 'json_object' },
      max_completion_tokens: 2000,
    })

    // Check for truncated responses
    const finishReason = response.choices[0].finish_reason
    if (finishReason === 'length') {
      console.warn('AI response truncated (finish_reason: length)')
    }

    const rawContent = response.choices[0].message.content || '{}'
    let result: Record<string, unknown>
    try {
      result = JSON.parse(rawContent)
    } catch {
      console.error('Failed to parse AI response:', rawContent)
      result = { nextQuestion: 'Sorry, I had trouble processing that. Could you repeat your last answer?' }
    }

    // Ensure nextQuestion always exists
    if (!result.nextQuestion) {
      result.nextQuestion = 'Could you tell me a bit more? I want to make sure I have everything.'
    }

    // If all 9 fields are collected but the model didn't set isComplete,
    // force completion so the conversation doesn't loop.
    const requiredFields = [
      'patient_name', 'date_of_birth', 'email', 'phone',
      'chief_complaint', 'current_medications', 'allergies',
      'medical_history', 'family_history'
    ]
    const allData = { ...currentData, ...(result.extractedData as Record<string, string> || {}) }
    const collectedFields = requiredFields.filter(f => allData[f] && String(allData[f]).trim() !== '')
    if (collectedFields.length >= 9 && !result.isComplete) {
      result.isComplete = true
      result.nextQuestion = `Great, I have all your information! Here's a summary:\n\n` +
        `• Name: ${allData.patient_name}\n` +
        `• DOB: ${allData.date_of_birth}\n` +
        `• Email: ${allData.email}\n` +
        `• Phone: ${allData.phone}\n` +
        `• Chief Complaint: ${allData.chief_complaint}\n` +
        `• Medications: ${allData.current_medications}\n` +
        `• Allergies: ${allData.allergies}\n` +
        `• Medical History: ${allData.medical_history}\n` +
        `• Family History: ${allData.family_history}\n\n` +
        `I'll now switch you to the form so you can review and submit.`
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Intake chat error:', error)
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    )
  }
}
