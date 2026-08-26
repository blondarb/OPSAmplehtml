/**
 * POST /api/ai/historian/patient-report
 *
 * Generates a warm, plain-language recap of an AI Historian interview for
 * the PATIENT to read on the post-interview report page
 * (HistorianReportView, `/patient/historian`). This is intentionally a
 * separate, much simpler prompt from the physician-facing structured
 * extraction — it must never contain a diagnosis, clinical interpretation,
 * or treatment advice. See CRITICAL RULES in SYSTEM_PROMPT below, which
 * mirror the patient-safety rules the AI Historian itself follows
 * (src/lib/historianPrompts.ts).
 *
 * Fail closed for presentation: any generation error returns an unavailable
 * state. The separately persisted transcript remains accessible, but is never
 * relabeled as a generated patient or clinician report.
 */

import { NextResponse } from 'next/server'
import { invokeBedrock } from '@/lib/bedrock'
import type { HistorianStructuredOutput, HistorianTranscriptEntry } from '@/lib/historianTypes'

const SYSTEM_PROMPT = `You are writing a plain-language recap for a PATIENT of what THEY shared during an AI health-intake interview. This text is shown directly to the patient, before their neurologist has reviewed anything.

CRITICAL RULES:
1. Write at approximately a 6th-grade reading level. Short sentences. Warm, reassuring, conversational tone — never clinical-sounding.
2. Recap ONLY what the patient told the interviewer. Do not add, infer, or interpret anything they did not say.
3. NEVER include a diagnosis, medical opinion, clinical interpretation, or treatment/medication advice. Do not say "it could be X," "this sounds like X," or anything that guesses at a cause.
4. Do NOT mention red flags, urgency levels, severity judgments, or clinical risk assessments — those are for the physician only, never the patient-facing recap.
5. Frame the recap as a summary of what the patient shared today — make clear their neurologist will review it before the visit.
6. End with a brief, gentle reminder to reach out to their doctor's office with any questions, and to call 911 for a medical emergency.
7. Write in second person ("you told us...", "you mentioned...").
8. Keep it to 2-4 short paragraphs. No headers, no bullet lists, no medical jargon — write it like a warm note, not a chart.
9. Medication names, amounts, and schedules may come ONLY from the structured field labeled "current medications". If that field is absent or blank, omit medication details even if another field appears to mention them.

Output ONLY the recap text. No preamble, no markdown formatting, no "Here is your summary:" — just the recap itself.`

interface PatientReportRequestBody {
  structuredOutput?: HistorianStructuredOutput | null
  narrativeSummary?: string | null
  transcript?: HistorianTranscriptEntry[] | null
}

function buildUserContent(
  structuredOutput: HistorianStructuredOutput | null,
  narrativeSummary: string | null,
  transcript: HistorianTranscriptEntry[] | null,
): string {
  const parts: string[] = []

  if (narrativeSummary) {
    parts.push(`Narrative summary from the interview:\n${narrativeSummary}`)
  }

  if (structuredOutput) {
    const filled = Object.entries(structuredOutput).filter(
      ([, v]) => typeof v === 'string' && v.trim().length > 0,
    )
    if (filled.length > 0) {
      parts.push(
        'Structured details captured during the interview:\n' +
          filled.map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${v}`).join('\n'),
      )
    }
  }

  // v3 deliberately does not turn a raw transcript into a report. Its
  // transcript remains separately visible while the validated structured
  // history owns generated summaries.
  if (
    parts.length === 0 &&
    structuredOutput?.interview_prompt_version !== 'comprehensive-v3' &&
    structuredOutput?.interview_prompt_version !== 'comprehensive-v4' &&
    transcript &&
    transcript.length > 0
  ) {
    const patientLines = transcript
      .filter((t) => t.role === 'user')
      .map((t) => `- ${t.text}`)
      .join('\n')
    if (patientLines) {
      parts.push(`What the patient said during the interview:\n${patientLines}`)
    }
  }

  return parts.length > 0
    ? parts.join('\n\n')
    : 'The patient completed a short intake interview but no details were captured. Write a brief, warm note acknowledging they completed the interview and that their neurologist will follow up at the visit.'
}

export async function POST(request: Request) {
  let body: PatientReportRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const narrativeSummary = body.narrativeSummary ?? null
  const structuredOutput = body.structuredOutput ?? null
  const transcript = body.transcript ?? null

  // A failed generator must never cause raw notes/transcript to masquerade as
  // a report. The UI renders an explicit unavailable state instead.
  const fallback = () =>
    NextResponse.json({ patientReport: '', unavailable: true }, { status: 200 })

  // Comprehensive v3 intentionally persists only application-owned ledgers,
  // not a model-authored narrative. Until a separate transcript-citing report
  // artifact exists, do not ask another model to turn those sparse controls
  // into prose or accidentally reintroduce a misheard medication name.
  if (
    structuredOutput?.interview_prompt_version === 'comprehensive-v3' ||
    structuredOutput?.interview_prompt_version === 'comprehensive-v4'
  ) {
    return fallback()
  }

  if (!structuredOutput && !narrativeSummary && !transcript) {
    return fallback()
  }

  try {
    const userContent = buildUserContent(structuredOutput, narrativeSummary, transcript)

    const { text } = await invokeBedrock({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      maxTokens: 600,
      temperature: 0.4,
    })

    const patientReport = text.trim()
    if (!patientReport) return fallback()

    return NextResponse.json({ patientReport })
  } catch (err) {
    console.error('[historian/patient-report] Bedrock error (report unavailable):', err)
    return fallback()
  }
}
