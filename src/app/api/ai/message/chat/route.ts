import { NextResponse } from 'next/server'
import { MESSAGE_CHAT_SYSTEM_PROMPT } from '@/lib/intakePrompts'
import { invokeBedrockJSON } from '@/lib/bedrock'


export async function POST(request: Request) {
  try {
    const { message, conversationHistory, currentData } = await request.json()

    // Build the system prompt that includes the current collected data context
    const systemPromptWithContext = `${MESSAGE_CHAT_SYSTEM_PROMPT}\n\nCurrent collected data: ${JSON.stringify(currentData)}`

    const recentHistory = Array.isArray(conversationHistory)
      ? conversationHistory.slice(-10)
      : []

    // Build messages array — only user/assistant roles for Bedrock
    const messages = [
      ...recentHistory.map((msg: { role: string; text: string }) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.text,
      })),
      { role: 'user' as const, content: message },
    ]

    const { parsed: result } = await invokeBedrockJSON<Record<string, unknown>>({
      system: systemPromptWithContext,
      messages,
      maxTokens: 1500,
      temperature: 1,
    })

    if (!result.nextQuestion) {
      result.nextQuestion = 'Could you tell me a bit more about what you need?'
    }

    // If all required message fields are collected but review hasn't been triggered
    const requiredFields = ['patient_name', 'date_of_birth', 'body']
    const allData = { ...currentData, ...(result.extractedData as Record<string, string> || {}) }
    const collectedFields = requiredFields.filter(f => allData[f] && String(allData[f]).trim() !== '')
    if (collectedFields.length >= 3 && !result.isComplete && !result.readyForReview) {
      result.readyForReview = true
      const subject = allData.subject || 'Patient Message'
      result.nextQuestion = `Here's the message I've composed for you:\n\n` +
        `**Subject:** ${subject}\n\n` +
        `**Message:**\n${allData.body}\n\n` +
        `Does this look correct? Let me know if you'd like to change anything, or say "send it" to submit.`
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Message chat error:', error)
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 },
    )
  }
}
