'use client'

import type { WearableAlert, WearableAnomaly } from '@/lib/wearable/types'
import AlertCard from './AlertCard'
import AutoDraftOrderPanel from './AutoDraftOrderPanel'

interface NeurologistViewProps {
  alerts: WearableAlert[]
  anomalies: WearableAnomaly[]
}

const SEVERITY_ORDER: Record<string, number> = {
  urgent: 0,
  attention: 1,
  informational: 2,
}

export default function NeurologistView({ alerts, anomalies }: NeurologistViewProps) {
  const anomalyMap = new Map(anomalies.map((a) => [a.id, a]))

  // Only show alerts escalated to MD or urgent severity
  const filtered = [...alerts]
    .filter((a) => a.escalated_to_md || a.severity === 'urgent')
    .sort((a, b) => {
      const sevDiff = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
      if (sevDiff !== 0) return sevDiff
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  // Find the Day 27 second fall alert: most recent urgent alert with "Fall" in title
  const fallAlert = [...filtered]
    .filter((a) => a.severity === 'urgent' && a.title.toLowerCase().includes('fall'))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Info banner */}
      <div style={{
        background: 'rgba(14, 165, 233, 0.08)',
        border: '1px solid rgba(14, 165, 233, 0.2)',
        borderRadius: '8px',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <span style={{ fontSize: '0.85rem' }}>&#9432;</span>
        <span style={{
          color: '#94a3b8',
          fontSize: '0.8rem',
        }}>
          Showing {filtered.length} alert{filtered.length !== 1 ? 's' : ''} &mdash; urgent or escalated by triage team
        </span>
      </div>

      {/* Auto-draft order for the fall alert */}
      {fallAlert && (
        <AutoDraftOrderPanel
          patientName="Linda Martinez"
          alert={fallAlert}
        />
      )}

      {/* Alert cards */}
      {filtered.length === 0 ? (
        <p style={{
          color: '#64748b',
          fontSize: '0.85rem',
          fontStyle: 'italic',
          margin: 0,
          padding: '20px',
          background: '#1e293b',
          borderRadius: '8px',
          border: '1px solid #334155',
          textAlign: 'center',
        }}>
          No urgent or escalated alerts at this time.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              anomaly={anomalyMap.get(alert.anomaly_id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
