import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sections, noteType, diagnoses } = await request.json()

    if (!sections || !Array.isArray(sections) || sections.length === 0) {
      return NextResponse.json({ error: 'Note sections are required' }, { status: 400 })
    }

    let apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      const { data: setting } = await supabase.rpc('get_openai_key')
      apiKey = setting
    }

    if (!apiKey) {
      return NextResponse.json({
        error: 'OpenAI API key not configured.'
      }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey })

    const noteText = sections
      .map((s: { title: string; content: string }) => `${s.title.toUpperCase()}:\n${s.content || '(empty)'}`)
      .join('\n\n')

    const diagnosisContext = diagnoses && diagnoses.length > 0
      ? `\nActive diagnoses: ${diagnoses.join(', ')}`
      : ''

    const systemPrompt = `You are a clinical documentation quality reviewer for a neurology practice. Analyze the following clinical note and identify issues related to:

1. **Consistency** — contradictions between sections (e.g., Assessment mentions a diagnosis not supported by HPI or exam findings)
2. **Completeness** — missing information that is clinically expected (e.g., Plan doesn't address a listed diagnosis, ROS missing for a key system)
3. **Quality** — documentation improvements (e.g., vague language that could be more specific, missing laterality, missing timeline details)

Rules:
- Return at most 6 suggestions, prioritized by clinical importance.
- Only flag genuine issues; do not fabricate problems.
- Each suggestion must reference the relevant section by its ID.
- Be specific and actionable in your message text.
- Severity "warning" = likely documentation gap or inconsistency. Severity "info" = optional improvement.

Note type: ${noteType || 'new-consult'}${diagnosisContext}

Respond with valid JSON matching this schema:
{
  "suggestions": [
    {
      "type": "consistency" | "completeness" | "quality",
      "message": "string — specific, actionable suggestion",
      "sectionId": "string — the section ID this relates to",
      "severity": "warning" | "info"
    }
  ]
}

If the note has no issues, return: { "suggestions": [] }`

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: noteText }
      ],
      max_completion_tokens: 1500,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content || '{"suggestions":[]}'
    const parsed = JSON.parse(raw)

    // Validate and sanitize
    const suggestions = (parsed.suggestions || [])
      .slice(0, 6)
      .map((s: { type?: string; message?: string; sectionId?: string; severity?: string }) => ({
        type: ['consistency', 'completeness', 'quality'].includes(s.type || '') ? s.type : 'quality',
        message: String(s.message || ''),
        sectionId: String(s.sectionId || ''),
        severity: s.severity === 'warning' ? 'warning' : 'info',
      }))

    return NextResponse.json({ suggestions })

  } catch (error: unknown) {
    console.error('Note review API error:', error)
    const message = error instanceof Error ? error.message : 'An error occurred'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
