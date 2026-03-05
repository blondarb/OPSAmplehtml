'use client'

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import type { FluencyAssessment, ClinicalNarrative } from '@/lib/wearable/types'
import type { ChartDataPoint } from './PatientTimeline'
import type { BaselineMetrics } from '@/lib/wearable/types'
import ClinicalNarrativePanel from './ClinicalNarrativePanel'
import { formatDate, toLocalDate, darkTooltipStyle, fluencyScoreLabel } from './trackUtils'

// ── Cognitive Test Registry ──
// Adding a new cognitive test: add a config entry here, add the assessment
// lookup in the component body, and add a detail card in the JSX.

interface CognitiveTestConfig {
  key: string
  label: string
  color: string
  strokeColor: string
  narrativeType: ClinicalNarrative['narrative_type']
  scoreLabel: (score: number) => { label: string; color: string }
}

const COGNITIVE_TESTS: CognitiveTestConfig[] = [
  {
    key: 'fluency',
    label: 'Verbal Fluency',
    color: '#22C55E',
    strokeColor: '#4ADE80',
    narrativeType: 'fluency',
    scoreLabel: fluencyScoreLabel,
  },
  // Future: trail_making, clock_drawing, reaction_time, digit_span
]

interface CognitiveTrackProps {
  data: ChartDataPoint[]
  baseline: BaselineMetrics
  onDayClick: (date: string) => void
  fluencyAssessments?: FluencyAssessment[]
  narratives?: ClinicalNarrative[]
}

export default function CognitiveTrack({ data, onDayClick, fluencyAssessments, narratives }: CognitiveTrackProps) {
  // Check if we have any cognitive assessment data
  const hasFluency = (fluencyAssessments?.length ?? 0) > 0
  // Future: const hasTrailMaking = ...
  const hasAnyData = hasFluency

  if (!hasAnyData) return null

  // Build fluency assessment lookup
  const fluencyByDate = new Map<string, FluencyAssessment>()
  if (fluencyAssessments) {
    fluencyAssessments.forEach(a => {
      fluencyByDate.set(toLocalDate(a.assessed_at), a)
    })
  }

  // Augment chart data with cognitive scores
  const chartData = data.map(d => ({
    ...d,
    fluency_score: fluencyByDate.get(d.date)?.composite_score ?? null,
    // Future: trail_making_score, clock_drawing_score, etc.
  }))

  const hasFluencyAssessments = fluencyByDate.size > 0

  // Sort and pick latest fluency
  const sortedFluency = fluencyAssessments
    ? [...fluencyAssessments].sort((a, b) => b.assessed_at.localeCompare(a.assessed_at))
    : []
  const latestFluency = sortedFluency[0] ?? null
  const fluencyLabel = latestFluency ? fluencyScoreLabel(latestFluency.composite_score) : null

  // Build narrative lookup
  const fluencyNarratives = (narratives || []).filter(n => n.narrative_type === 'fluency')
  const latestFluencyNarrative = latestFluency
    ? fluencyNarratives.find(n => n.assessment_id === latestFluency.id) ?? fluencyNarratives[0]
    : null

  // Build legend from active test configs
  const activeTests = COGNITIVE_TESTS.filter(t => {
    if (t.key === 'fluency') return hasFluencyAssessments
    return false
  })

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
          Cognitive Assessments
        </span>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {activeTests.map(test => (
            <div key={test.key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '8px', height: '8px', background: test.color, borderRadius: '50%' }} />
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>{test.label}</span>
            </div>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <ComposedChart data={chartData} onClick={(e: any) => {
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
            yAxisId="score"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            label={{ value: 'Score', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }}
            domain={[0, 100]}
          />
          <Tooltip
            {...darkTooltipStyle}
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            labelFormatter={(label: any) => formatDate(String(label))}
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            formatter={(value: any, name: any) => {
              if (value === null || value === undefined) return ['—', 'No data']
              if (name === 'fluency_score') return [`${Number(value).toFixed(1)}`, 'Fluency']
              // Future: handle other cognitive test scores
              return [value, name]
            }}
          />
          {hasFluencyAssessments && (
            <Line
              yAxisId="score"
              type="monotone"
              dataKey="fluency_score"
              stroke="#22C55E"
              strokeWidth={0}
              connectNulls={false}
              /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
              dot={(props: any) => {
                if (props.payload?.fluency_score == null) return <g />
                const { cx, cy } = props
                if (!cx || !cy) return <g />
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={7}
                    fill="#22C55E"
                    stroke="#4ADE80"
                    strokeWidth={2}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onDayClick(props.payload.date)}
                  />
                )
              }}
              activeDot={{ r: 6, fill: '#22C55E' }}
            />
          )}
          {/* Future: additional <Line> elements for trail_making, clock_drawing, etc. */}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Fluency Assessment Details */}
      {latestFluency && fluencyLabel && (
        <div style={{
          marginTop: '12px',
          padding: '14px',
          background: 'rgba(34, 197, 94, 0.06)',
          border: '1px solid rgba(34, 197, 94, 0.2)',
          borderRadius: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#4ADE80' }}>
              Latest Verbal Fluency Assessment
            </span>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              {new Date(latestFluency.assessed_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: 'numeric', minute: '2-digit',
              })}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '20px',
                fontWeight: 700,
                color: fluencyLabel.color,
              }}>
                {(latestFluency.composite_score ?? 0).toFixed(1)}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                Composite
              </div>
              <div style={{
                fontSize: '10px',
                fontWeight: 600,
                color: fluencyLabel.color,
                marginTop: '2px',
              }}>
                {fluencyLabel.label}
              </div>
            </div>
            <div style={{ width: '1px', height: '36px', background: '#334155' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>
                {latestFluency.total_words}
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                Words
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#f1f5f9',
                textTransform: 'capitalize',
              }}>
                {latestFluency.category}
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                Category
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#EAB308' }}>
                {latestFluency.repetitions}
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                Repeats
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#EF4444' }}>
                {latestFluency.errors}
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                Errors
              </div>
            </div>
            {latestFluency.ai_refined && (
              <span style={{
                fontSize: '10px',
                fontWeight: 600,
                color: '#22C55E',
                padding: '2px 8px',
                background: 'rgba(34, 197, 94, 0.15)',
                borderRadius: '9999px',
              }}>
                AI Enhanced
              </span>
            )}
          </div>
          {sortedFluency.length > 1 && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b' }}>
              {sortedFluency.length} total fluency assessments on record
            </div>
          )}
        </div>
      )}
      {latestFluencyNarrative && (
        <ClinicalNarrativePanel narrative={latestFluencyNarrative} accentColor="#22C55E" />
      )}
    </div>
  )
}
