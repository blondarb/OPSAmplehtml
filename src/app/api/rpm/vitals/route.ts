import { NextRequest, NextResponse } from 'next/server'
import { getMonitorApiKey } from '@/lib/secrets'

const API_BASE = 'https://3eyoktd935.execute-api.us-east-2.amazonaws.com'

export async function GET(request: NextRequest) {
  try {
    const key = await getMonitorApiKey()
    const params = request.nextUrl.searchParams.toString()
    const res = await fetch(`${API_BASE}/vitals?${params}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch vitals'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
