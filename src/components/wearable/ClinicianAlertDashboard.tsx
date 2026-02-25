'use client'

import { useState } from 'react'
import type { WearableAlert, WearableAnomaly, DashboardView } from '@/lib/wearable/types'
import TriageTeamView from './TriageTeamView'
import NeurologistView from './NeurologistView'

interface ClinicianAlertDashboardProps {
  alerts: WearableAlert[]
  anomalies: WearableAnomaly[]
}

export default function ClinicianAlertDashboard({ alerts, anomalies }: ClinicianAlertDashboardProps) {
  const [activeView, setActiveView] = useState<DashboardView>('triage_team')

  if (!alerts || alerts.length === 0) {
    return (
      <div style={{
        background: '#0f172a',
        borderRadius: '12px',
        border: '1px solid #334155',
        padding: '24px',
      }}>
        <h2 style={{
          color: '#f1f5f9',
          fontSize: '1.15rem',
          fontWeight: 700,
          margin: '0 0 16px',
        }}>
          Clinician Alert Dashboard
        </h2>
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '48px 24px',
          textAlign: 'center',
        }}>
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
            No data yet — sync from the Sevaro Monitor app to see results here.
          </p>
        </div>
      </div>
    )
  }

  const totalAlerts = alerts.length
  const urgentCount = alerts.filter((a) => a.severity === 'urgent').length
  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length

  const tabs: { key: DashboardView; label: string }[] = [
    { key: 'triage_team', label: 'Triage Team' },
    { key: 'neurologist', label: 'Neurologist' },
  ]

  return (
    <div style={{
      background: '#0f172a',
      borderRadius: '12px',
      border: '1px solid #334155',
      padding: '24px',
    }}>
      {/* Section Header */}
      <h2 style={{
        color: '#f1f5f9',
        fontSize: '1.15rem',
        fontWeight: 700,
        margin: '0 0 16px',
      }}>
        Clinician Alert Dashboard
      </h2>

      {/* Tab toggle */}
      <div style={{
        display: 'flex',
        gap: '0',
        marginBottom: '16px',
        background: '#1e293b',
        borderRadius: '9999px',
        padding: '3px',
        width: 'fit-content',
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveView(tab.key)}
            style={{
              background: activeView === tab.key ? '#0EA5E9' : 'transparent',
              color: activeView === tab.key ? '#fff' : '#94a3b8',
              border: 'none',
              borderRadius: '9999px',
              padding: '8px 20px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Summary stats bar */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '20px',
        flexWrap: 'wrap',
      }}>
        {/* Total */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <span style={{
            color: '#94a3b8',
            fontSize: '0.8rem',
          }}>
            Total Alerts:
          </span>
          <span style={{
            color: '#f1f5f9',
            fontSize: '0.85rem',
            fontWeight: 700,
          }}>
            {totalAlerts}
          </span>
        </div>

        {/* Urgent */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <span style={{
            color: '#94a3b8',
            fontSize: '0.8rem',
          }}>
            Urgent:
          </span>
          <span style={{
            background: '#DC2626',
            color: '#fff',
            fontSize: '0.72rem',
            fontWeight: 700,
            padding: '1px 8px',
            borderRadius: '9999px',
          }}>
            {urgentCount}
          </span>
        </div>

        {/* Unacknowledged */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <span style={{
            color: '#94a3b8',
            fontSize: '0.8rem',
          }}>
            Unacknowledged:
          </span>
          <span style={{
            background: '#D97706',
            color: '#fff',
            fontSize: '0.72rem',
            fontWeight: 700,
            padding: '1px 8px',
            borderRadius: '9999px',
          }}>
            {unacknowledgedCount}
          </span>
        </div>
      </div>

      {/* Active view */}
      {activeView === 'triage_team' ? (
        <TriageTeamView alerts={alerts} anomalies={anomalies} />
      ) : (
        <NeurologistView alerts={alerts} anomalies={anomalies} />
      )}
    </div>
  )
}
