'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  CartesianGrid,
} from 'recharts'
import type { BaselineMetrics } from '@/lib/wearable/types'
import type { ChartDataPoint } from './PatientTimeline'

interface HeartRateTrackProps {
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

interface DotProps {
  cx?: number
  cy?: number
  payload?: ChartDataPoint
  onDayClick: (date: string) => void
}

function AnomalyDot({ cx, cy, payload, onDayClick }: DotProps) {
  if (!cx || !cy || !payload) return null
  if (payload.hasAnomaly) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={6}
        fill="#DC2626"
        stroke="#FCA5A5"
        strokeWidth={2}
        style={{ cursor: 'pointer' }}
        onClick={() => onDayClick(payload.date)}
      />
    )
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3}
      fill="#FCA5A5"
      style={{ cursor: 'pointer' }}
      onClick={() => onDayClick(payload.date)}
    />
  )
}

export default function HeartRateTrack({ data, baseline, onDayClick }: HeartRateTrackProps) {
  const baselineCenter = baseline.resting_hr
  const bandLow = baselineCenter - 5
  const bandHigh = baselineCenter + 5

  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '12px',
      padding: '20px',
    }}>
      {/* Title and Legend */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
      }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>
          Heart Rate
        </span>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '3px', background: '#FCA5A5', borderRadius: '2px' }} />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Avg HR</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '3px', background: '#DC2626', borderRadius: '2px' }} />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Resting HR</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '6px', background: '#374151', opacity: 0.5, borderRadius: '2px' }} />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Baseline</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <LineChart data={data} onClick={(e: any) => {
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
            label={{ value: 'bpm', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }}
          />
          <Tooltip
            {...darkTooltipStyle}
            labelFormatter={(label: any) => formatDate(String(label))}
            formatter={(value: any, name: any) => {
              if (value === null || value === undefined) return ['—', name === 'avg_hr' ? 'Avg HR' : 'Resting HR']
              const label = name === 'avg_hr' ? 'Avg HR' : 'Resting HR'
              return [`${value} bpm`, label]
            }}
          />
          <ReferenceArea
            y1={bandLow}
            y2={bandHigh}
            fill="#374151"
            fillOpacity={0.3}
            stroke="none"
          />
          <Line
            type="monotone"
            dataKey="avg_hr"
            stroke="#FCA5A5"
            strokeWidth={2}
            connectNulls={false}
            dot={<AnomalyDot onDayClick={onDayClick} />}
            activeDot={{ r: 5, fill: '#FCA5A5' }}
          />
          <Line
            type="monotone"
            dataKey="resting_hr"
            stroke="#DC2626"
            strokeWidth={2}
            connectNulls={true}
            dot={{ r: 2, fill: '#DC2626' }}
            activeDot={{ r: 5, fill: '#DC2626' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
