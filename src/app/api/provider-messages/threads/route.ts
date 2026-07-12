import { NextResponse } from 'next/server'

const retiredResponse = () => NextResponse.json(
  {
    error: 'Legacy provider messaging API is no longer available',
    reason: 'legacy_provider_messaging_retired',
  },
  {
    status: 410,
    headers: { 'Cache-Control': 'no-store' },
  },
)

export async function GET() {
  return retiredResponse()
}

export async function POST() {
  return retiredResponse()
}
