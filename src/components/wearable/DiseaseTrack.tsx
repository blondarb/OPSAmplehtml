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
import type { BaselineMetrics, TremorAssessment, TappingAssessment } from '@/lib/wearable/types'
import type { ChartDataPoint } from './PatientTimeline'

interface DiseaseTrackProps {
  data: ChartDataPoint[]
  baseline: BaselineMetrics
  diagnosis: string
  onDayClick: (date: string) => void
  assessments?: TremorAssessment[]
  tappingAssessments?: TappingAssessment[]
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

function tappingScoreColor(score: number): string {
  if (score > 0.7) return '#22C55E'
  if (score > 0.5) return '#EAB308'
  if (score > 0.3) return '#F97316'
  return '#EF4444'
}

function tappingSpeedColor(tps: number): string {
  if (tps > 4.0) return '#22C55E'
  if (tps > 3.0) return '#EAB308'
  if (tps > 2.0) return '#F97316'
  return '#EF4444'
}

export default function DiseaseTrack({ data, baseline, diagnosis, onDayClick, assessments, tappingAssessments }: DiseaseTrackProps) {
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

  // Build assessment lookup and augment chart data
  const assessmentsByDate = new Map<string, TremorAssessment>()
  if (assessments) {
    assessments.forEach(a => {
      const date = a.assessed_at.split('T')[0]
      assessmentsByDate.set(date, a)
    })
  }

  // Build tapping assessment lookup
  const tappingByDate = new Map<string, TappingAssessment>()
  if (tappingAssessments) {
    tappingAssessments.forEach(a => {
      const date = a.assessed_at.split('T')[0]
      tappingByDate.set(date, a)
    })
  }

  const chartData = data.map(d => ({
    ...d,
    assessment_score: assessmentsByDate.get(d.date)?.composite_score ?? null,
    tapping_score: tappingByDate.has(d.date) ? (tappingByDate.get(d.date)!.composite_score * 100) : null,
  }))
  const hasAssessments = assessmentsByDate.size > 0
  const hasTappingAssessments = tappingByDate.size > 0
  const sortedAssessments = assessments
    ? [...assessments].sort((a, b) => b.assessed_at.localeCompare(a.assessed_at))
    : []
  const latestAssessment = sortedAssessments[0] ?? null
  const sortedTappingAssessments = tappingAssessments
    ? [...tappingAssessments].sort((a, b) => b.assessed_at.localeCompare(a.assessed_at))
    : []
  const latestTapping = sortedTappingAssessments[0] ?? null

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
          {hasTappingAssessments && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '8px', height: '8px', background: '#3B82F6', transform: 'rotate(45deg)' }} />
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Tapping</span>
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
              if (name === 'tapping_score') return [`${Math.round(value as number)}%`, 'Tapping']
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
          {hasTappingAssessments && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="tapping_score"
              stroke="#3B82F6"
              strokeWidth={0}
              connectNulls={false}
              /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
              dot={(props: any) => {
                if (props.payload?.tapping_score == null) return <g />
                const { cx, cy } = props
                if (!cx || !cy) return <g />
                return (
                  <polygon
                    points={`${cx},${cy - 7} ${cx + 7},${cy} ${cx},${cy + 7} ${cx - 7},${cy}`}
                    fill="#3B82F6"
                    stroke="#60A5FA"
                    strokeWidth={2}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onDayClick(props.payload.date)}
                  />
                )
              }}
              activeDot={{ r: 6, fill: '#3B82F6' }}
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

      {/* Tapping Assessment Details */}
      {latestTapping && (
        <div style={{
          marginTop: '12px',
          padding: '14px',
          background: 'rgba(59, 130, 246, 0.06)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#60A5FA' }}>
              Latest Tapping Assessment
            </span>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              {new Date(latestTapping.assessed_at).toLocaleDateString('en-US', {
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
                color: tappingScoreColor(latestTapping.composite_score),
              }}>
                {(latestTapping.composite_score * 100).toFixed(0)}%
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                Composite
              </div>
            </div>
            <div style={{ width: '1px', height: '36px', background: '#334155' }} />
            {latestTapping.hands.map((hand) => (
              <div key={hand.hand} style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: tappingSpeedColor(hand.taps_per_second),
                }}>
                  {hand.taps_per_second.toFixed(1)}/s
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                  {hand.hand === 'right' ? 'R' : 'L'} ({hand.tap_count} taps)
                </div>
                {hand.fatigue_decrement > 30 && (
                  <div style={{ fontSize: '10px', color: '#F97316', marginTop: '2px' }}>
                    Fatigue: {hand.fatigue_decrement.toFixed(0)}%
                  </div>
                )}
              </div>
            ))}
            {latestTapping.asymmetry_index > 0.15 && (
              <>
                <div style={{ width: '1px', height: '36px', background: '#334155' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#F97316' }}>
                    {(latestTapping.asymmetry_index * 100).toFixed(0)}%
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                    Asymmetry
                  </div>
                </div>
              </>
            )}
          </div>
          {sortedTappingAssessments.length > 1 && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b' }}>
              {sortedTappingAssessments.length} total tapping assessments on record
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
