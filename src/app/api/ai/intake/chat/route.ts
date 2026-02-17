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

    // Build messages array
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: INTAKE_CHAT_SYSTEM_PROMPT },
      { role: 'system', content: `Current collected data: ${JSON.stringify(currentData)}` },
      ...conversationHistory.map((msg: { role: string; text: string }) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.text
      })),
      { role: 'user', content: message }
    ]

    // Call GPT-5-mini
    // Note: gpt-5-mini only supports default temperature (1)
    const response = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages,
      response_format: { type: 'json_object' },
      max_completion_tokens: 1000,
    })

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

    return NextResponse.json(result)
  } catch (error) {
    console.error('Intake chat error:', error)
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    )
  }
}
