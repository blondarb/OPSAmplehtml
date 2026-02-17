import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { INTAKE_CHAT_SYSTEM_PROMPT } from '@/lib/intakePrompts'

export async function POST(request: Request) {
  try {
    const { message, conversationHistory, currentData } = await request.json()

    // Auth check
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
    const response = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages,
      response_format: { type: 'json_object' },
      max_completion_tokens: 500,
      temperature: 0.7
    })

    const result = JSON.parse(response.choices[0].message.content || '{}')

    return NextResponse.json(result)
  } catch (error) {
    console.error('Intake chat error:', error)
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    )
  }
}
