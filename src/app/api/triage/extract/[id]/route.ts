import { NextResponse } from 'next/server'
import { from } from '@/lib/db-query'
import type { ClinicalExtraction } from '@/lib/triage/types'

// Poll endpoint for the async extraction flow. POST /api/triage/extract
// returns 202 + extraction_id; the client polls here until terminal status.
export const dynamic = 'force-dynamic'

function parseJSON(value: unknown) {
  if (value == null) return null
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params

  const { data, error } = await from('triage_extractions')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'Extraction not found' },
      { status: 404 },
    )
  }

  const status = (data.status as string | undefined) ?? 'complete'

  if (status === 'pending') {
    return NextResponse.json({ extraction_id: id, status: 'pending' })
  }

  if (status === 'error') {
    return NextResponse.json({
      extraction_id: id,
      status: 'error',
      error: data.error_message || 'Extraction failed',
    })
  }

  // status === 'complete' — return the same shape the synchronous POST returned.
  const extraction: ClinicalExtraction & { status: 'complete'; extraction_id: string } = {
    extraction_id: id,
    status: 'complete',
    note_type_detected: data.note_type_detected as ClinicalExtraction['note_type_detected'],
    extraction_confidence: data.extraction_confidence as ClinicalExtraction['extraction_confidence'],
    extracted_summary: data.extracted_summary,
    key_findings: parseJSON(data.key_findings),
    original_text_length: data.original_text_length,
    source_filename: data.source_filename ?? undefined,
  }

  return NextResponse.json(extraction)
}
