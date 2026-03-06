import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { DEMO_ACTIONS, buildBatchGroups } from '@/lib/command-center/demoActions'
import type {
  ActionsResponse,
  ViewMode,
  TimeRange,
} from '@/lib/command-center/types'

// ── GET /api/command-center/actions ──

export async function GET(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Read optional query params (reserved for future filtering)
    const { searchParams } = new URL(request.url)
    const _viewMode = (searchParams.get('view_mode') || 'my_patients') as ViewMode
    const _timeRange = (searchParams.get('time_range') || 'today') as TimeRange

    // Return all demo actions sorted newest-first
    const sortedActions = [...DEMO_ACTIONS].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    const batchGroups = buildBatchGroups(DEMO_ACTIONS)

    const response: ActionsResponse = {
      actions: sortedActions,
      batch_groups: batchGroups,
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error('Command Center Actions Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to load actions' },
      { status: 500 }
    )
  }
}
