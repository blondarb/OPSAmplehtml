'use client'

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  CartesianGrid,
} from 'recharts'
import type { BaselineMetrics } from '@/lib/wearable/types'
import type { ChartDataPoint } from './PatientTimeline'

interface DiseaseTrackProps {
  data: ChartDataPoint[]
  baseline: BaselineMetrics
  diagnosis: string
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
        fill="#F97316"
        stroke="#FDBA74"
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
      fill="#F97316"
      style={{ cursor: 'pointer' }}
      onClick={() => onDayClick(payload.date)}
    />
  )
}

export default function DiseaseTrack({ data, baseline, diagnosis, onDayClick }: DiseaseTrackProps) {
  const isParkinsons = diagnosis.toLowerCase().includes('parkinson')
  const isEssentialTremor = diagnosis.toLowerCase().includes('essential tremor')

  // Don't render for non-tremor diagnoses
  if (!isParkinsons && !isEssentialTremor) {
    return null
  }

  const baselineTremor = baseline.tremor_pct ?? 12
  const bandLow = baselineTremor - 4
  const bandHigh = baselineTremor + 4

  // Count tremor data points for sparse-data messaging
  const tremorDays = data.filter(d => d.tremor_pct != null && d.tremor_pct !== undefined).length
  const hasTremorData = tremorDays > 0
  const sparseTremorData = hasTremorData && tremorDays < 3

  const title = isParkinsons ? "Parkinson\u2019s Motor Metrics" : 'Essential Tremor Monitoring'

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
          {title}
        </span>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '3px', background: '#F97316', borderRadius: '2px' }} />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Tremor %</span>
          </div>
          {isParkinsons && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '3px', background: '#FBBF24', borderRadius: '2px', borderTop: '1px dashed #FBBF24' }} />
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Dyskinetic Mins</span>
            </div>
          )}
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
            yAxisId="left"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            label={{ value: 'Tremor %', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }}
          />
          {isParkinsons && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              label={{ value: 'Minutes', angle: 90, position: 'insideRight', fill: '#94a3b8', fontSize: 11 }}
            />
          )}
          <Tooltip
            {...darkTooltipStyle}
            labelFormatter={(label: any) => formatDate(String(label))}
            formatter={(value: any, name: any) => {
              if (value === null || value === undefined) return ['—', 'No data']
              if (name === 'tremor_pct') return [`${value}%`, 'Tremor']
              if (name === 'dyskinetic_mins') return [`${value} min`, 'Dyskinetic']
              return [value, name]
            }}
          />
          <ReferenceArea
            yAxisId="left"
            y1={bandLow}
            y2={bandHigh}
            fill="#374151"
            fillOpacity={0.3}
            stroke="none"
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="tremor_pct"
            stroke="#F97316"
            strokeWidth={2}
            connectNulls={false}
            dot={<AnomalyDot onDayClick={onDayClick} />}
            activeDot={{ r: 5, fill: '#F97316' }}
          />
          {isParkinsons && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="dyskinetic_mins"
              stroke="#FBBF24"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={{ r: 2, fill: '#FBBF24' }}
              activeDot={{ r: 5, fill: '#FBBF24' }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Informational banners */}
      {!hasTremorData && (
        <div style={{
          marginTop: '12px',
          padding: '10px 14px',
          background: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          borderRadius: '8px',
        }}>
          <p style={{ color: '#818CF8', fontSize: '0.8rem', margin: 0 }}>
            No tremor data available yet. Ensure the Sevaro Monitor app has motion permissions enabled.
          </p>
        </div>
      )}
      {sparseTremorData && (
        <div style={{
          marginTop: '12px',
          padding: '10px 14px',
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
          borderRadius: '8px',
        }}>
          <p style={{ color: '#F59E0B', fontSize: '0.8rem', margin: 0 }}>
            Tremor data is collected intermittently via accelerometer ({tremorDays} data point{tremorDays !== 1 ? 's' : ''} so far). More data points will appear over time.
          </p>
        </div>
      )}
    </div>
  )
}
