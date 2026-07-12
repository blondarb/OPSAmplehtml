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
 * Fail-open: any error here falls back to returning the raw
 * `narrativeSummary` with a 200, so the report page can never show a blank
 * or crashed Patient Report tab.
 */

import { NextResponse } from 'next/server'
import { invokeBedrock } from '@/lib/bedrock'
import type { HistorianStructuredOutput, HistorianTranscriptEntry } from '@/lib/historianTypes'
import { authorizeClinicalOrPatientAccess } from '@/lib/patientAccess/routeAuthorization'

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

Output ONLY the recap text. No preamble, no markdown formatting, no "Here is your summary:" — just the recap itself.`

interface PatientReportRequestBody {
  structuredOutput?: HistorianStructuredOutput | null
  narrativeSummary?: string | null
  transcript?: HistorianTranscriptEntry[] | null
  tenant_id?: unknown
  patient_id?: unknown
  consult_id?: unknown
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

  // Only fall back to the raw transcript if we have nothing else to work
  // from — keeps the prompt small in the common case.
  if (parts.length === 0 && transcript && transcript.length > 0) {
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
  const access = await authorizeClinicalOrPatientAccess({
    clinicalAction: 'historian.patient_report',
    clinicalRoles: ['clinician', 'admin'],
    patientScopes: ['patient:historian:report'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: 'Access denied', reason: access.reason },
      { status: access.status },
    )
  }

  let body: PatientReportRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  if (
    access.principal === 'patient' &&
    ((body.tenant_id !== undefined &&
      body.tenant_id !== access.context.tenantId) ||
      (body.patient_id !== undefined &&
        body.patient_id !== access.context.patientId) ||
      (body.consult_id !== undefined &&
        body.consult_id !== (access.context.consultId ?? null)))
  ) {
    return NextResponse.json(
      { error: 'Access denied', reason: 'binding_mismatch' },
      { status: 403 },
    )
  }

  const narrativeSummary = body.narrativeSummary ?? null
  const structuredOutput = body.structuredOutput ?? null
  const transcript = body.transcript ?? null

  const structuredLength = structuredOutput
    ? JSON.stringify(structuredOutput).length
    : 0
  const transcriptLength = Array.isArray(transcript)
    ? transcript.reduce(
        (total, entry) =>
          total + (typeof entry?.text === 'string' ? entry.text.length : 0),
        0,
      )
    : 0
  if (
    (narrativeSummary?.length ?? 0) > 20_000 ||
    structuredLength > 40_000 ||
    (Array.isArray(transcript) && transcript.length > 500) ||
    transcriptLength > 50_000
  ) {
    return NextResponse.json(
      { error: 'Patient report input exceeds the verified limit' },
      { status: 413 },
    )
  }

  // Fail-open fallback — used for both "nothing to generate from" and any
  // Bedrock error below. The UI must never show a blank or crashed tab.
  const fallback = () =>
    NextResponse.json({ patientReport: narrativeSummary ?? '' }, { status: 200 })

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
    console.error('[historian/patient-report] Bedrock error (fail-open to narrative):', err)
    return fallback()
  }
}
