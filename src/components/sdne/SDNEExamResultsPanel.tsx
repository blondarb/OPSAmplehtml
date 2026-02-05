'use client'

import { useState, useMemo } from 'react'
import { SDNESessionResult, SDNEDomain, SDNE_FLAG_THEME, SDNE_FLAG_KEY, SDNE_FLAG_LABELS } from '@/lib/sdneTypes'
import { getLatestSDNESessionForPatient, getAllSDNESessionsForPatient } from '@/lib/sdneSampleData'
import { SDNEFlagChip } from './SDNEFlagChip'
import { SDNEDomainSummary } from './SDNEDomainSummary'
import { SDNEInterpretation } from './SDNEInterpretation'

interface SDNEExamResultsPanelProps {
  // Patient MRN for looking up patient-specific history
  patientMrn?: string
  // Chief complaints/referral reasons from the patient's visit
  chiefComplaints?: string[]
  consultCategories?: string[]
  // Optional: pass in a specific session if loading from database
  session?: SDNESessionResult
}

/**
 * Format duration in minutes and seconds
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Calculate days ago from a date
 */
function daysAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffTime = Math.abs(now.getTime() - date.getTime())
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return `${diffDays} days ago`
}

/**
 * SDNE Exam Results Panel - Expandable accordion for Physical Exams tab
 *
 * Supports:
 * - Patient-specific SDNE history with historical comparison
 * - Referral-based profile mapping as fallback
 * - Domain trend visualization across visits
 */
