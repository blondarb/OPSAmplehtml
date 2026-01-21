'use client'

import { useState } from 'react'

interface LeftSidebarProps {
  patient: any
  priorVisits: any[]
  scoreHistory: any[]
}

export default function LeftSidebar({ patient, priorVisits, scoreHistory }: LeftSidebarProps) {
  const [expandedVisit, setExpandedVisit] = useState<string | null>(priorVisits[0]?.id || null)

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getScoresByType = (type: string) => {
    return scoreHistory.filter(s => s.scale_type === type).slice(0, 4)
  }

  const getScoreTrend = (scores: any[]) => {
    if (scores.length < 2) return 'stable'
    const latest = scores[0]?.score
    const previous = scores[1]?.score
    if (latest < previous) return 'improving'
    if (latest > previous) return 'worsening'
    return 'stable'
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
      {/* Patient Card */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
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
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {patient?.first_name} {patient?.last_name}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {patient ? `${new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear()}, ${patient.gender}` : ''} #{patient?.mrn}
            </p>
          </div>
        </div>

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
        <a href="#" style={{ color: 'var(--primary)' }}>PACS viewer</a>
        <span style={{ color: 'var(--text-muted)' }}> | </span>
        <a href="#" style={{ color: 'var(--primary)' }}>VizAI</a>
        <span style={{ color: 'var(--text-muted)' }}> | </span>
        <a href="#" style={{ color: 'var(--primary)' }}>Epic</a>
      </div>

      {/* Prior Visits */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Prior Visits</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>AI Summary</span>
            <div style={{
              width: '32px',
              height: '18px',
              borderRadius: '9px',
              background: 'var(--primary)',
              position: 'relative',
              cursor: 'pointer',
            }}>
              <div style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: 'white',
                position: 'absolute',
                top: '2px',
                right: '2px',
              }}/>
            </div>
          </div>
        </div>

        {priorVisits.map((visit) => (
          <div
            key={visit.id}
            onClick={() => setExpandedVisit(expandedVisit === visit.id ? null : visit.id)}
            style={{
              background: expandedVisit === visit.id ? 'var(--bg-white)' : 'var(--bg-gray)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '8px',
              cursor: 'pointer',
              border: expandedVisit === visit.id ? '1px solid var(--primary)' : '1px solid transparent',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
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
              {visit.chief_complaint?.join(', ')}
            </div>

            {expandedVisit === visit.id && visit.clinical_notes?.ai_summary && (
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
                    fontWeight: 600,
                    fontSize: '12px',
                    color: 'var(--primary-dark)',
                    marginBottom: '8px',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                    AI Summary
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {visit.clinical_notes.ai_summary}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Score History */}
      <div style={{ padding: '12px 16px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>
            </svg>
            Score History
          </h4>
        </div>

        {['MIDAS', 'HIT6', 'PHQ9'].map((scaleType) => {
          const scores = getScoresByType(scaleType)
          const trend = getScoreTrend(scores)

          if (scores.length === 0) return null

          return (
            <div key={scaleType} style={{
              background: 'var(--bg-gray)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '8px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {scaleType === 'HIT6' ? 'HIT-6' : scaleType}
                </span>
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  color: trend === 'improving' ? '#059669' : trend === 'worsening' ? '#DC2626' : 'var(--text-muted)',
                }}>
                  {trend === 'improving' ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                    </svg>
                  ) : trend === 'worsening' ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                  )}
                  {trend.charAt(0).toUpperCase() + trend.slice(1)}
                </span>
              </div>

              {scores.map((score, idx) => (
                <div key={score.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '4px 0',
                  fontSize: '12px',
                }}>
                  <span style={{ color: 'var(--text-muted)' }}>{formatDate(score.created_at)}</span>
                  <span style={{ color: 'var(--text-primary)' }}>
                    {score.score}
                    <span style={{
                      marginLeft: '6px',
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      background: 'var(--bg-dark)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}>
                      {score.interpretation}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
