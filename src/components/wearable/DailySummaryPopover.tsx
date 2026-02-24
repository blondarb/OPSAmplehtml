'use client'

import type { DailySummary } from '@/lib/wearable/types'
import { STATUS_DISPLAY } from '@/lib/wearable/types'

interface DailySummaryPopoverProps {
  summary: DailySummary
  onClose: () => void
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

interface MetricCardProps {
  label: string
  value: string | number
  unit?: string
  subLabel?: string
  subValue?: string | number
  subUnit?: string
}

function MetricCard({ label, value, unit, subLabel, subValue, subUnit }: MetricCardProps) {
  return (
    <div style={{
      padding: '12px',
      background: '#0f172a',
      border: '1px solid #334155',
      borderRadius: '8px',
    }}>
      <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </p>
      <p style={{ fontSize: '18px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
        {value}
        {unit && <span style={{ fontSize: '12px', fontWeight: 400, color: '#94a3b8', marginLeft: '3px' }}>{unit}</span>}
      </p>
      {subLabel && subValue !== undefined && (
        <p style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 0' }}>
          {subLabel}: {subValue}{subUnit || ''}
        </p>
      )}
    </div>
  )
}

export default function DailySummaryPopover({ summary, onClose }: DailySummaryPopoverProps) {
  const status = STATUS_DISPLAY[summary.overall_status]
  const m = summary.metrics

  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '12px',
      padding: '24px',
      position: 'relative',
      maxWidth: '520px',
    }}>
      {/* Close Button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          background: 'none',
          border: 'none',
          color: '#94a3b8',
          cursor: 'pointer',
          fontSize: '18px',
          lineHeight: 1,
          padding: '4px',
        }}
        aria-label="Close daily summary"
      >
        X
      </button>

      {/* Section 1: Date Header + Status Badge */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
            {formatDate(summary.date)}
          </h3>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            background: status.bgColor + '22',
            border: `1px solid ${status.color}44`,
            borderRadius: '9999px',
            fontSize: '12px',
            fontWeight: 600,
            color: status.color,
          }}>
            <span style={{ fontSize: '10px' }}>{status.icon}</span>
            {status.label}
          </span>
        </div>
      </div>

      {/* Section 2: Metrics Grid */}
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Key Metrics
        </h4>

        {/* Row 1: Heart Rate + HRV + Activity */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '8px' }}>
          <MetricCard
            label="Avg Heart Rate"
            value={m.avg_hr}
            unit="bpm"
            subLabel="Resting"
            subValue={m.resting_hr}
            subUnit=" bpm"
          />
          <MetricCard
            label="HRV (RMSSD)"
            value={m.hrv_rmssd}
            unit="ms"
            subLabel="7-day avg"
            subValue={m.hrv_7day_avg}
            subUnit=" ms"
          />
          <MetricCard
            label="Steps"
            value={m.total_steps.toLocaleString()}
            subLabel="7-day avg"
            subValue={m.steps_7day_avg.toLocaleString()}
          />
        </div>

        {/* Row 2: Sleep + Motor (conditional) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: m.tremor_pct !== undefined ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
          gap: '8px',
        }}>
          <MetricCard
            label="Sleep"
            value={m.sleep_hours.toFixed(1)}
            unit="hrs"
            subLabel="Efficiency"
            subValue={`${(m.sleep_efficiency * 100).toFixed(0)}`}
            subUnit="%"
          />
          <MetricCard
            label="Awakenings"
            value={m.awakenings}
            subLabel="Deep/REM"
            subValue={`${m.sleep_deep.toFixed(1)}/${m.sleep_rem.toFixed(1)}`}
            subUnit=" hrs"
          />
          {m.tremor_pct !== undefined && (
            <MetricCard
              label="Motor"
              value={`${m.tremor_pct.toFixed(1)}%`}
              subLabel="Dyskinetic"
              subValue={m.dyskinetic_mins !== undefined ? m.dyskinetic_mins : '--'}
              subUnit=" min"
            />
          )}
        </div>
      </div>

      {/* Section 3: AI Analysis */}
      <div style={{ marginBottom: summary.anomalies_detected > 0 ? '20px' : 0 }}>
        <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          AI Analysis
        </h4>
        <div style={{
          padding: '14px 16px',
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '8px',
          fontSize: '13px',
          lineHeight: 1.6,
          color: '#e2e8f0',
        }}>
          {summary.ai_analysis}
        </div>
      </div>

      {/* Section 4: Anomalies Detected */}
      {summary.anomalies_detected > 0 && (
        <div>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Anomalies Detected
          </h4>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            background: 'rgba(220, 38, 38, 0.1)',
            border: '1px solid rgba(220, 38, 38, 0.25)',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#FCA5A5',
          }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: '#DC2626',
              fontSize: '11px',
              fontWeight: 700,
              color: '#fff',
            }}>
              {summary.anomalies_detected}
            </span>
            {summary.anomalies_detected === 1 ? 'anomaly' : 'anomalies'} flagged on this day
          </div>
        </div>
      )}
    </div>
  )
}
