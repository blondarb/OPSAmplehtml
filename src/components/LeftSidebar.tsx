'use client'

import { useState, useEffect } from 'react'

interface LeftSidebarProps {
  patient: any
  priorVisits: any[]
  scoreHistory: any[]
}

export default function LeftSidebar({ patient, priorVisits, scoreHistory }: LeftSidebarProps) {
  const [expandedVisit, setExpandedVisit] = useState<string | null>(priorVisits[0]?.id || null)
  const [aiSummaryEnabled, setAiSummaryEnabled] = useState(true)
  const [scoreHistoryOpen, setScoreHistoryOpen] = useState(true)
  const [localTime, setLocalTime] = useState<string>('--:--')

  // Update local time every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const timeString = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
      })
      setLocalTime(timeString)
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <aside style={{
      width: '260px',
      background: 'var(--bg-white)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
    }}>
      {/* Hospital/Location Section with Local Time */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'var(--bg-dark)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Marshall</h3>
            <p style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
              {localTime}
            </p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ cursor: 'pointer' }}>
            <path d="M7 17l9.2-9.2M17 17V7H7"/>
          </svg>
        </div>
      </div>

      {/* Patient Card */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'var(--bg-dark)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {patient?.first_name || 'Test'} {patient?.last_name || 'Test'}
              </h3>
              <button style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                color: 'var(--text-muted)',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {patient ? `${new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear()}, ${patient.gender === 'M' ? 'M' : 'F'}` : '50, M'} #{patient?.mrn || '123123'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            border: 'none',
            background: 'var(--primary)',
            color: 'white',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
            Video
          </button>
          <button style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 12px',
            borderRadius: '8px',
            cursor: 'pointer',
            border: 'none',
            background: 'var(--primary-light)',
            color: 'white',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Quick Links */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
        <a href="#" style={{ color: 'var(--primary)', textDecoration: 'none' }}>PACS viewer</a>
        <span style={{ color: 'var(--text-muted)' }}> | </span>
        <a href="#" style={{ color: 'var(--primary)', textDecoration: 'none' }}>VizAI</a>
        <span style={{ color: 'var(--text-muted)' }}> | </span>
        <a href="#" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Epic</a>
      </div>

      {/* Prior Visits Section */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Prior Visits</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>AI Summary</span>
            <button
              onClick={() => setAiSummaryEnabled(!aiSummaryEnabled)}
              style={{
                width: '36px',
                height: '20px',
                borderRadius: '10px',
                border: 'none',
                background: aiSummaryEnabled ? 'var(--primary)' : 'var(--border)',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.2s',
              }}
            >
              <div style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: 'white',
                position: 'absolute',
                top: '2px',
                left: aiSummaryEnabled ? '18px' : '2px',
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(priorVisits.length > 0 ? priorVisits.slice(0, 4) : [
            {
              id: '1',
              visit_date: '2026-01-10',
              visit_type: 'follow_up',
              chief_complaint: ['Migraine follow-up'],
              provider: 'Dr. Martinez',
              clinical_notes: {
                ai_summary: 'Headache frequency reduced from 15 to 8 days/month on topiramate 100mg. MIDAS improved 42→24. No significant side effects. Continue current regimen, recheck in 3 months.'
              }
            },
            {
              id: '2',
              visit_date: '2025-12-15',
              visit_type: 'follow_up',
              chief_complaint: ['Chronic migraine', 'Medication adjustment'],
              provider: 'Dr. Martinez',
              clinical_notes: {
                ai_summary: 'Suboptimal response to propranolol. Transitioned to topiramate 25mg with 2-week titration to 100mg. MRI brain unremarkable. Discussed lifestyle modifications.'
              }
            },
            {
              id: '3',
              visit_date: '2025-11-01',
              visit_type: 'new_patient',
              chief_complaint: ['New onset headaches', 'Memory concerns'],
              provider: 'Dr. Smith',
              clinical_notes: {
                ai_summary: 'Initial eval for 3-month history of daily headaches with mild cognitive complaints. MoCA 26/30 (normal). Started propranolol 40mg BID. Ordered MRI brain, labs.'
              }
            },
          ]).map((visit) => {
            const isExpanded = expandedVisit === visit.id
            return (
              <div
                key={visit.id}
                onClick={() => setExpandedVisit(isExpanded ? null : visit.id)}
                style={{
                  background: isExpanded ? 'var(--bg-white)' : 'var(--bg-gray)',
                  border: isExpanded ? '1px solid var(--primary)' : '1px solid transparent',
                  borderRadius: '8px',
                  padding: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                    {formatDate(visit.visit_date)}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: visit.visit_type === 'new_patient' ? '#D1FAE5' : '#DBEAFE',
                    color: visit.visit_type === 'new_patient' ? '#059669' : '#1D4ED8',
                  }}>
                    {visit.visit_type === 'new_patient' ? 'New Patient' : 'Follow-up'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  {Array.isArray(visit.chief_complaint) ? visit.chief_complaint.join(', ') : visit.chief_complaint || 'General consultation'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{visit.provider || 'Dr. Smith'}</div>

                {/* AI Summary - Expanded */}
                {isExpanded && aiSummaryEnabled && (
                  <div style={{
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border)',
                  }}>
                    <div style={{
                      background: 'linear-gradient(135deg, #F0FDFA 0%, #ECFDF5 100%)',
                      border: '1px solid #A7F3D0',
                      borderRadius: '8px',
                      padding: '12px',
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '8px',
                        fontWeight: 600,
                        fontSize: '12px',
                        color: 'var(--primary-dark)',
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                        AI Summary
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {visit.clinical_notes?.ai_summary || 'Patient reports improved symptoms with current treatment. Continue current regimen and reassess at next visit.'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Score History Section */}
      <div style={{ padding: '12px 16px' }}>
        <div
          onClick={() => setScoreHistoryOpen(!scoreHistoryOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            marginBottom: scoreHistoryOpen ? '12px' : 0,
          }}
        >
          <h4 style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>
            </svg>
            Score History
          </h4>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="2"
            style={{
              transform: scoreHistoryOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.2s',
            }}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>

        {scoreHistoryOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Render actual score history or defaults */}
            {(() => {
              const scaleTypes = [...new Set(scoreHistory.map(s => s.scale_type))].filter(Boolean)
              const hasData = scaleTypes.length > 0

              const defaultScores = [
                {
                  type: 'MIDAS',
                  trend: 'improving' as const,
                  scores: [
                    { date: 'Jan 16, 2026', value: 18, interpretation: 'Moderate' },
                    { date: 'Jan 10, 2026', value: 24, interpretation: 'Moderate' },
                    { date: 'Dec 15, 2025', value: 42, interpretation: 'Severe' },
                    { date: 'Nov 1, 2025', value: 56, interpretation: 'Severe' },
                  ],
                },
                {
                  type: 'HIT-6',
                  trend: 'stable' as const,
                  scores: [
                    { date: 'Jan 16, 2026', value: 58, interpretation: 'Substantial' },
                    { date: 'Jan 10, 2026', value: 60, interpretation: 'Severe' },
                    { date: 'Dec 15, 2025', value: 62, interpretation: 'Severe' },
                  ],
                },
                {
                  type: 'PHQ-9',
                  trend: 'improving' as const,
                  scores: [
                    { date: 'Jan 16, 2026', value: 6, interpretation: 'Mild' },
                    { date: 'Dec 15, 2025', value: 11, interpretation: 'Moderate' },
                  ],
                },
              ]

              const dataToRender = hasData
                ? scaleTypes.map(scaleType => {
                    const scaleScores = scoreHistory.filter(s => s.scale_type === scaleType)
                    const lowerIsBetter = !scaleType.includes('MOCA')
                    const trend = scaleScores.length > 1
                      ? (lowerIsBetter
                        ? (scaleScores[0].score < scaleScores[1].score ? 'improving' : scaleScores[0].score > scaleScores[1].score ? 'worsening' : 'stable')
                        : (scaleScores[0].score > scaleScores[1].score ? 'improving' : scaleScores[0].score < scaleScores[1].score ? 'worsening' : 'stable'))
                      : 'stable'
                    return {
                      type: scaleType,
                      trend: trend as 'improving' | 'stable' | 'worsening',
                      scores: scaleScores.slice(0, 4).map(s => ({
                        date: formatDate(s.created_at),
                        value: s.score,
                        interpretation: s.interpretation,
                      })),
                    }
                  })
                : defaultScores

              return dataToRender.map(scale => (
                <ScoreCard key={scale.type} scale={scale} />
              ))
            })()}
          </div>
        )}
      </div>
    </aside>
  )
}

// Score Card Component
interface ScoreCardProps {
  scale: {
    type: string
    trend: 'improving' | 'stable' | 'worsening'
    scores: { date: string; value: number; interpretation: string }[]
  }
}

function ScoreCard({ scale }: ScoreCardProps) {
  const trendColors = {
    improving: '#10B981',
    stable: '#6B7280',
    worsening: '#EF4444',
  }

  return (
    <div style={{
      background: 'var(--bg-gray)',
      borderRadius: '8px',
      padding: '12px',
    }}>
      {/* Header with title and trend */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px',
      }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {scale.type}
        </span>
        <span style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '11px',
          fontWeight: 500,
          color: trendColors[scale.trend],
        }}>
          {scale.trend === 'improving' && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
              <polyline points="17 6 23 6 23 12"/>
            </svg>
          )}
          {scale.trend === 'stable' && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          )}
          {scale.trend === 'worsening' && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
              <polyline points="17 18 23 18 23 12"/>
            </svg>
          )}
          {scale.trend.charAt(0).toUpperCase() + scale.trend.slice(1)}
        </span>
      </div>

      {/* Score list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {scale.scores.map((score, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '6px 8px',
              borderRadius: '4px',
              background: 'var(--bg-white)',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{score.date}</span>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
              {score.value}{' '}
              <span style={{
                fontWeight: 400,
                color: 'var(--text-secondary)',
                fontSize: '11px',
              }}>
                {score.interpretation}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
