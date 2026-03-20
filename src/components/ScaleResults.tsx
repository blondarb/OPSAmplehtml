'use client'

/**
 * ScaleResults — display completed scale results from the Scale Auto-Administration Engine.
 *
 * Can render a single result (inline mode) or a full list of results for a session.
 * Color-coded severity, collapsible question-level detail, critical alert banners.
 *
 * Used by:
 *   - LocalizerPanel (physician panel) — shows indicated + completed scales
 *   - Unified Report Generator (Phase 7) — embeds scored scales in the clinical report
 */

import React, { useState } from 'react'
import type { ScaleResult, SeverityLevel } from '@/lib/consult/scales'

// ─── Severity helpers ─────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<SeverityLevel | 'none', { bg: string; text: string; border: string; label: string }> = {
  none:              { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB', label: 'N/A' },
  minimal:           { bg: '#DCFCE7', text: '#166534', border: '#86EFAC', label: 'Minimal' },
  mild:              { bg: '#F0FDF4', text: '#15803D', border: '#4ADE80', label: 'Mild' },
  moderate:          { bg: '#FEFCE8', text: '#854D0E', border: '#FDE047', label: 'Moderate' },
  moderately_severe: { bg: '#FFF7ED', text: '#9A3412', border: '#FB923C', label: 'Mod–Severe' },
  severe:            { bg: '#FEF2F2', text: '#991B1B', border: '#FCA5A5', label: 'Severe' },
}

function SeverityBadge({ level }: { level: SeverityLevel }) {
  const s = SEVERITY_COLOR[level] ?? SEVERITY_COLOR.none
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 9999,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.04em',
      background: s.bg,
      color: s.text,
      border: `1px solid ${s.border}`,
    }}>
      {s.label}
    </span>
  )
}

/** Circular score dial — simple CSS-based indicator */
function ScoreDial({
  score,
  maxScore,
  severity,
}: {
  score: number
  maxScore: number
  severity: SeverityLevel
}) {
  const pct = Math.min(100, Math.round((score / maxScore) * 100))
  const s = SEVERITY_COLOR[severity] ?? SEVERITY_COLOR.none
  const size = 52
  const stroke = 5
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E7EB" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={s.border}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: s.text, lineHeight: 1 }}>{score}</span>
      </div>
    </div>
  )
}

// ─── Individual result card ───────────────────────────────────────────────────

interface ScaleResultCardProps {
  result: ScaleResult
  /** Map of question IDs to human-readable labels for expanding detail */
  questionLabels?: Record<string, string>
  defaultExpanded?: boolean
}

