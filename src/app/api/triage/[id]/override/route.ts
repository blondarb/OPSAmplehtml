import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { from } from '@/lib/db-query'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { new_tier, override_reason } = await request.json()

    if (!new_tier || !override_reason) {
      return NextResponse.json(
        { error: 'new_tier and override_reason are required' },
        { status: 400 }
      )
    }

    const validTiers = [
      'emergent', 'urgent', 'semi_urgent', 'routine_priority',
      'routine', 'non_urgent', 'insufficient_data',
    ]

    if (!validTiers.includes(new_tier)) {
      return NextResponse.json(
        { error: `Invalid tier. Must be one of: ${validTiers.join(', ')}` },
        { status: 400 }
      )
    }


    const { data, error } = await from('triage_sessions')
      .update({
        physician_override_tier: new_tier,
        physician_override_reason: override_reason,
        status: 'overridden',
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Override update error:', error)
      return NextResponse.json(
        { error: 'Failed to save override' },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (error: unknown) {
    console.error('Override API Error:', error)
    const message = error instanceof Error ? error.message : 'An error occurred'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
