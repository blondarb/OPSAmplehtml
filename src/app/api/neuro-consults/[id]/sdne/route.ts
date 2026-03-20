/**
 * POST /api/neuro-consults/[id]/sdne
 *
 * Links a completed SDNE session to a consult record.
 * Advances pipeline status to 'sdne_complete'.
 *
 * GET /api/neuro-consults/[id]/sdne
 *
 * Returns SDNE data linked to this consult.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getConsult } from '@/lib/consult/pipeline'
import { linkSDNEToConsult, markSDNERequested } from '@/lib/consult/pipeline'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const body = await req.json()
    const { action } = body

    // Action: request — mark consult as awaiting SDNE exam
    if (action === 'request') {
      const ok = await markSDNERequested(id)
      if (!ok) {
        return NextResponse.json(
          { error: 'Failed to mark SDNE as requested' },
          { status: 500 },
        )
      }
      return NextResponse.json({ success: true, status: 'sdne_pending' })
    }

    // Action: link — attach completed SDNE results
    const {
      sdne_session_id,
      session_flag,
      domain_flags,
      detected_patterns,
    } = body

    if (!sdne_session_id || !session_flag || !domain_flags) {
      return NextResponse.json(
        { error: 'sdne_session_id, session_flag, and domain_flags are required' },
        { status: 400 },
      )
    }

    const ok = await linkSDNEToConsult(
      id,
      sdne_session_id,
      session_flag,
      domain_flags,
      detected_patterns || [],
    )

    if (!ok) {
      return NextResponse.json(
        { error: 'Failed to link SDNE session to consult' },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, status: 'sdne_complete' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[sdne] POST error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const consult = await getConsult(id)
    if (!consult) {
      return NextResponse.json({ error: 'Consult not found' }, { status: 404 })
    }

    return NextResponse.json({
      sdne_session_id: consult.sdne_session_id,
      sdne_session_flag: consult.sdne_session_flag,
      sdne_domain_flags: consult.sdne_domain_flags,
      sdne_detected_patterns: consult.sdne_detected_patterns,
      sdne_completed_at: consult.sdne_completed_at,
      has_sdne: !!consult.sdne_session_id,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[sdne] GET error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