export function ScaleResultCard({
  result,
  questionLabels,
  defaultExpanded = false,
}: ScaleResultCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const hasCritical = result.triggeredAlerts?.some((a) => a.type === 'critical')
  const hasWarning = result.triggeredAlerts?.some((a) => a.type === 'warning')

  // Estimate max score from response count (used for the dial)
  const responseCount = Object.keys(result.rawResponses ?? {}).length
  const estimatedMax = estimateMaxScore(result.scaleAbbreviation, responseCount)

  const adminLabel = result.adminMode === 'exam_required'
    ? 'Physician Administered'
    : 'Voice Administered'

  const dateLabel = result.completedAt
    ? new Date(result.completedAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    : ''

  return (
    <div style={{
      border: `1px solid ${hasCritical ? '#FCA5A5' : '#E5E7EB'}`,
      borderRadius: 8,
      background: hasCritical ? '#FFF5F5' : '#FFFFFF',
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Critical alert banner */}
      {hasCritical && (
        <div style={{
          background: '#EF4444',
          color: '#FFFFFF',
          padding: '6px 14px',
          fontSize: 12,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span>⚠</span>
          {result.triggeredAlerts?.filter((a) => a.type === 'critical').map((a, i) => (
            <span key={i}>{a.message}</span>
          ))}
        </div>
      )}

      {/* Warning banner */}
      {!hasCritical && hasWarning && (
        <div style={{
          background: '#F59E0B',
          color: '#FFFFFF',
          padding: '6px 14px',
          fontSize: 12,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span>⚑</span>
          {result.triggeredAlerts?.filter((a) => a.type === 'warning').map((a, i) => (
            <span key={i}>{a.message}</span>
          ))}
        </div>
      )}

      {/* Header row */}
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <ScoreDial
          score={result.totalScore}
          maxScore={estimatedMax}
          severity={result.severityLevel}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>
              {result.scaleAbbreviation}
            </span>
            <SeverityBadge level={result.severityLevel} />
            <span style={{
              fontSize: 11,
              color: '#6B7280',
              background: '#F3F4F6',
              padding: '1px 6px',
              borderRadius: 4,
            }}>
              {adminLabel}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#374151', marginTop: 3 }}>
            Score: <strong>{result.totalScore}</strong>
            {estimatedMax ? ` / ${estimatedMax}` : ''} — {result.interpretation}
          </div>
          {result.subscaleScores && (
            <SubscaleBar scores={result.subscaleScores} scaleId={result.scaleAbbreviation} />
          )}
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>{dateLabel}</div>
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              marginTop: 4,
              fontSize: 11,
              color: '#6B7280',
              background: 'none',
              border: '1px solid #E5E7EB',
              borderRadius: 4,
              padding: '2px 8px',
              cursor: 'pointer',
            }}
          >
            {expanded ? 'Hide detail' : 'Show detail'}
          </button>
        </div>
      </div>

      {/* Expanded question detail */}
      {expanded && (
        <div style={{
          borderTop: '1px solid #F3F4F6',
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>
            RESPONSES
          </div>
          {Object.entries(result.rawResponses ?? {}).map(([qId, value]) => (
            <div key={qId} style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              color: '#374151',
              padding: '3px 0',
              borderBottom: '1px solid #F9FAFB',
            }}>
              <span style={{ color: '#6B7280' }}>
                {questionLabels?.[qId] ?? qId.toUpperCase()}
              </span>
              <span style={{ fontWeight: 600 }}>{String(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Subscale bar (ALSFRS-R domains) ─────────────────────────────────────────

function SubscaleBar({
  scores,
  scaleId,
}: {
  scores: Record<string, number>
  scaleId: string
}) {
  if (scaleId !== 'ALSFRS-R') return null

  const domains = [
    { key: 'bulbar',      label: 'Bulbar',      max: 12 },
    { key: 'fine_motor',  label: 'Fine Motor',  max: 12 },
    { key: 'gross_motor', label: 'Gross Motor', max: 12 },
    { key: 'respiratory', label: 'Respiratory', max: 12 },
  ]

  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
      {domains.map((d) => {
        const v = scores[d.key] ?? 0
        const pct = Math.round((v / d.max) * 100)
        const color = pct >= 75 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#EF4444'
        return (
          <div key={d.key} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 60 }}>
            <div style={{ fontSize: 10, color: '#6B7280' }}>{d.label}</div>
            <div style={{
              height: 4,
              borderRadius: 2,
              background: '#E5E7EB',
              width: 60,
              overflow: 'hidden',
            }}>
              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
            </div>
            <div style={{ fontSize: 10, color: '#374151', fontWeight: 600 }}>{v}/{d.max}</div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Multi-result list ────────────────────────────────────────────────────────

interface ScaleResultsProps {
  results: ScaleResult[]
  /** Show a header above the list */
  showHeader?: boolean
  /** Called when the physician clicks a result for more detail */
  onResultClick?: (result: ScaleResult) => void
}

/**
 * Renders all completed scale results for a session.
 * Suitable for embedding in the physician panel (LocalizerPanel).
 */
export function ScaleResults({ results, showHeader = true, onResultClick }: ScaleResultsProps) {
  if (results.length === 0) {
    return (
      <div style={{
        padding: '10px 14px',
        fontSize: 13,
        color: '#9CA3AF',
        fontStyle: 'italic',
        textAlign: 'center',
      }}>
        No scales completed yet
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {showHeader && (
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#6B7280',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          padding: '0 2px',
        }}>
          Completed Scales ({results.length})
        </div>
      )}
      {results.map((r) => (
        <div
          key={r.id}
          onClick={() => onResultClick?.(r)}
          style={{ cursor: onResultClick ? 'pointer' : 'default' }}
        >
          <ScaleResultCard result={r} />
        </div>
      ))}
    </div>
  )
}

// ─── Indicated-but-not-yet-administered ───────────────────────────────────────

interface PendingScalesBannerProps {
  /** Scales that are triggered but not yet completed */
  pendingScales: Array<{ scaleId: string; scaleName: string; scaleAbbreviation: string; triggerReason: string; requiresPhysician: boolean }>
}

/**
 * Banner shown in the physician panel listing exam-required scales that need
 * physician action (NIHSS, MoCA).
 */
export function PendingScalesBanner({ pendingScales }: PendingScalesBannerProps) {
  if (pendingScales.length === 0) return null

  const physicianRequired = pendingScales.filter((s) => s.requiresPhysician)
  if (physicianRequired.length === 0) return null

  return (
    <div style={{
      background: '#EFF6FF',
      border: '1px solid #BFDBFE',
      borderRadius: 8,
      padding: '10px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 14 }}>📋</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1D4ED8' }}>
          Scales requiring physician administration
        </span>
      </div>
      {physicianRequired.map((s) => (
        <div key={s.scaleId} style={{
          background: '#FFFFFF',
          border: '1px solid #DBEAFE',
          borderRadius: 6,
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: '#1E40AF' }}>
            {s.scaleAbbreviation}
          </span>
          <span style={{ fontSize: 11, color: '#6B7280' }}>{s.scaleName}</span>
          <span style={{ fontSize: 11, color: '#374151' }}>Triggered by: {s.triggerReason}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Estimate the maximum possible score for display in the score dial.
 * Falls back to a reasonable default when the scale isn't recognized.
 */
function estimateMaxScore(abbreviation: string, questionCount: number): number {
  const maxByAbbr: Record<string, number> = {
    'PHQ-9':    27,
    'GAD-7':    21,
    'HIT-6':    78,
    'MIDAS':    270, // 90 days × 3 questions (q1+q2+q3 effectively)
    'ESS':      24,
    'MoCA':     30,
    'NIHSS':    42,
    'ALSFRS-R': 48,
  }
  return maxByAbbr[abbreviation] ?? questionCount * 4
}
