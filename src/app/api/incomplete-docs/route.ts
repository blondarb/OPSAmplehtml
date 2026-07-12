import { NextResponse } from 'next/server'

// The unauthenticated legacy scan has been retired; no data is read or emitted.
export async function GET() {
  return NextResponse.json(
    {
      error: 'Legacy incomplete documentation scan is no longer available',
      reason: 'legacy_incomplete_docs_retired',
    },
    {
      status: 410,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
