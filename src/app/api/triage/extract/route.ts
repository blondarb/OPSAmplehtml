import { NextResponse } from 'next/server'
import { invokeBedrockJSON } from '@/lib/bedrock'
import { getUser } from '@/lib/cognito/server'
import { parseUploadedFile } from '@/lib/triage/fileParser'
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionUserPrompt } from '@/lib/triage/extractionPrompt'
import { FILE_CONSTRAINTS } from '@/lib/triage/types'
import type { ClinicalExtraction, ExtractionKeyFindings } from '@/lib/triage/types'


export const maxDuration = 60

export async function POST(request: Request) {
  try {
    // Determine input type from Content-Type header
    const contentType = request.headers.get('content-type') || ''

    let text: string
    let sourceFilename: string | undefined
    let patientAge: number | undefined
    let patientSex: string | undefined

    if (contentType.includes('multipart/form-data')) {
      // File upload
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 })
      }
      const parsed = await parseUploadedFile(file)
      text = parsed.text
      sourceFilename = parsed.filename

      // Optional metadata from form fields
      const ageField = formData.get('patient_age')
      if (ageField) patientAge = Number(ageField)
      const sexField = formData.get('patient_sex')
      if (sexField) patientSex = String(sexField)
    } else {
      // JSON body
      const body = await request.json()
      text = body.text
      patientAge = body.patient_age
      patientSex = body.patient_sex

      if (!text || typeof text !== 'string') {
        return NextResponse.json({ error: 'text is required' }, { status: 400 })
      }

      if (text.length > FILE_CONSTRAINTS.MAX_TEXT_LENGTH) {
        text = text.substring(0, FILE_CONSTRAINTS.MAX_TEXT_LENGTH)
      }
    }

    if (text.trim().length < 50) {
      return NextResponse.json(
        { error: 'Text must be at least 50 characters for meaningful extraction.' },
        { status: 400 }
      )
    }

    const userPrompt = buildExtractionUserPrompt(text, {
      patientAge,
      patientSex,
      sourceFilename,
    })

    // Call Bedrock with 30-second timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    let aiResponse: {
      note_type_detected: string
      extraction_confidence: string
      extracted_summary: string
      key_findings: ExtractionKeyFindings
    }
    try {
      const result = await invokeBedrockJSON<typeof aiResponse>({
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 3000,
        temperature: 0.2,
        signal: controller.signal,
      })
      aiResponse = result.parsed
    } catch (parseErr) {
      if (parseErr instanceof Error && parseErr.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Extraction is taking longer than expected. Please try again.' },
          { status: 504 }
        )
      }
      console.error('Failed to parse extraction response:', parseErr)
      return NextResponse.json(
        { error: 'The extraction system returned an invalid response. Please try again.' },
        { status: 500 }
      )
    } finally {
      clearTimeout(timeout)
    }

    const extraction: ClinicalExtraction = {
      extraction_id: crypto.randomUUID(),
      note_type_detected: aiResponse.note_type_detected as ClinicalExtraction['note_type_detected'],
      extraction_confidence: aiResponse.extraction_confidence as ClinicalExtraction['extraction_confidence'],
      extracted_summary: aiResponse.extracted_summary,
      key_findings: aiResponse.key_findings,
      original_text_length: text.length,
      source_filename: sourceFilename,
    }

    return NextResponse.json(extraction)
  } catch (error: unknown) {
    console.error('Extraction API Error:', error)

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Extraction is taking longer than expected. Please try again.' },
        { status: 504 }
      )
    }

    // Handle file parse errors specifically
    if (error instanceof Error && error.name === 'FileParseError') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const message = error instanceof Error ? error.message : 'An error occurred during extraction'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
