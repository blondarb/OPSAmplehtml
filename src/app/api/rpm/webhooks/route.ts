import { NextRequest, NextResponse } from 'next/server'
import { getMonitorApiKey } from '@/lib/secrets'

const API_BASE = 'https://3eyoktd935.execute-api.us-east-2.amazonaws.com'

export async function POST(request: NextRequest) {
  try {
    const key = await getMonitorApiKey()
    const body = await request.json()
    const res = await fetch(`${API_BASE}/webhooks/subscribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to subscribe webhook'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const key = await getMonitorApiKey()
    const body = await request.json()
    const res = await fetch(`${API_BASE}/webhooks/subscribe`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to unsubscribe webhook'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
