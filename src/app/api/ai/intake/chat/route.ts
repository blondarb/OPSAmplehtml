import { NextResponse } from 'next/server'
import { INTAKE_CHAT_SYSTEM_PROMPT } from '@/lib/intakePrompts'
import { invokeBedrockJSON } from '@/lib/bedrock'


export async function POST(request: Request) {
  try {
    const { message, conversationHistory, currentData } = await request.json()

    // Patient portal is publicly accessible — no auth required.

    // Keep only the last 10 messages of conversation history to stay within
    // context limits. The currentData object already has all extracted info,
    // so older exchanges are redundant.
    const recentHistory = Array.isArray(conversationHistory)
      ? conversationHistory.slice(-10)
      : []

    // Build the system prompt that includes the current collected data context
    const systemPromptWithContext = `${INTAKE_CHAT_SYSTEM_PROMPT}\n\nCurrent collected data: ${JSON.stringify(currentData)}`

    // Build messages array — only user/assistant roles for Bedrock
    const messages = [
      ...recentHistory.map((msg: { role: string; text: string }) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.text
      })),
      { role: 'user' as const, content: message }
    ]

    // Use 2000 tokens to ensure the summary response (listing all 9 fields) isn't truncated
    const { parsed: result } = await invokeBedrockJSON<Record<string, unknown>>({
      system: systemPromptWithContext,
      messages,
      maxTokens: 2000,
      temperature: 1,
    })

    // Ensure nextQuestion always exists
    if (!result.nextQuestion) {
      result.nextQuestion = 'Could you tell me a bit more? I want to make sure I have everything.'
    }

    // If all 9 fields are collected but the model hasn't shown a summary yet,
    // trigger the review summary so the patient can confirm or correct.
    const requiredFields = [
      'patient_name', 'date_of_birth', 'email', 'phone',
      'chief_complaint', 'current_medications', 'allergies',
      'medical_history', 'family_history'
    ]
    const allData = { ...currentData, ...(result.extractedData as Record<string, string> || {}) }
    const collectedFields = requiredFields.filter(f => allData[f] && String(allData[f]).trim() !== '')
    if (collectedFields.length >= 9 && !result.isComplete && !result.readyForReview) {
      result.readyForReview = true
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
        `Does everything look correct? Let me know if you'd like to change or add anything, or say "looks good" to submit.`
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
