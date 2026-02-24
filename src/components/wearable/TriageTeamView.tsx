'use client'

import type { WearableAlert, WearableAnomaly } from '@/lib/wearable/types'
import AlertCard from './AlertCard'

interface TriageTeamViewProps {
  alerts: WearableAlert[]
  anomalies: WearableAnomaly[]
}

const SEVERITY_ORDER: Record<string, number> = {
  urgent: 0,
  attention: 1,
  informational: 2,
}

function sortAlerts(alerts: WearableAlert[]): WearableAlert[] {
  return [...alerts].sort((a, b) => {
    const sevDiff = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
    if (sevDiff !== 0) return sevDiff
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

export default function TriageTeamView({ alerts, anomalies }: TriageTeamViewProps) {
  const anomalyMap = new Map(anomalies.map((a) => [a.id, a]))

  const needsReview = sortAlerts(alerts.filter((a) => !a.acknowledged))
  const reviewed = sortAlerts(alerts.filter((a) => a.acknowledged))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Needs Review section */}
      <div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '12px',
        }}>
          <h3 style={{
            color: '#f1f5f9',
            fontSize: '0.95rem',
            fontWeight: 700,
            margin: 0,
          }}>
            Needs Review
          </h3>
          <span style={{
            background: '#DC2626',
            color: '#fff',
            fontSize: '0.7rem',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '9999px',
            minWidth: '20px',
            textAlign: 'center',
          }}>
            {needsReview.length}
          </span>
        </div>

        {needsReview.length === 0 ? (
          <p style={{
            color: '#64748b',
            fontSize: '0.82rem',
            fontStyle: 'italic',
            margin: 0,
            padding: '12px',
            background: '#1e293b',
            borderRadius: '8px',
            border: '1px solid #334155',
          }}>
            All alerts have been reviewed.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {needsReview.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                anomaly={anomalyMap.get(alert.anomaly_id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Reviewed section */}
      <div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '12px',
        }}>
          <h3 style={{
            color: '#94a3b8',
            fontSize: '0.95rem',
            fontWeight: 700,
            margin: 0,
          }}>
            Reviewed
          </h3>
          <span style={{
            background: '#334155',
            color: '#94a3b8',
            fontSize: '0.7rem',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '9999px',
            minWidth: '20px',
            textAlign: 'center',
          }}>
            {reviewed.length}
          </span>
        </div>

        {reviewed.length === 0 ? (
          <p style={{
            color: '#64748b',
            fontSize: '0.82rem',
            fontStyle: 'italic',
            margin: 0,
            padding: '12px',
            background: '#1e293b',
            borderRadius: '8px',
            border: '1px solid #334155',
          }}>
            No reviewed alerts yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {reviewed.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                anomaly={anomalyMap.get(alert.anomaly_id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
