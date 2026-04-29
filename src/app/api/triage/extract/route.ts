import { NextResponse } from 'next/server'
import { invokeBedrockJSONStreaming } from '@/lib/bedrock'
import { parseUploadedFile } from '@/lib/triage/fileParser'
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionUserPrompt } from '@/lib/triage/extractionPrompt'
import { FILE_CONSTRAINTS } from '@/lib/triage/types'
import type { ClinicalExtraction, ExtractionKeyFindings } from '@/lib/triage/types'

// Streaming response avoids the ~28s Amplify Hosting Compute / CloudFront
// gateway timeout. Long PDFs with maxTokens 4096 frequently exceed it.
export const maxDuration = 120

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || ''

  let text: string
  let sourceFilename: string | undefined
  let patientAge: number | undefined
  let patientSex: string | undefined

  try {
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 })
      }
      const parsed = await parseUploadedFile(file)
      text = parsed.text
      sourceFilename = parsed.filename

      const ageField = formData.get('patient_age')
      if (ageField) patientAge = Number(ageField)
      const sexField = formData.get('patient_sex')
      if (sexField) patientSex = String(sexField)
    } else {
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

  const userPrompt = buildExtractionUserPrompt(text, {
    patientAge,
    patientSex,
    sourceFilename,
  })
  const originalTextLength = text.length

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      let closed = false

      const sendEvent = (event: string, data: unknown) => {
        if (closed) return
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      const sendComment = (msg: string) => {
        if (closed) return
        controller.enqueue(encoder.encode(`: ${msg}\n\n`))
      }

      const heartbeat = setInterval(() => sendComment(`hb ${Date.now()}`), 5000)

      const bedrockAbort = new AbortController()
      const onClientAbort = () => bedrockAbort.abort()
      request.signal.addEventListener('abort', onClientAbort)

      try {
        sendEvent('progress', { stage: 'started' })

        const result = await invokeBedrockJSONStreaming<{
          note_type_detected: string
          extraction_confidence: string
          extracted_summary: string
          key_findings: ExtractionKeyFindings
        }>({
          system: EXTRACTION_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
          maxTokens: 4096,
          temperature: 0.2,
          signal: bedrockAbort.signal,
        })
        const aiResponse = result.parsed

        const extraction: ClinicalExtraction = {
          extraction_id: crypto.randomUUID(),
          note_type_detected: aiResponse.note_type_detected as ClinicalExtraction['note_type_detected'],
          extraction_confidence: aiResponse.extraction_confidence as ClinicalExtraction['extraction_confidence'],
          extracted_summary: aiResponse.extracted_summary,
          key_findings: aiResponse.key_findings,
          original_text_length: originalTextLength,
          source_filename: sourceFilename,
        }

        sendEvent('result', extraction)
      } catch (error: unknown) {
        console.error('Extraction API Error:', error)

        let message = 'An error occurred during extraction'
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            message = 'Extraction was cancelled.'
          } else {
            message = error.message
          }
        }
        sendEvent('error', { error: message })
      } finally {
        clearInterval(heartbeat)
        request.signal.removeEventListener('abort', onClientAbort)
        closed = true
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
