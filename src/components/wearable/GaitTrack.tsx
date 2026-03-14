'use client'

import { useState } from 'react'
import type { GaitAssessment, ClinicalNarrative } from '@/lib/wearable/types'
import ClinicalNarrativePanel from './ClinicalNarrativePanel'
import { gaitScoreLabel } from './trackUtils'

interface GaitTrackProps {
  gaitAssessments?: GaitAssessment[]
  narratives?: ClinicalNarrative[]
  onGenerateNarrative?: (type: string, assessmentId: string) => Promise<void>
}

export default function GaitTrack({ gaitAssessments, narratives, onGenerateNarrative }: GaitTrackProps) {
  const [generating, setGenerating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!gaitAssessments || gaitAssessments.length === 0) return null

  const sorted = [...gaitAssessments].sort((a, b) => b.assessed_at.localeCompare(a.assessed_at))
  const gaitNarratives = (narratives || []).filter(n => n.narrative_type === 'gait')

  const accentColor = '#14B8A6' // teal
  const accentLight = '#2DD4BF'

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
          Gait & Ambulation Assessments
        </span>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
          {sorted.length} assessment{sorted.length !== 1 ? 's' : ''} on record
        </span>
      </div>

      {/* Assessment Cards */}
      {sorted.map((assessment) => {
        const label = gaitScoreLabel(assessment.composite_score)
        const narrative = gaitNarratives.find(n => n.assessment_id === assessment.id)
        const isExpanded = expandedId === assessment.id

        return (
          <div key={assessment.id} style={{ marginBottom: '12px' }}>
            {/* Summary Card */}
            <div
              onClick={() => setExpandedId(isExpanded ? null : assessment.id)}
              style={{
                padding: '14px',
                background: `rgba(20, 184, 166, 0.06)`,
                border: `1px solid rgba(20, 184, 166, 0.2)`,
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: accentLight }}>
                  Gait & Ambulation Assessment
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                    {new Date(assessment.assessed_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                      hour: 'numeric', minute: '2-digit',
                    })}
                  </span>
                  <span style={{
                    fontSize: '12px',
                    color: '#64748b',
                    transition: 'transform 0.2s',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                  }}>▼</span>
                </div>
              </div>

              {/* Top-level metrics row */}
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: label.color }}>
                    {(assessment.composite_score * 100).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Composite</div>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: label.color, marginTop: '2px' }}>
                    {label.label}
                  </div>
                </div>
                <div style={{ width: '1px', height: '36px', background: '#334155' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>
                    {assessment.overall_cadence.toFixed(1)}
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                    steps/min
                  </div>
                </div>
                <div style={{ width: '1px', height: '36px', background: '#334155' }} />
                {assessment.hands.map((hand) => (
                  <div key={hand.hand} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9', textTransform: 'capitalize' }}>
                      {hand.hand}
                    </div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                      {hand.step_count} steps, {hand.cadence.toFixed(0)} spm
                    </div>
                  </div>
                ))}
                {assessment.asymmetry_index > 15 && (
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#F59E0B',
                    padding: '2px 8px',
                    background: 'rgba(245, 158, 11, 0.15)',
                    borderRadius: '9999px',
                  }}>
                    Asymmetry: {assessment.asymmetry_index.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>

            {/* Expanded Detail */}
            {isExpanded && (
              <div style={{
                marginTop: '4px',
                padding: '14px',
                background: 'rgba(20, 184, 166, 0.03)',
                border: '1px solid rgba(20, 184, 166, 0.12)',
                borderRadius: '0 0 8px 8px',
              }}>
                {assessment.hands.map((hand) => (
                  <div key={hand.hand} style={{ marginBottom: '12px' }}>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: accentLight,
                      textTransform: 'capitalize',
                      marginBottom: '8px',
                    }}>
                      {hand.hand} Side — {hand.duration_seconds.toFixed(0)}s walk
                    </div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: '8px',
                    }}>
                      <MetricCell label="Cadence" value={`${hand.cadence.toFixed(1)} spm`} />
                      <MetricCell label="Step Count" value={`${hand.step_count}`} />
                      <MetricCell label="Step Regularity" value={`${(hand.step_regularity * 100).toFixed(0)}%`} />
                      <MetricCell label="Step Variability (CV)" value={`${(hand.step_variability_cv * 100).toFixed(1)}%`} />
                      <MetricCell label="Arm Swing" value={`${hand.arm_swing_amplitude_g.toFixed(3)} g`} />
                      <MetricCell label="Mean Accel" value={`${hand.mean_acceleration_g.toFixed(3)} g`} />
                      <MetricCell label="Dom. Frequency" value={`${hand.dominant_frequency_hz.toFixed(2)} Hz`} />
                      {hand.freezing_count > 0 && (
                        <MetricCell label="Freezing Episodes" value={`${hand.freezing_count}`} warn />
                      )}
                    </div>
                  </div>
                ))}

                {/* Source device */}
                {assessment.source_device && (
                  <div style={{ fontSize: '10px', color: '#475569', marginTop: '4px' }}>
                    Source: {assessment.source_device}
                  </div>
                )}
              </div>
            )}

            {/* Narrative or Generate button */}
            {narrative ? (
              <ClinicalNarrativePanel
                narrative={narrative}
                accentColor={accentColor}
                onRegenerate={onGenerateNarrative ? () => onGenerateNarrative('gait', assessment.id) : undefined}
              />
            ) : onGenerateNarrative && (
              <button
                onClick={async () => {
                  setGenerating(true)
                  try { await onGenerateNarrative('gait', assessment.id) }
                  finally { setGenerating(false) }
                }}
                disabled={generating}
                style={{
                  marginTop: '8px',
                  width: '100%',
                  padding: '10px 16px',
                  background: generating ? '#334155' : `rgba(20, 184, 166, 0.1)`,
                  border: `1px solid rgba(20, 184, 166, 0.25)`,
                  borderRadius: '8px',
                  color: generating ? '#94a3b8' : accentLight,
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: generating ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {generating ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Generating Clinical Interpretation...
                  </>
                ) : (
                  <>🧠 Generate AI Clinical Interpretation</>
                )}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function MetricCell({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{
      padding: '6px 8px',
      background: warn ? 'rgba(245, 158, 11, 0.08)' : 'rgba(15, 23, 42, 0.5)',
      borderRadius: '6px',
      border: warn ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid #1e293b',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: warn ? '#F59E0B' : '#e2e8f0' }}>{value}</div>
      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{label}</div>
    </div>
  )
}
