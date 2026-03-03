'use client'

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  CartesianGrid,
  Legend,
} from 'recharts'
import type { BaselineMetrics } from '@/lib/wearable/types'
import type { ChartDataPoint } from './PatientTimeline'

interface SleepTrackProps {
  data: ChartDataPoint[]
  baseline: BaselineMetrics
  onDayClick: (date: string) => void
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const darkTooltipStyle = {
  contentStyle: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' },
  labelStyle: { color: '#94a3b8' },
}

const SLEEP_COLORS = {
  sleep_deep: '#3b82f6',
  sleep_rem: '#0d9488',
  sleep_light: '#60a5fa',
  sleep_awake: '#ef4444',
}

const SLEEP_LABELS: Record<string, string> = {
  sleep_deep: 'Deep Sleep',
  sleep_rem: 'REM Sleep',
  sleep_light: 'Light Sleep',
  sleep_awake: 'Awake',
}

function CustomLegend({ hasStages }: { hasStages: boolean }) {
  if (hasStages) {
    const items = Object.entries(SLEEP_COLORS)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '4px' }}>
        {items.map(([key, color]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', background: color, borderRadius: '2px' }} />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{SLEEP_LABELS[key]}</span>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '10px', height: '10px', background: '#6366F1', borderRadius: '2px' }} />
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>Total Sleep</span>
      </div>
    </div>
  )
}

export default function SleepTrack({ data, baseline, onDayClick }: SleepTrackProps) {
  const baselineCenter = baseline.sleep_hours
  const bandLow = baselineCenter - 0.5
  const bandHigh = baselineCenter + 0.5

  // Detect if ANY day has stage data
  const hasAnyStageData = data.some(d =>
    (d.sleep_deep != null && d.sleep_deep > 0) ||
    (d.sleep_rem != null && d.sleep_rem > 0) ||
    (d.sleep_light != null && d.sleep_light > 0)
  )

  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '12px',
      padding: '20px',
    }}>
      {/* Title */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>
            Sleep Architecture
          </span>
          {!hasAnyStageData && (
            <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
              Stage breakdown not available from device
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '6px', background: '#374151', opacity: 0.5, borderRadius: '2px' }} />
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Baseline</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <BarChart data={data} onClick={(e: any) => {
          if (e && e.activePayload && e.activePayload.length > 0) {
            onDayClick(e.activePayload[0].payload.date)
          }
        }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickFormatter={formatDate}
            interval={4}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            label={{ value: 'Hours', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }}
          />
          <Tooltip
            {...darkTooltipStyle}
            labelFormatter={(label: any) => formatDate(String(label))}
            formatter={(value: any, name: any) => {
              if (value === null || value === undefined) return ['—', 'No data']
              const label = name === 'sleep_total' ? 'Total Sleep' : (SLEEP_LABELS[name] || name)
              return [`${Number(value).toFixed(1)} hrs`, label]
            }}
          />
          <Legend content={<CustomLegend hasStages={hasAnyStageData} />} />
          <ReferenceArea
            y1={bandLow}
            y2={bandHigh}
            fill="#374151"
            fillOpacity={0.3}
            stroke="none"
          />
          {hasAnyStageData ? (
            <>
              <Bar dataKey="sleep_deep" stackId="sleep" fill={SLEEP_COLORS.sleep_deep} radius={[0, 0, 0, 0]} />
              <Bar dataKey="sleep_rem" stackId="sleep" fill={SLEEP_COLORS.sleep_rem} radius={[0, 0, 0, 0]} />
              <Bar dataKey="sleep_light" stackId="sleep" fill={SLEEP_COLORS.sleep_light} radius={[0, 0, 0, 0]} />
              <Bar dataKey="sleep_awake" stackId="sleep" fill={SLEEP_COLORS.sleep_awake} radius={[4, 4, 0, 0]} />
            </>
          ) : (
            <Bar dataKey="sleep_total" fill="#6366F1" radius={[4, 4, 0, 0]} opacity={0.8} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
