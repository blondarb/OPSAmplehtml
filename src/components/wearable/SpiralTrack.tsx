'use client'

import { useState } from 'react'
import type { SpiralAssessment, ClinicalNarrative } from '@/lib/wearable/types'
import ClinicalNarrativePanel from './ClinicalNarrativePanel'
import { spiralScoreLabel } from './trackUtils'

interface SpiralTrackProps {
  spiralAssessments?: SpiralAssessment[]
  narratives?: ClinicalNarrative[]
  onGenerateNarrative?: (type: string, assessmentId: string) => Promise<void>
}

export default function SpiralTrack({ spiralAssessments, narratives, onGenerateNarrative }: SpiralTrackProps) {
  const [generating, setGenerating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!spiralAssessments || spiralAssessments.length === 0) return null

  const sorted = [...spiralAssessments].sort((a, b) => b.assessed_at.localeCompare(a.assessed_at))
  const spiralNarratives = (narratives || []).filter(n => n.narrative_type === 'spiral')

  const accentColor = '#06B6D4' // cyan
  const accentLight = '#22D3EE'

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
          Spiral Drawing Assessments
        </span>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
          {sorted.length} assessment{sorted.length !== 1 ? 's' : ''} on record
        </span>
      </div>

      {/* Assessment Cards */}
      {sorted.map((assessment) => {
        const label = spiralScoreLabel(assessment.composite_score)
        const narrative = spiralNarratives.find(n => n.assessment_id === assessment.id)
        const isExpanded = expandedId === assessment.id

        return (
          <div key={assessment.id} style={{ marginBottom: '12px' }}>
            {/* Summary Card */}
            <div
              onClick={() => setExpandedId(isExpanded ? null : assessment.id)}
              style={{
                padding: '14px',
                background: `rgba(6, 182, 212, 0.06)`,
                border: `1px solid rgba(6, 182, 212, 0.2)`,
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: accentLight }}>
                  Spiral Drawing Assessment
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
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9', textTransform: 'capitalize' }}>
                    {assessment.classification}
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                    Classification ({(assessment.classification_confidence * 100).toFixed(0)}%)
                  </div>
                </div>
                <div style={{ width: '1px', height: '36px', background: '#334155' }} />
                {assessment.hands.map((hand) => (
                  <div key={hand.hand} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9', textTransform: 'capitalize' }}>
                      {hand.hand}
                    </div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                      {hand.classification} ({(hand.classification_confidence * 100).toFixed(0)}%)
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
                background: 'rgba(6, 182, 212, 0.03)',
                border: '1px solid rgba(6, 182, 212, 0.12)',
                borderRadius: '0 0 8px 8px',
              }}>
                {/* Per-hand metrics grid */}
                {assessment.hands.map((hand) => (
                  <div key={hand.hand} style={{ marginBottom: '12px' }}>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: accentLight,
                      textTransform: 'capitalize',
                      marginBottom: '8px',
                    }}>
                      {hand.hand} Hand — {hand.trials_completed} trial{hand.trials_completed !== 1 ? 's' : ''}
                    </div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: '8px',
                    }}>
                      <MetricCell label="Tremor Amplitude" value={`${hand.avg_tremor_amplitude_mm.toFixed(2)} mm`} />
                      <MetricCell label="Tremor Frequency" value={`${hand.avg_tremor_frequency_hz.toFixed(1)} Hz`} />
                      <MetricCell label="Radial Deviation" value={`${hand.avg_radial_deviation_mm.toFixed(2)} mm`} />
                      <MetricCell label="Drawing Speed" value={`${hand.avg_drawing_speed_mm_per_sec.toFixed(1)} mm/s`} />
                      <MetricCell label="Smoothness (SPARC)" value={hand.avg_smoothness_sparc.toFixed(2)} />
                      <MetricCell label="Tightness Ratio" value={hand.avg_spiral_tightness_ratio.toFixed(2)} />
                      <MetricCell label="Completion" value={`${(hand.avg_completion_ratio * 100).toFixed(0)}%`} />
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
                onRegenerate={onGenerateNarrative ? () => onGenerateNarrative('spiral', assessment.id) : undefined}
              />
            ) : onGenerateNarrative && (
              <button
                onClick={async () => {
                  setGenerating(true)
                  try { await onGenerateNarrative('spiral', assessment.id) }
                  finally { setGenerating(false) }
                }}
                disabled={generating}
                style={{
                  marginTop: '8px',
                  width: '100%',
                  padding: '10px 16px',
                  background: generating ? '#334155' : `rgba(6, 182, 212, 0.1)`,
                  border: `1px solid rgba(6, 182, 212, 0.25)`,
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

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: '6px 8px',
      background: 'rgba(15, 23, 42, 0.5)',
      borderRadius: '6px',
      border: '1px solid #1e293b',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>{value}</div>
      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{label}</div>
    </div>
  )
}
