'use client'

import StatusTile from '@/components/command-center/StatusTile'
import { DEMO_PRACTICE_METRICS } from '@/lib/dashboard/demoMetrics'

/**
 * ClinicPulse — Practice Manager top metrics bar
 *
 * Horizontal row of 5 KPI tiles showing practice-wide metrics:
 * Patients Today, Utilization %, Avg Wait Time, No-Shows, AI Prep Rate.
 * Reads static demo data from DEMO_PRACTICE_METRICS.
 */
export default function ClinicPulse() {
  const m = DEMO_PRACTICE_METRICS

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
      }}
    >
      <StatusTile
        label="Patients Today"
        total={m.patients_today.total}
        sublabel={`${m.patients_today.seen} seen, ${m.patients_today.remaining} remaining`}
        color="#3B82F6"
      />
      <StatusTile
        label="Utilization"
        total={m.utilization.value}
        sublabel={`\u2191 ${m.utilization.trend}% vs last week`}
        color="#22C55E"
        trend="up"
      />
      <StatusTile
        label="Avg Wait Time"
        total={m.avg_wait_time.minutes}
        sublabel={`\u2193 ${Math.abs(m.avg_wait_time.trend)} min improved`}
        color="#F59E0B"
        trend="down"
      />
      <StatusTile
        label="No-Shows"
        total={m.no_shows.count}
        sublabel={`${m.no_shows.rate}% rate`}
        color="#EF4444"
      />
      <StatusTile
        label="AI Prep Rate"
        total={m.ai_prep_rate.value}
        sublabel={`\u2191 ${m.ai_prep_rate.trend}% vs last week`}
        color="#8B5CF6"
        trend="up"
      />
    </div>
  )
}
