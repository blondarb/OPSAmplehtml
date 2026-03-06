import { NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { from } from '@/lib/db-query'

// POST /api/activity-log — log user activity (fire-and-forget pattern)
export async function POST(request: Request) {
  const user = await getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { action, target, metadata } = await request.json()

    await from('user_activity_log')
      .insert({
        user_id: user.id,
        action: action || '',
        target: target || '',
        metadata: metadata ?? {},
      })

    return NextResponse.json({ success: true })
  } catch {
    // Activity logging is non-critical — always return success
    return NextResponse.json({ success: true })
  }
}
