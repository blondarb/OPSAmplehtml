import { NextResponse } from 'next/server'
import { invokeBedrockJSON, BEDROCK_MODEL } from '@/lib/bedrock'
import { parseUploadedFile } from '@/lib/triage/fileParser'
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionUserPrompt } from '@/lib/triage/extractionPrompt'
import { FILE_CONSTRAINTS } from '@/lib/triage/types'
import type { ExtractionKeyFindings } from '@/lib/triage/types'
import { from } from '@/lib/db-query'
import { runInBackground } from '@/lib/triage/asyncRunner'

const EXTRACTION_MODEL = process.env.BEDROCK_EXTRACTION_MODEL || BEDROCK_MODEL

export const maxDuration = 120

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || ''

  let text: string
  let sourceFilename: string | null = null
  let patientAge: number | null = null
  let patientSex: string | null = null

  try {
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 })
      }
      const parsed = await parseUploadedFile(file)
      text = parsed.text
      sourceFilename = parsed.filename ?? null

      const ageField = formData.get('patient_age')
      if (ageField) patientAge = Number(ageField)
      const sexField = formData.get('patient_sex')
      if (sexField) patientSex = String(sexField)
    } else {
      const body = await request.json()
      text = body.text
      patientAge = body.patient_age ?? null
      patientSex = body.patient_sex ?? null

      if (!text || typeof text !== 'string') {
        return NextResponse.json({ error: 'text is required' }, { status: 400 })
      }
      if (text.length > FILE_CONSTRAINTS.MAX_TEXT_LENGTH) {
        text = text.substring(0, FILE_CONSTRAINTS.MAX_TEXT_LENGTH)
      }
    }
  } catch (parseErr) {
    if (parseErr instanceof Error && parseErr.name === 'FileParseError') {
      return NextResponse.json({ error: parseErr.message }, { status: 400 })
    }
    const message = parseErr instanceof Error ? parseErr.message : 'Failed to parse request'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  if (text.trim().length < 50) {
    return NextResponse.json(
      { error: 'Text must be at least 50 characters for meaningful extraction.' },
      { status: 400 },
    )
  }

  const originalTextLength = text.length

  // Insert pending extraction row.
  const { data: inserted, error: insertError } = await from('triage_extractions')
    .insert({
      text_input: text,
      source_filename: sourceFilename,
      patient_age: patientAge,
      patient_sex: patientSex,
      original_text_length: originalTextLength,
      ai_model_used: EXTRACTION_MODEL,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertError || !inserted?.id) {
    console.error('Extract init insert failed:', insertError)
    return NextResponse.json(
      { error: 'Could not start extraction. Please try again.' },
      { status: 500 },
    )
  }

  const extractionId = inserted.id as string

  runInBackground(() =>
    processExtractionInBackground(extractionId, text, {
      patientAge: patientAge ?? undefined,
      patientSex: patientSex ?? undefined,
      sourceFilename: sourceFilename ?? undefined,
    }),
  )

  return NextResponse.json(
    { extraction_id: extractionId, status: 'pending' },
    { status: 202 },
  )
}

async function processExtractionInBackground(
  extractionId: string,
  text: string,
  meta: { patientAge?: number; patientSex?: string; sourceFilename?: string },
): Promise<void> {
  try {
    const userPrompt = buildExtractionUserPrompt(text, meta)

    const result = await invokeBedrockJSON<{
      note_type_detected: string
      extraction_confidence: string
      extracted_summary: string
      key_findings: ExtractionKeyFindings
    }>({
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 4096,
      temperature: 0.2,
      model: EXTRACTION_MODEL,
    })

    const aiResponse = result.parsed
    const toJSON = (v: unknown) => (v != null ? JSON.stringify(v) : null)

    await from('triage_extractions')
      .update({
        note_type_detected: aiResponse.note_type_detected,
        extraction_confidence: aiResponse.extraction_confidence,
        extracted_summary: aiResponse.extracted_summary,
        key_findings: toJSON(aiResponse.key_findings),
        ai_input_tokens: result.inputTokens ?? null,
        ai_output_tokens: result.outputTokens ?? null,
        status: 'complete',
        completed_at: new Date(),
      })
      .eq('id', extractionId)
  } catch (error: unknown) {
    console.error('Background extraction failed:', error)
    let message = 'Extraction failed'
    if (error instanceof Error) {
      const raw = error.message
      if (
        raw.includes('credential') ||
        raw.includes('Could not load') ||
        raw.includes('AWS') ||
        raw.includes('Bedrock')
      ) {
        message =
          'The extraction service is temporarily unavailable. Please try again shortly.'
      } else {
        message = raw
      }
    }
    await markError(extractionId, message)
  }
}

async function markError(extractionId: string, message: string): Promise<void> {
  try {
    await from('triage_extractions')
      .update({
        status: 'error',
        error_message: message,
        completed_at: new Date(),
      })
      .eq('id', extractionId)
  } catch (e) {
    console.error('Failed to mark triage_extractions row as error:', e)
  }
}