export function SDNEExamResultsPanel({
  patientMrn,
  chiefComplaints = [],
  consultCategories = [],
  session: providedSession,
}: SDNEExamResultsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [selectedSessionIndex, setSelectedSessionIndex] = useState(0)

  // Get all SDNE sessions for patient (historical data)
  const allSessions = useMemo(() => {
    if (providedSession) return [providedSession]
    if (patientMrn) {
      const history = getAllSDNESessionsForPatient(patientMrn)
      if (history.length > 0) return history
    }
    // Fall back to referral-based mapping
    return [getLatestSDNESessionForPatient(patientMrn, chiefComplaints, consultCategories)]
  }, [providedSession, patientMrn, chiefComplaints, consultCategories])

  const session = allSessions[selectedSessionIndex]
  const hasHistory = allSessions.length > 1

  const flagColors = SDNE_FLAG_THEME[SDNE_FLAG_KEY[session.sessionFlag]]
  const hasPatterns = session.detectedPatterns.length > 0
  const hasRecommendations = session.addOnRecommendations.length > 0

  // Calculate domain trends if we have history
  const domainTrends = useMemo(() => {
    if (!hasHistory || selectedSessionIndex === allSessions.length - 1) return null

    const currentFlags = session.domainFlags
    const priorFlags = allSessions[selectedSessionIndex + 1]?.domainFlags
    if (!priorFlags) return null

    const flagOrder: Record<string, number> = { GREEN: 0, YELLOW: 1, RED: 2, INVALID: 3, NOT_PERFORMED: 4 }
    const trends: Record<SDNEDomain, 'improved' | 'stable' | 'worsened'> = {} as any

    const domains: SDNEDomain[] = ['Cognition', 'Oculomotor', 'Facial', 'Motor', 'Coordination', 'Language', 'Gait']
    domains.forEach(domain => {
      const currentScore = flagOrder[currentFlags[domain]] ?? 0
      const priorScore = flagOrder[priorFlags[domain]] ?? 0
      if (currentScore < priorScore) {
        trends[domain] = 'improved'
      } else if (currentScore > priorScore) {
        trends[domain] = 'worsened'
      } else {
        trends[domain] = 'stable'
      }
    })

    return trends
  }, [hasHistory, selectedSessionIndex, session.domainFlags, allSessions])

  const handleToggle = () => {
    setIsExpanded(prev => !prev)
  }

  return (
    <div
      style={{ border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '8px', overflow: 'hidden' }}
    >
      {/* Header - clickable accordion toggle */}
      <button
        type="button"
        onClick={handleToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: isExpanded ? 'var(--bg-dark)' : 'transparent',
          cursor: 'pointer',
          transition: 'background 0.15s ease',
          width: '100%',
          border: 'none',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* VR Headset icon */}
          <span
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: flagColors.bg,
              border: `1px solid ${flagColors.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={flagColors.main} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4l-2 2-2-2H4a2 2 0 0 1-2-2z"/>
              <circle cx="8" cy="12" r="2"/>
              <circle cx="16" cy="12" r="2"/>
            </svg>
          </span>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                SDNE Core-15 Exam Results
              </span>
              <SDNEFlagChip flag={session.sessionFlag} size="small" />
              {hasHistory && (
                <span style={{
                  fontSize: '10px',
                  fontWeight: 500,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--primary)',
                  color: 'white',
                }}>
                  {allSessions.length} exams
                </span>
              )}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Digital neurologic screening • {formatDuration(session.totalDurationSeconds || 0)} •{' '}
              {session.confidenceLevel} confidence
              {hasHistory && selectedSessionIndex === 0 && ' • Most recent'}
            </span>
          </div>
        </div>

        {/* Expand/collapse chevron */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            color: 'var(--text-muted)',
            flexShrink: 0,
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ padding: '16px', borderTop: '1px solid var(--border)' }}
        >
          {/* Session selector if multiple exams */}
          {hasHistory && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Exam History
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {allSessions.map((s, idx) => {
                  const isSelected = idx === selectedSessionIndex
                  const sColors = SDNE_FLAG_THEME[SDNE_FLAG_KEY[s.sessionFlag]]
                  return (
                    <button
                      key={s.sessionId}
                      onClick={() => setSelectedSessionIndex(idx)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: isSelected ? `2px solid var(--primary)` : `1px solid ${sColors.border}`,
                        background: isSelected ? 'var(--bg-white)' : sColors.bg,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: isSelected ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: sColors.main,
                          }}
                        />
                        <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                          {formatDate(s.examDate)}
                        </span>
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {daysAgo(s.examDate)} • {SDNE_FLAG_LABELS[s.sessionFlag]}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Domain Trends Banner (if comparing to prior) */}
          {domainTrends && (
            <div style={{
              marginBottom: '16px',
              padding: '12px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #F0FDF4 0%, #ECFEFF 100%)',
              border: '1px solid #BBF7D0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#15803D' }}>
                  Change from Prior Exam ({formatDate(allSessions[selectedSessionIndex + 1].examDate)})
                </span>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {Object.entries(domainTrends).map(([domain, trend]) => {
                  if (trend === 'stable') return null
                  const isImproved = trend === 'improved'
                  return (
                    <span
                      key={domain}
                      style={{
                        fontSize: '11px',
                        fontWeight: 500,
                        padding: '4px 8px',
                        borderRadius: '4px',
                        background: isImproved ? '#DCFCE7' : '#FEE2E2',
                        color: isImproved ? '#166534' : '#991B1B',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {isImproved ? '↑' : '↓'} {domain}
                    </span>
                  )
                })}
                {Object.values(domainTrends).every(t => t === 'stable') && (
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    All domains stable from prior exam
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Domain Summary Grid */}
          <SDNEDomainSummary domainFlags={session.domainFlags} />

          {/* Detected Patterns */}
          {hasPatterns && (
            <div style={{ marginTop: '16px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                Detected Patterns
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {session.detectedPatterns.map((pattern) => {
                  const confidenceColor =
                    pattern.confidence === 'HIGH'
                      ? SDNE_FLAG_THEME.red
                      : pattern.confidence === 'MEDIUM'
                      ? SDNE_FLAG_THEME.yellow
                      : SDNE_FLAG_THEME.green

                  return (
                    <div
                      key={pattern.patternId}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        backgroundColor: confidenceColor.bg,
                        border: `1px solid ${confidenceColor.border}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {pattern.description}
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: confidenceColor.main,
                            color: '#fff',
                          }}
                        >
                          {pattern.confidence}
                        </span>
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '16px' }}>
                        {pattern.supportingFindings.map((finding, idx) => (
                          <li key={idx} style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                            {finding}
                          </li>
                        ))}
                      </ul>
                      <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                        Supporting tasks: {pattern.supportingTasks.join(', ')}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Clinical Interpretation */}
          <div style={{ marginTop: '16px' }}>
            <SDNEInterpretation session={session} />
          </div>

          {/* Add-On Recommendations */}
          {hasRecommendations && (
            <div style={{ marginTop: '16px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                Recommended Add-On Assessments
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px' }}>
                {session.addOnRecommendations.map((rec) => (
                  <div
                    key={rec.addOnId}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-gray)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {rec.name}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {Math.ceil(rec.estimatedDurationSeconds / 60)} min
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                      {rec.rationale}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer with exam date */}
          <div
            style={{
              marginTop: '16px',
              paddingTop: '12px',
              borderTop: '1px solid var(--border)',
              fontSize: '11px',
              color: 'var(--text-muted)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>
              Exam performed: {new Date(session.examDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span style={{ fontFamily: 'monospace' }}>Session: {session.sessionId}</span>
          </div>
        </div>
      )}
    </div>
  )
}
