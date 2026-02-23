'use client'

import type { AnalyticsData } from '@/lib/follow-up/billingTypes'

interface EscalationTableProps {
  escalations: AnalyticsData['recentEscalations']
}

const tierColors: Record<string, string> = {
  urgent: '#DC2626',
  same_day: '#EA580C',
  next_visit: '#EAB308',
  informational: '#16A34A',
}

const tierLabels: Record<string, string> = {
  urgent: 'Urgent',
  same_day: 'Same Day',
  next_visit: 'Next Visit',
  informational: 'Info',
}

export default function EscalationTable({ escalations }: EscalationTableProps) {
  if (escalations.length === 0) {
    return (
      <div style={{ color: '#64748b', textAlign: 'center', padding: '24px', fontSize: '0.875rem' }}>
        No escalations in this period
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #334155' }}>
            {['Patient', 'Tier', 'Category', 'Date', 'Acknowledged'].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  color: '#94a3b8',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {escalations.map((esc, i) => (
            <tr
              key={esc.id}
              style={{
                borderBottom: '1px solid #1e293b',
                background: i % 2 === 0 ? 'transparent' : 'rgba(30,41,59,0.5)',
              }}
            >
              <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>{esc.patientName}</td>
              <td style={{ padding: '10px 12px' }}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#fff',
                    background: tierColors[esc.tier] || '#64748b',
                  }}
                >
                  {tierLabels[esc.tier] || esc.tier}
                </span>
              </td>
              <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{esc.category}</td>
              <td style={{ padding: '10px 12px', color: '#94a3b8' }}>
                {new Date(esc.date).toLocaleDateString()}
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                {esc.acknowledged ? (
                  <span style={{ color: '#16A34A' }}>✓</span>
                ) : (
                  <span style={{ color: '#DC2626' }}>✗</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
