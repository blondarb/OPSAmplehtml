'use client'

import type { ClinicalAlert } from '@/lib/rpm/types'
import { SEVERITY_COLORS, DEVICE_LABELS } from '@/lib/rpm/types'
import { AlertTriangle, AlertCircle, Info } from 'lucide-react'

interface Props {
  alerts: ClinicalAlert[]
}

const SEVERITY_ICONS = {
  critical: AlertTriangle,
  warning: AlertCircle,
  informational: Info,
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function alertLabel(alert: ClinicalAlert): string {
  const type = alert.anomaly_type || ''
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

export default function ClinicalAlertsFeed({ alerts }: Props) {
  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9', margin: 0 }}>Clinical Alerts</h3>
        {alerts.length > 0 && (
          <span style={{
            fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '9999px',
            background: alerts.some(a => a.severity === 'critical') ? '#7F1D1D' : '#1E3A5F',
            color: alerts.some(a => a.severity === 'critical') ? '#FCA5A5' : '#93C5FD',
          }}>
            {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {alerts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b' }}>
          <Info size={24} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
          <p style={{ fontSize: '13px', margin: 0 }}>No clinical alerts</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
          {alerts.map(alert => {
            const Icon = SEVERITY_ICONS[alert.severity as keyof typeof SEVERITY_ICONS] || Info
            const color = SEVERITY_COLORS[alert.severity] || '#3B82F6'

            return (
              <div key={alert.id} style={{
                display: 'flex', gap: '10px', background: '#0f172a', borderRadius: '8px', padding: '10px',
                borderLeft: `3px solid ${color}`,
              }}>
                <Icon size={16} color={color} style={{ marginTop: '2px', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#f1f5f9' }}>
                      {alertLabel(alert)}
                    </span>
                    <span style={{
                      fontSize: '10px', fontWeight: 500, padding: '1px 6px', borderRadius: '9999px',
                      background: `${color}20`, color,
                    }}>
                      {alert.severity}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    {alert.clinical_significance || JSON.stringify(alert.trigger_data || {}).slice(0, 80)}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '10px', color: '#64748b' }}>
                    <span>{timeAgo(alert.detected_at)}</span>
                    <span>{DEVICE_LABELS[alert.source_device] || alert.source_device}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
