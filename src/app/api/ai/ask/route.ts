import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    // Check authentication
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { question, context } = await request.json()

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 })
    }

    // Get OpenAI API key - first try environment variable, then try Supabase
    let apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      // Try to get from Supabase app_settings (requires service role)
      const { data: setting } = await supabase
        .rpc('get_openai_key')

      apiKey = setting
    }

    if (!apiKey) {
      return NextResponse.json({
        error: 'OpenAI API key not configured. Please add your API key to the environment variables or Supabase settings.'
      }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey })

    const systemPrompt = `You are a clinical AI assistant for a neurology practice. You help providers with clinical questions, treatment guidelines, and documentation.

Current patient context:
- Patient: ${context?.patient || 'Not specified'}
- Chief Complaint: ${context?.chiefComplaint || 'Not specified'}
- HPI Summary: ${context?.hpi || 'Not provided'}

Provide concise, evidence-based responses. When discussing medications, include typical dosing. Always recommend consulting current guidelines for complex decisions.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      max_tokens: 1000,
      temperature: 0.7,
    })

    const response = completion.choices[0]?.message?.content || 'No response generated'

    return NextResponse.json({ response })

  } catch (error: any) {
    console.error('AI API Error:', error)

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
