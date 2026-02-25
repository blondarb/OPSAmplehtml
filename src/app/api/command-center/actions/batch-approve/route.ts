import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DEMO_ACTIONS } from '../route'

// POST /api/command-center/actions/batch-approve — Approve multiple actions at once

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action_ids } = body

    if (!Array.isArray(action_ids) || action_ids.length === 0) {
      return NextResponse.json(
        { error: 'action_ids must be a non-empty array' },
        { status: 400 }
      )
    }

    let approvedCount = 0

    for (const actionId of action_ids) {
      const action = DEMO_ACTIONS.find((a) => a.id === actionId)
      if (action && action.status === 'pending') {
        action.status = 'approved'
        approvedCount++
      }
    }

    if (approvedCount === 0) {
      return NextResponse.json(
        { error: 'No pending actions found for the provided IDs' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      approved_count: approvedCount,
    })
  } catch (error: any) {
    console.error('Command Center Batch Approve Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to batch approve actions' },
      { status: 500 }
    )
  }
}
