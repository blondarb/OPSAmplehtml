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
  sleep_deep: '#1e3a5f',
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

function CustomLegend() {
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

export default function SleepTrack({ data, baseline, onDayClick }: SleepTrackProps) {
  const baselineCenter = baseline.sleep_hours
  const bandLow = baselineCenter - 0.5
  const bandHigh = baselineCenter + 0.5

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
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>
          Sleep Architecture
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '6px', background: '#374151', opacity: 0.5, borderRadius: '2px' }} />
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Baseline</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} onClick={(e) => {
          if (e?.activePayload?.[0]?.payload?.date) {
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
            labelFormatter={formatDate}
            formatter={(value: number, name: string) => {
              return [`${value.toFixed(1)} hrs`, SLEEP_LABELS[name] || name]
            }}
          />
          <Legend content={<CustomLegend />} />
          <ReferenceArea
            y1={bandLow}
            y2={bandHigh}
            fill="#374151"
            fillOpacity={0.3}
            stroke="none"
          />
          <Bar dataKey="sleep_deep" stackId="sleep" fill={SLEEP_COLORS.sleep_deep} radius={[0, 0, 0, 0]} />
          <Bar dataKey="sleep_rem" stackId="sleep" fill={SLEEP_COLORS.sleep_rem} radius={[0, 0, 0, 0]} />
          <Bar dataKey="sleep_light" stackId="sleep" fill={SLEEP_COLORS.sleep_light} radius={[0, 0, 0, 0]} />
          <Bar dataKey="sleep_awake" stackId="sleep" fill={SLEEP_COLORS.sleep_awake} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
