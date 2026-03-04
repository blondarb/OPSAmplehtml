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
import type { BaselineMetrics, TremorAssessment, FluencyAssessment } from '@/lib/wearable/types'
import type { ChartDataPoint } from './PatientTimeline'

interface DiseaseTrackProps {
  data: ChartDataPoint[]
  baseline: BaselineMetrics
  diagnosis: string
  onDayClick: (date: string) => void
  assessments?: TremorAssessment[]
  fluencyAssessments?: FluencyAssessment[]
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

function severityLabel(pct: number): { label: string; color: string } {
  if (pct < 10) return { label: 'Minimal', color: '#22C55E' }
  if (pct < 25) return { label: 'Mild', color: '#EAB308' }
  if (pct < 50) return { label: 'Moderate', color: '#F97316' }
  return { label: 'Significant', color: '#EF4444' }
}

function fluencyScoreLabel(score: number): { label: string; color: string } {
  if (score >= 70) return { label: 'Strong', color: '#22C55E' }
  if (score >= 50) return { label: 'Average', color: '#EAB308' }
  if (score >= 30) return { label: 'Below Average', color: '#F97316' }
  return { label: 'Low', color: '#EF4444' }
}

export default function DiseaseTrack({ data, baseline, diagnosis, onDayClick, assessments, fluencyAssessments }: DiseaseTrackProps) {
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

  // Build tremor assessment lookup and augment chart data
  const assessmentsByDate = new Map<string, TremorAssessment>()
  if (assessments) {
    assessments.forEach(a => {
      const date = a.assessed_at.split('T')[0]
      assessmentsByDate.set(date, a)
    })
  }

  // Build fluency assessment lookup
  const fluencyByDate = new Map<string, FluencyAssessment>()
  if (fluencyAssessments) {
    fluencyAssessments.forEach(a => {
      const date = a.assessed_at.split('T')[0]
      fluencyByDate.set(date, a)
    })
  }

  const chartData = data.map(d => ({
    ...d,
    assessment_score: assessmentsByDate.get(d.date)?.composite_score ?? null,
    fluency_score: fluencyByDate.get(d.date)?.composite_score ?? null,
  }))
  const hasAssessments = assessmentsByDate.size > 0
  const hasFluencyAssessments = fluencyByDate.size > 0
  const sortedAssessments = assessments
    ? [...assessments].sort((a, b) => b.assessed_at.localeCompare(a.assessed_at))
    : []
  const latestAssessment = sortedAssessments[0] ?? null
  const sortedFluency = fluencyAssessments
    ? [...fluencyAssessments].sort((a, b) => b.assessed_at.localeCompare(a.assessed_at))
    : []
  const latestFluency = sortedFluency[0] ?? null

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
          {hasAssessments && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '8px', height: '8px', background: '#A855F7', transform: 'rotate(45deg)' }} />
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Assessment</span>
            </div>
          )}
          {hasFluencyAssessments && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '8px', height: '8px', background: '#22C55E', borderRadius: '50%' }} />
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Fluency</span>
            </div>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
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
              if (name === 'assessment_score') return [`${value}%`, 'Assessment']
              if (name === 'fluency_score') return [`${value}`, 'Fluency']
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
          {hasAssessments && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="assessment_score"
              stroke="#A855F7"
              strokeWidth={0}
              connectNulls={false}
              /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
              dot={(props: any) => {
                if (props.payload?.assessment_score == null) return <g />
                const { cx, cy } = props
                if (!cx || !cy) return <g />
                return (
                  <polygon
                    points={`${cx},${cy - 7} ${cx + 7},${cy} ${cx},${cy + 7} ${cx - 7},${cy}`}
                    fill="#A855F7"
                    stroke="#C084FC"
                    strokeWidth={2}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onDayClick(props.payload.date)}
                  />
                )
              }}
              activeDot={{ r: 6, fill: '#A855F7' }}
            />
          )}
          {hasFluencyAssessments && (
            <Line
              yAxisId="left"
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
        </ComposedChart>
      </ResponsiveContainer>

      {/* Assessment Details */}
      {latestAssessment && (
        <div style={{
          marginTop: '12px',
          padding: '14px',
          background: 'rgba(168, 85, 247, 0.06)',
          border: '1px solid rgba(168, 85, 247, 0.2)',
          borderRadius: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#C084FC' }}>
              Latest Guided Assessment
            </span>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              {new Date(latestAssessment.assessed_at).toLocaleDateString('en-US', {
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
                color: severityLabel(latestAssessment.composite_score).color,
              }}>
                {latestAssessment.composite_score.toFixed(1)}%
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                Composite
              </div>
              <div style={{
                fontSize: '10px',
                fontWeight: 600,
                color: severityLabel(latestAssessment.composite_score).color,
                marginTop: '2px',
              }}>
                {severityLabel(latestAssessment.composite_score).label}
              </div>
            </div>
            <div style={{ width: '1px', height: '36px', background: '#334155' }} />
            {latestAssessment.tasks.map((task) => (
              <div key={task.taskType} style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: severityLabel(task.tremorPct).color,
                }}>
                  {task.tremorPct.toFixed(0)}%
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                  {task.taskType === 'postural_hold' ? 'Hold'
                    : task.taskType === 'pouring_motion' ? 'Pour'
                    : task.taskType === 'drinking_motion' ? 'Drink'
                    : task.taskType}
                </div>
              </div>
            ))}
          </div>
          {sortedAssessments.length > 1 && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b' }}>
              {sortedAssessments.length} total assessments on record
            </div>
          )}
        </div>
      )}

      {/* Fluency Assessment Details */}
      {latestFluency && (
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
                color: fluencyScoreLabel(latestFluency.composite_score).color,
              }}>
                {latestFluency.composite_score.toFixed(1)}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                Composite
              </div>
              <div style={{
                fontSize: '10px',
                fontWeight: 600,
                color: fluencyScoreLabel(latestFluency.composite_score).color,
                marginTop: '2px',
              }}>
                {fluencyScoreLabel(latestFluency.composite_score).label}
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
