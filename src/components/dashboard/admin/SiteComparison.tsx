'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { DEMO_CLINIC_SITES } from '@/lib/dashboard/demoProviders'

/* ── Local per-site metrics (not in shared data) ────────────────────── */

const SITE_METRICS: { siteId: string; utilization: number; avgWait: number; aiPrepRate: number }[] = [
  { siteId: 'site-riverview', utilization: 91, avgWait: 6, aiPrepRate: 78 },
  { siteId: 'site-lakewood', utilization: 84, avgWait: 10, aiPrepRate: 67 },
  { siteId: 'site-home', utilization: 82, avgWait: 4, aiPrepRate: 60 },
]

/* ── Styles ──────────────────────────────────────────────────────────── */

const cardStyle: React.CSSProperties = {
  background: 'rgba(30, 41, 59, 0.6)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  padding: 20,
}

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  cursor: 'pointer',
  userSelect: 'none',
}

const thStyle: React.CSSProperties = {
  color: '#64748B',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  padding: '8px 12px',
  textAlign: 'left',
}

const thRightStyle: React.CSSProperties = { ...thStyle, textAlign: 'right' }

const tdStyle: React.CSSProperties = {
  color: '#E2E8F0',
  fontSize: 14,
  padding: '10px 12px',
  textAlign: 'left',
}

const tdRightStyle: React.CSSProperties = { ...tdStyle, textAlign: 'right' }

const rowSeparator: React.CSSProperties = {
  borderBottom: '1px solid rgba(255,255,255,0.06)',
}

const totalsTdStyle: React.CSSProperties = {
  ...tdStyle,
  fontWeight: 700,
  color: '#FFFFFF',
}

const totalsTdRightStyle: React.CSSProperties = {
  ...totalsTdStyle,
  textAlign: 'right',
}

/* ── Component ───────────────────────────────────────────────────────── */

export default function SiteComparison() {
  const [expanded, setExpanded] = useState(false)

  // Merge site data with local metrics
  const rows = DEMO_CLINIC_SITES.map((site) => {
    const metrics = SITE_METRICS.find((m) => m.siteId === site.id)
    return {
      name: site.name,
      patients: site.patients_today,
      utilization: metrics?.utilization ?? 0,
      avgWait: metrics?.avgWait ?? 0,
      aiPrepRate: metrics?.aiPrepRate ?? 0,
    }
  })

  // Totals
  const totalPatients = rows.reduce((sum, r) => sum + r.patients, 0)
  const avgUtilization = Math.round(rows.reduce((sum, r) => sum + r.utilization, 0) / rows.length)
  const avgWait = Math.round(rows.reduce((sum, r) => sum + r.avgWait, 0) / rows.length)
  const avgAiPrepRate = Math.round(rows.reduce((sum, r) => sum + r.aiPrepRate, 0) / rows.length)

  const Chevron = expanded ? ChevronUp : ChevronDown

  return (
    <div style={cardStyle}>
      {/* Collapsible header */}
      <div style={headerRowStyle} onClick={() => setExpanded((prev) => !prev)}>
        <span style={{ color: '#F1F5F9', fontSize: 16, fontWeight: 600 }}>
          Site Comparison
        </span>
        <Chevron size={18} color="#94A3B8" />
      </div>

      {/* Table — only when expanded */}
      {expanded && (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginTop: 16,
          }}
        >
          <thead>
            <tr style={rowSeparator}>
              <th style={thStyle}>Site Name</th>
              <th style={thRightStyle}>Patients</th>
              <th style={thRightStyle}>Utilization %</th>
              <th style={thRightStyle}>Avg Wait</th>
              <th style={thRightStyle}>AI Prep Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} style={rowSeparator}>
                <td style={tdStyle}>{row.name}</td>
                <td style={tdRightStyle}>{row.patients}</td>
                <td style={tdRightStyle}>{row.utilization}%</td>
                <td style={tdRightStyle}>{row.avgWait} min</td>
                <td style={tdRightStyle}>{row.aiPrepRate}%</td>
              </tr>
            ))}

            {/* Totals row */}
            <tr>
              <td style={totalsTdStyle}>Total / Avg</td>
              <td style={totalsTdRightStyle}>{totalPatients}</td>
              <td style={totalsTdRightStyle}>{avgUtilization}%</td>
              <td style={totalsTdRightStyle}>{avgWait} min</td>
              <td style={totalsTdRightStyle}>{avgAiPrepRate}%</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}
