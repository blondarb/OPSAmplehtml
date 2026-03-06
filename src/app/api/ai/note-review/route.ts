import { NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { invokeBedrockJSON } from '@/lib/bedrock'


export async function POST(request: Request) {
  try {
    const user = await getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sections, noteType, diagnoses } = await request.json()

    if (!sections || !Array.isArray(sections) || sections.length === 0) {
      return NextResponse.json({ error: 'Note sections are required' }, { status: 400 })
    }

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
- Only flag genuine issues; do not fabricate problems. Be conservative — when in doubt, do not flag.
- Each suggestion must reference the relevant section by its ID. Valid section IDs are: chiefComplaint, hpi, ros, scales, vitals, physicalExam, imaging, labs, assessment, plan
- Be specific and actionable in your message text. Use concrete clinical language.
- Severity "warning" = likely documentation gap or inconsistency. Severity "info" = optional improvement.
- Be deterministic: given the same note, always produce the same suggestions. Do not vary phrasing or findings between runs.

Note type: ${noteType || 'new-consult'}${diagnosisContext}

Return a JSON object with the following format:
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

    const { parsed } = await invokeBedrockJSON<{ suggestions: Array<{ type?: string; message?: string; sectionId?: string; severity?: string }> }>({
      system: systemPrompt,
      messages: [{ role: 'user', content: noteText }],
      maxTokens: 1500,
      temperature: 1,
    })

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
