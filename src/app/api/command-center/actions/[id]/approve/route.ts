import { NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { DEMO_ACTIONS } from '@/lib/command-center/demoActions'

// POST /api/command-center/actions/[id]/approve — Approve a single action

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Find the action in demo data
    const action = DEMO_ACTIONS.find((a) => a.id === id)

    if (!action) {
      return NextResponse.json(
        { error: `Action ${id} not found` },
        { status: 404 }
      )
    }

    if (action.status !== 'pending') {
      return NextResponse.json(
        { error: `Action ${id} is already ${action.status}` },
        { status: 409 }
      )
    }

    // Mutate the in-memory demo action
    action.status = 'approved'
    const approvedAt = new Date().toISOString()

    return NextResponse.json({
      success: true,
      action: {
        ...action,
        approved_at: approvedAt,
      },
    })
  } catch (error: any) {
    console.error('Command Center Approve Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to approve action' },
      { status: 500 }
    )
  }
}
