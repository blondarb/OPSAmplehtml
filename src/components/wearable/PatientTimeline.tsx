'use client'

import { useState } from 'react'
import type { DailySummary, WearableAnomaly, WearablePatient } from '@/lib/wearable/types'
import HeartRateTrack from './HeartRateTrack'
import HRVTrack from './HRVTrack'
import SleepTrack from './SleepTrack'
import ActivityTrack from './ActivityTrack'
import DiseaseTrack from './DiseaseTrack'

interface PatientTimelineProps {
  dailySummaries: DailySummary[]
  anomalies: WearableAnomaly[]
  patient: WearablePatient
}

export interface ChartDataPoint {
  date: string
  avg_hr: number
  resting_hr: number
  hrv_rmssd: number
  hrv_7day_avg: number
  total_steps: number
  steps_7day_avg: number
  sleep_hours: number
  sleep_deep: number
  sleep_rem: number
  sleep_light: number
  sleep_awake: number
  sleep_efficiency: number
  awakenings: number
  tremor_pct?: number
  dyskinetic_mins?: number
  hasAnomaly: boolean
  anomalySeverity: string | null
  overall_status: string
}

function formatDateRange(summaries: DailySummary[]): string {
  if (summaries.length === 0) return ''
  const first = new Date(summaries[0].date + 'T00:00:00')
  const last = new Date(summaries[summaries.length - 1].date + 'T00:00:00')
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${fmt(first)} to ${fmt(last)}`
}

export default function PatientTimeline({ dailySummaries, anomalies, patient }: PatientTimelineProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const chartData: ChartDataPoint[] = dailySummaries.map(s => ({
    date: s.date,
    ...s.metrics,
    hasAnomaly: anomalies.some(a => a.detected_at.startsWith(s.date)),
    anomalySeverity: anomalies.find(a => a.detected_at.startsWith(s.date))?.severity || null,
    overall_status: s.overall_status,
  }))

  const handleDayClick = (date: string) => {
    setSelectedDay(prev => prev === date ? null : date)
  }

  const dateRange = formatDateRange(dailySummaries)
  const deviceName = patient.wearable_devices?.[0]?.name || 'Wearable Device'
  const diagnosis = patient.primary_diagnosis
  const medications = patient.medications || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Section Header */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '20px',
      }}>
        <h2 style={{
          fontSize: '18px',
          fontWeight: 700,
          color: '#f1f5f9',
          margin: '0 0 4px',
        }}>
          Patient Timeline — {patient.name}, {patient.age}{patient.sex}, {patient.primary_diagnosis}
        </h2>
        <p style={{
          fontSize: '13px',
          color: '#94a3b8',
          margin: '0 0 12px',
        }}>
          30-Day Monitoring Period — {dateRange}
        </p>

        {/* Info Pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '9999px',
            fontSize: '12px',
            color: '#94a3b8',
          }}>
            {deviceName}
          </span>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '9999px',
            fontSize: '12px',
            color: '#94a3b8',
          }}>
            {diagnosis}
          </span>
          {medications.map((med, i) => (
            <span key={i} style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '9999px',
              fontSize: '12px',
              color: '#94a3b8',
            }}>
              {med.name}{med.dose ? ` ${med.dose}` : ''}
            </span>
          ))}
        </div>
      </div>

      {/* Selected Day Indicator */}
      {selectedDay && (
        <div style={{
          padding: '8px 16px',
          background: '#1e293b',
          border: '1px solid #3b82f6',
          borderRadius: '8px',
          fontSize: '13px',
          color: '#93c5fd',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>
            Selected: {new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
          <button
            onClick={() => setSelectedDay(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#93c5fd',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* 5 Data Tracks */}
      <HeartRateTrack
        data={chartData}
        baseline={patient.baseline_metrics}
        onDayClick={handleDayClick}
      />
      <HRVTrack
        data={chartData}
        baseline={patient.baseline_metrics}
        onDayClick={handleDayClick}
      />
      <SleepTrack
        data={chartData}
        baseline={patient.baseline_metrics}
        onDayClick={handleDayClick}
      />
      <ActivityTrack
        data={chartData}
        baseline={patient.baseline_metrics}
        onDayClick={handleDayClick}
      />
      <DiseaseTrack
        data={chartData}
        baseline={patient.baseline_metrics}
        onDayClick={handleDayClick}
      />
    </div>
  )
}
