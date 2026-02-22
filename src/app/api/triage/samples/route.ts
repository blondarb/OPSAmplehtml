import { NextResponse } from 'next/server'
import { SAMPLE_NOTES } from '@/lib/triage/sampleNotes'

export async function GET() {
  return NextResponse.json({ samples: SAMPLE_NOTES })
}
