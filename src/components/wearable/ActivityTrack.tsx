'use client'

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  CartesianGrid,
} from 'recharts'
import type { BaselineMetrics } from '@/lib/wearable/types'
import type { ChartDataPoint } from './PatientTimeline'

interface ActivityTrackProps {
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

export default function ActivityTrack({ data, baseline, onDayClick }: ActivityTrackProps) {
  const baselineCenter = baseline.avg_steps
  const bandLow = baselineCenter - 800
  const bandHigh = baselineCenter + 800

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
          Daily Activity
        </span>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', background: '#10B981', borderRadius: '2px' }} />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Steps</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '3px', background: '#059669', borderRadius: '2px' }} />
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
        <ComposedChart data={data} onClick={(e: any) => {
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
            label={{ value: 'Steps', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }}
          />
          <Tooltip
            {...darkTooltipStyle}
            labelFormatter={(label: any) => formatDate(String(label))}
            formatter={(value: any, name: any) => {
              const label = name === 'total_steps' ? 'Steps' : '7-Day Avg'
              return [Number(value).toLocaleString(), label]
            }}
          />
          <ReferenceArea
            y1={bandLow}
            y2={bandHigh}
            fill="#374151"
            fillOpacity={0.3}
            stroke="none"
          />
          <Bar
            dataKey="total_steps"
            fill="#10B981"
            radius={[4, 4, 0, 0]}
            opacity={0.7}
          />
          <Line
            type="monotone"
            dataKey="steps_7day_avg"
            stroke="#059669"
            strokeWidth={2}
            dot={{ r: 2, fill: '#059669' }}
            activeDot={{ r: 5, fill: '#059669' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
