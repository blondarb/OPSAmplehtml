import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { getPool } from '@/lib/db'

// ─── Demo metrics ───────────────────────────────────────────────────────────
// Hardcoded aggregate counts used as the primary data source for the prototype.
// Each key maps to one of the 8 status-bar tiles in the Clinical Cockpit.

const DEMO_METRICS = {
  schedule: {
    total: 9,
    sublabel: '2 new, 1 cancelled',
    new: 2,
    cancelled: 1,
    trend: 'flat' as const,
  },
  messages: {
    total: 4,
    sublabel: '1 urgent, 2 days old',
    urgent: 1,
    oldest_days: 2,
    trend: 'up' as const,
  },
  refills: {
    total: 3,
    sublabel: '1 overdue',
    overdue: 1,
    trend: 'flat' as const,
  },
  results: {
    total: 2,
    sublabel: '1 MRI > 14 days',
    oldest_days: 18,
    trend: 'down' as const,
  },
  wearables: {
    total: 5,
    sublabel: '2 urgent',
    urgent: 2,
    trend: 'up' as const,
  },
  followups: {
    total: 3,
    sublabel: '1 same-day',
    same_day: 1,
    trend: 'flat' as const,
  },
  triage: {
    total: 8,
    sublabel: '2 emergent',
    emergent: 2,
    trend: 'down' as const,
  },
  ehr: {
    total: 6,
    sublabel: '3 results to sign',
    results_to_sign: 3,
    trend: 'flat' as const,
  },
}

// ─── GET /api/command-center/metrics ─────────────────────────────────────────
// Returns aggregate counts for the 8 status-bar tiles in the Clinical Cockpit.
//
// Query params:
//   view_mode  — 'my_patients' (default) | 'department' | 'all'
//   time_range — 'today' (default) | 'week' | 'month'

export async function GET(request: NextRequest) {
  try {
    const user = await getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const viewMode = searchParams.get('view_mode') || 'my_patients'
    const timeRange = searchParams.get('time_range') || 'today'

    // TODO: Replace remaining demo data with live RDS queries per data source.
    //
    // Future query targets (all scoped by viewMode / timeRange):
    //   schedule   — visits WHERE visit_date = today
    //   messages   — patient_messages WHERE is_read = false AND direction = 'inbound'
    //   refills    — patient_medications WHERE refill approaching
    //   results    — imaging_studies WHERE ordered but no impression
    //   followups  — followup_sessions WHERE escalation_level IN ('same_day','urgent')
    //   triage     — triage_sessions WHERE status = 'pending_review'
    //   ehr        — always demo data (simulated EHR integration)

    const metrics = { ...DEMO_METRICS }

    // Wire wearable_alerts to real data from the notifications table
    try {
      const pool = await getPool()
      const { rows } = await pool.query(
        `SELECT
           COUNT(*)::int AS count,
           COUNT(*) FILTER (WHERE priority IN ('critical', 'high'))::int AS urgent
         FROM notifications
         WHERE source_type = 'wearable_alert' AND status = 'unread'`
      )
      const total = rows[0]?.count ?? 0
      const urgent = rows[0]?.urgent ?? 0
      if (total > 0) {
        metrics.wearables = {
          total,
          sublabel: urgent > 0 ? `${urgent} urgent` : `${total} alert${total === 1 ? '' : 's'}`,
          urgent,
          trend: 'up' as const,
        }
      }
    } catch (err) {
      // Non-fatal: fall back to demo wearable metrics
      console.warn('Command Center wearable alerts query failed:', (err as Error).message)
    }

    return NextResponse.json(metrics)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch metrics'
    console.error('Command Center Metrics Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
