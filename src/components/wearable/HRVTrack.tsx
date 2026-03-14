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

interface HRVTrackProps {
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
        fill="#8B5CF6"
        stroke="#C4B5FD"
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
      fill="#C4B5FD"
      style={{ cursor: 'pointer' }}
      onClick={() => onDayClick(payload.date)}
    />
  )
}

function xAxisInterval(dataLen: number): number {
  if (dataLen <= 14) return 1
  if (dataLen <= 30) return 4
  if (dataLen <= 60) return 6
  return Math.floor(dataLen / 10)
}

export default function HRVTrack({ data, baseline, onDayClick }: HRVTrackProps) {
  const baselineCenter = baseline.hrv_rmssd
  const bandLow = baselineCenter - 6
  const bandHigh = baselineCenter + 6

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
          Heart Rate Variability (HRV)
        </span>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '3px', background: '#C4B5FD', borderRadius: '2px' }} />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>HRV RMSSD</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '3px', background: '#8B5CF6', borderRadius: '2px' }} />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>7-Day Avg</span>
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
            interval={xAxisInterval(data.length)}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            label={{ value: 'RMSSD (ms)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }}
          />
          <Tooltip
            {...darkTooltipStyle}
            labelFormatter={(label: any) => formatDate(String(label))}
            formatter={(value: any, name: any) => {
              const label = name === 'hrv_rmssd' ? 'HRV RMSSD' : '7-Day Avg'
              return [`${value} ms`, label]
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
            dataKey="hrv_rmssd"
            stroke="#C4B5FD"
            strokeWidth={2}
            dot={<AnomalyDot onDayClick={onDayClick} />}
            activeDot={{ r: 5, fill: '#C4B5FD' }}
          />
          <Line
            type="monotone"
            dataKey="hrv_7day_avg"
            stroke="#8B5CF6"
            strokeWidth={2}
            dot={{ r: 2, fill: '#8B5CF6' }}
            activeDot={{ r: 5, fill: '#8B5CF6' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
