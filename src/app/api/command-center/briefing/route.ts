import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { DEMO_BRIEFING } from '@/lib/command-center/briefingPrompt'


// ─── POST /api/command-center/briefing ──────────────────────────────────────
// Returns an AI-generated morning briefing for the physician's command center.
//
// Request body (JSON):
//   physician_id — string | null  (null = current user)
//   view_mode    — 'my_patients' | 'all_patients'
//   time_range   — 'today' | 'yesterday' | 'last_7_days'
//
// Query params:
//   regenerate — if present, skip cache and force a fresh generation
//
// Response: BriefingResponse  (see src/lib/command-center/types.ts)

export async function POST(request: NextRequest) {
  try {
    // ── Auth check ──────────────────────────────────────────────────────────
    const user = await getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Parse request body ──────────────────────────────────────────────────
    const body = await request.json()
    const {
      physician_id = null,
      view_mode = 'my_patients',
      time_range = 'today',
    } = body as {
      physician_id?: string | null
      view_mode?: string
      time_range?: string
    }

    const { searchParams } = new URL(request.url)
    const regenerate = searchParams.has('regenerate')

    // ── Demo mode: return hardcoded briefing immediately ────────────────────
    // The demo briefing is returned for all requests until the production
    // pipeline below is implemented.

    const briefing = {
      ...DEMO_BRIEFING,
      generated_at: new Date().toISOString(),
    }

    return NextResponse.json(briefing)

    // ── TODO: Production flow ───────────────────────────────────────────────
    //
    // 1. Build data snapshot by querying Supabase (scoped by physician_id,
    //    view_mode, and time_range):
    //      - visits:             scheduled for today
    //      - patient_messages:   unread inbound messages
    //      - wearable_alerts:    unacknowledged alerts
    //      - followup_sessions:  escalations needing review
    //      - triage_sessions:    pending AI triage reviews
    //      - patient_medications: refills coming due
    //      - imaging_studies:    results awaiting sign-off
    //
    // 2. Check command_center_briefings table for a cached briefing that is
    //    less than 1 hour old (unless `regenerate` query param is set).
    //
    // 3. Call Bedrock Claude with the system prompt + data snapshot:
    //
    //    import { invokeBedrockJSON } from '@/lib/bedrock'
    //    import { BRIEFING_SYSTEM_PROMPT } from '@/lib/command-center/briefingPrompt'
    //
    //    const { parsed } = await invokeBedrockJSON({
    //      system: BRIEFING_SYSTEM_PROMPT,
    //      messages: [{ role: 'user', content: JSON.stringify(dataSnapshot) }],
    //      maxTokens: 1000,
    //    })
    //
    // 4. Cache the new briefing in command_center_briefings:
    //
    //    await from('command_center_briefings').insert({
    //      physician_id: physician_id || user.id,
    //      narrative: parsed.narrative,
    //      reasoning: parsed.reasoning,
    //      urgent_count: parsed.urgent_count,
    //      view_mode,
    //      time_range,
    //      generated_at: new Date().toISOString(),
    //    })
    //
    // 5. Return the generated briefing.
    //
    // ─────────────────────────────────────────────────────────────────────────
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate briefing'
    console.error('Command Center Briefing Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
