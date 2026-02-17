import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { MESSAGE_CHAT_SYSTEM_PROMPT } from '@/lib/intakePrompts'

export async function POST(request: Request) {
  try {
    const { message, conversationHistory, currentData } = await request.json()

    const supabase = await createClient()

    let apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      const { data: setting } = await supabase.rpc('get_openai_key')
      apiKey = setting
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey })

    const recentHistory = Array.isArray(conversationHistory)
      ? conversationHistory.slice(-10)
      : []

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: MESSAGE_CHAT_SYSTEM_PROMPT },
      { role: 'system', content: `Current collected data: ${JSON.stringify(currentData)}` },
      ...recentHistory.map((msg: { role: string; text: string }) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.text,
      })),
      { role: 'user', content: message },
    ]

    const response = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages,
      response_format: { type: 'json_object' },
      max_completion_tokens: 1500,
    })

    const rawContent = response.choices[0].message.content || '{}'
    let result: Record<string, unknown>
    try {
      result = JSON.parse(rawContent)
    } catch {
      console.error('Failed to parse AI response:', rawContent)
      result = { nextQuestion: 'Sorry, I had trouble processing that. Could you try again?' }
    }

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
