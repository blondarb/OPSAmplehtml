'use client'

import { useState } from 'react'
import type { DailySummary, WearableAnomaly, WearablePatient, TremorAssessment, FluencyAssessment, TappingAssessment, SpiralAssessment, GaitAssessment, ClinicalNarrative } from '@/lib/wearable/types'
import HeartRateTrack from './HeartRateTrack'
import HRVTrack from './HRVTrack'
import SleepTrack from './SleepTrack'
import ActivityTrack from './ActivityTrack'
import MotorTrack from './MotorTrack'
import CognitiveTrack from './CognitiveTrack'
import SpiralTrack from './SpiralTrack'
import GaitTrack from './GaitTrack'
import LongitudinalSummaryBanner from './LongitudinalSummaryBanner'

interface PatientTimelineProps {
  dailySummaries: DailySummary[]
  anomalies: WearableAnomaly[]
  patient: WearablePatient
  assessments?: TremorAssessment[]
  fluencyAssessments?: FluencyAssessment[]
  tappingAssessments?: TappingAssessment[]
  spiralAssessments?: SpiralAssessment[]
  gaitAssessments?: GaitAssessment[]
  narratives?: ClinicalNarrative[]
  onGenerateNarrative?: (type: string, assessmentId: string) => Promise<void>
}

export interface ChartDataPoint {
  date: string
  avg_hr: number | null  // null when HealthKit has no data for that day
  resting_hr: number | null
  hrv_rmssd: number
  hrv_7day_avg: number
  total_steps: number
  steps_7day_avg: number
  sleep_hours: number | null
  sleep_deep: number | null
  sleep_rem: number | null
  sleep_light: number | null
  sleep_awake: number | null
  sleep_total: number | null
  sleep_efficiency: number | null
  awakenings: number | null
  tremor_pct?: number
  dyskinetic_mins?: number
  hasAnomaly: boolean
  anomalySeverity: string | null
  overall_status: string
}

function toDateOnly(dateStr: string): string {
  return String(dateStr).split('T')[0]
}

function formatDateRange(summaries: DailySummary[]): string {
  if (summaries.length === 0) return ''
  const first = new Date(toDateOnly(summaries[0].date) + 'T00:00:00')
  const last = new Date(toDateOnly(summaries[summaries.length - 1].date) + 'T00:00:00')
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${fmt(first)} to ${fmt(last)}`
}

export default function PatientTimeline({ dailySummaries, anomalies, patient, assessments, fluencyAssessments, tappingAssessments, spiralAssessments, gaitAssessments, narratives, onGenerateNarrative }: PatientTimelineProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [generatingLongitudinal, setGeneratingLongitudinal] = useState(false)

  const hasLongitudinalNarrative = narratives?.some(n => n.narrative_type === 'longitudinal') ?? false

  if (!dailySummaries || dailySummaries.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
            30-Day Monitoring Period
          </p>
        </div>
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '48px 24px',
          textAlign: 'center',
        }}>
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
            No data yet — sync from the Sevaro Monitor app to see results here.
          </p>
        </div>
      </div>
    )
  }

  const chartData: ChartDataPoint[] = dailySummaries.map(s => {
    const dateStr = toDateOnly(s.date)
    return {
      date: dateStr,
      ...s.metrics,
      hasAnomaly: anomalies.some(a => a.detected_at.startsWith(dateStr)),
      anomalySeverity: anomalies.find(a => a.detected_at.startsWith(dateStr))?.severity || null,
      overall_status: s.overall_status,
    }
  })

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
          {onGenerateNarrative && (
            <button
              onClick={async () => {
                setGeneratingLongitudinal(true)
                try { await onGenerateNarrative('longitudinal', '') }
                finally { setGeneratingLongitudinal(false) }
              }}
              disabled={generatingLongitudinal}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                background: generatingLongitudinal ? '#334155' : 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: '9999px',
                fontSize: '12px',
                color: generatingLongitudinal ? '#94a3b8' : '#a78bfa',
                fontWeight: 600,
                cursor: generatingLongitudinal ? 'not-allowed' : 'pointer',
              }}
            >
              {generatingLongitudinal ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                  Generating...
                </>
              ) : (
                <>{hasLongitudinalNarrative ? '↻ Regenerate' : '📊 Generate'} 30-Day Summary</>
              )}
            </button>
          )}
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
      {/* Longitudinal Summary Banner (if available) */}
      {narratives?.filter(n => n.narrative_type === 'longitudinal').slice(0, 1).map(n => (
        <LongitudinalSummaryBanner
          key={n.id}
          narrative={n}
          onRegenerate={onGenerateNarrative ? () => onGenerateNarrative('longitudinal', '') : undefined}
        />
      ))}
      <MotorTrack
        data={chartData}
        baseline={patient.baseline_metrics}
        diagnosis={patient.primary_diagnosis}
        onDayClick={handleDayClick}
        assessments={assessments}
        tappingAssessments={tappingAssessments}
        narratives={narratives}
        onGenerateNarrative={onGenerateNarrative}
      />
      <CognitiveTrack
        data={chartData}
        baseline={patient.baseline_metrics}
        onDayClick={handleDayClick}
        fluencyAssessments={fluencyAssessments}
        narratives={narratives}
        onGenerateNarrative={onGenerateNarrative}
      />
      <SpiralTrack
        spiralAssessments={spiralAssessments}
        narratives={narratives}
        onGenerateNarrative={onGenerateNarrative}
      />
      <GaitTrack
        gaitAssessments={gaitAssessments}
        narratives={narratives}
        onGenerateNarrative={onGenerateNarrative}
      />
    </div>
  )
}
