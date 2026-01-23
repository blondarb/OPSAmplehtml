'use client'

import { useState } from 'react'

interface LeftSidebarProps {
  patient: any
  priorVisits: any[]
  scoreHistory: any[]
}

export default function LeftSidebar({ patient, priorVisits, scoreHistory }: LeftSidebarProps) {
  const [expandedVisit, setExpandedVisit] = useState<string | null>(priorVisits[0]?.id || null)
  const [timelineOpen, setTimelineOpen] = useState(true)
  const [recentConsultsOpen, setRecentConsultsOpen] = useState(false)
  const [aiSummaryEnabled, setAiSummaryEnabled] = useState(true)
  const [scoreHistoryOpen, setScoreHistoryOpen] = useState(true)

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const timeline = [
    { id: 'initial', label: 'Initial call', value: 'N/A', icon: 'clipboard' },
    { id: 'video', label: 'Time on video', value: 'N/A', icon: 'video' },
    { id: 'assessment', label: 'Assessment time', value: 'N/A', icon: 'clock' },
    { id: 'final', label: 'Final recommendation time', value: 'N/A', icon: 'check' },
  ]

  return (
    <aside style={{
      width: '280px',
      background: 'var(--bg-white)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
    }}>
      {/* Hospital Logo Section */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 700,
              fontSize: '14px',
            }}>
              M
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>Marshall</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>TNK | PST</div>
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
            <path d="M7 17l9.2-9.2M17 17V7H7"/>
          </svg>
        </div>
      </div>

      {/* Medical History Link */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: '#FEE2E2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
          <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Medical history</span>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
          <path d="M7 17l9.2-9.2M17 17V7H7"/>
        </svg>
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
              {patient ? `${new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear()}, ${patient.gender === 'M' ? 'M' : 'F'}` : '50, M'} # {patient?.mrn || '123123'}
            </p>
          </div>
        </div>

        {/* Non-Emergent Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '6px',
          border: '1px solid var(--primary)',
          background: 'rgba(13, 148, 136, 0.1)',
          marginBottom: '12px',
          cursor: 'pointer',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 500 }}>Non-Emergent</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
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
        <div style={{ marginBottom: '4px' }}>
          <a href="#" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Pacs viewer</a>
          <span style={{ color: 'var(--text-muted)' }}> | </span>
          <a href="#" style={{ color: 'var(--primary)', textDecoration: 'none' }}>VizAI</a>
          <span style={{ color: 'var(--text-muted)' }}> | </span>
          <a href="#" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Epic</a>
          <span style={{ color: 'var(--text-muted)' }}> | </span>
        </div>
        <a href="#" style={{ color: 'var(--primary)', textDecoration: 'none' }}>GlobalProtect</a>
      </div>

      {/* Hospitalist Section */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
          Hospitalist
        </h4>
        <button style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          color: 'var(--text-secondary)',
          fontSize: '13px',
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: '2px dashed var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          Add Hospitalist
        </button>
      </div>

      {/* Timeline Section */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
        <div
          onClick={() => setTimelineOpen(!timelineOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            marginBottom: timelineOpen ? '16px' : 0,
          }}
        >
          <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Timeline
          </h4>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="2"
            style={{ transform: timelineOpen ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}
          >
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>

        {timelineOpen && (
          <div style={{ position: 'relative', paddingLeft: '20px' }}>
            {/* Vertical line */}
            <div style={{
              position: 'absolute',
              left: '15px',
              top: '16px',
              bottom: '16px',
              width: '2px',
              background: 'var(--border)',
            }}/>

            {timeline.map((item, index) => (
              <div key={item.id} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                marginBottom: index < timeline.length - 1 ? '16px' : 0,
                position: 'relative',
              }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'var(--bg-gray)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                  flexShrink: 0,
                  position: 'relative',
                  zIndex: 1,
                }}>
                  {item.icon === 'clipboard' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>
                      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                    </svg>
                  )}
                  {item.icon === 'video' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                    </svg>
                  )}
                  {item.icon === 'clock' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                  )}
                  {item.icon === 'check' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--primary)' }}>{item.label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>{item.value}</div>
                </div>
                {index === 0 && (
                  <span style={{
                    position: 'absolute',
                    left: '-4px',
                    top: '10px',
                    fontSize: '10px',
                    color: '#DC2626',
                    fontWeight: 600,
                  }}>FLOOR</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Prior Visits Section */}
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <h4>Prior Visits</h4>
          <div className="ai-toggle">
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>AI Summary</span>
            <div
              className={`toggle-switch ${aiSummaryEnabled ? 'active' : ''}`}
              onClick={() => setAiSummaryEnabled(!aiSummaryEnabled)}
            />
          </div>
        </div>
        <div className="sidebar-section-content">
          {priorVisits.slice(0, 3).map((visit) => (
            <div
              key={visit.id}
              className={`prior-visit-card ${expandedVisit === visit.id ? 'expanded' : ''}`}
              onClick={() => setExpandedVisit(expandedVisit === visit.id ? null : visit.id)}
            >
              <div className="visit-header">
                <span className="visit-date">{formatDate(visit.visit_date)}</span>
                <span className={`visit-type badge ${visit.visit_type === 'new_patient' ? 'badge-green' : 'badge-blue'}`}>
                  {visit.visit_type === 'new_patient' ? 'New Patient' : 'Follow-up'}
                </span>
              </div>
              <div className="visit-chief">{visit.chief_complaint?.join(', ') || 'General consultation'}</div>
              <div className="visit-provider">Dr. Smith</div>
              {expandedVisit === visit.id && aiSummaryEnabled && (
                <div className="visit-expanded-content" style={{ display: 'block' }}>
                  <div className="ai-summary-box">
                    <div className="ai-summary-header">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                      </svg>
                      AI Summary
                    </div>
                    <div className="ai-summary-content">
                      {visit.clinical_notes?.ai_summary || 'Patient reports improved symptoms with current treatment. Continue current regimen and reassess at next visit.'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Score History Section */}
      <div className={`score-history-section ${scoreHistoryOpen ? '' : 'collapsed'}`}>
        <div className="score-history-header" onClick={() => setScoreHistoryOpen(!scoreHistoryOpen)}>
          <h4>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>
            </svg>
            Score History
          </h4>
          <svg className="score-history-toggle" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        <div className="score-history-content">
          {/* Group scores by type - dynamically get unique scale types */}
          {(() => {
            // Get unique scale types from the data
            const scaleTypes = [...new Set(scoreHistory.map(s => s.scale_type))].filter(Boolean)
            // If no data, show default scales
            const displayTypes = scaleTypes.length > 0 ? scaleTypes : []

            return displayTypes.map((scaleType) => {
              const scaleScores = scoreHistory.filter(s => s.scale_type === scaleType)
              if (scaleScores.length === 0) return null

              // For MOCA, higher is better. For others, lower is better
              const lowerIsBetter = !scaleType.includes('MOCA')
              const trend = scaleScores.length > 1
                ? (lowerIsBetter
                  ? (scaleScores[0].score < scaleScores[1].score ? 'improving' : scaleScores[0].score > scaleScores[1].score ? 'worsening' : 'stable')
                  : (scaleScores[0].score > scaleScores[1].score ? 'improving' : scaleScores[0].score < scaleScores[1].score ? 'worsening' : 'stable'))
                : 'stable'

              return (
                <div key={scaleType} className="score-card">
                  <div className="score-card-header">
                    <span className="score-card-title">{scaleType}</span>
                    <span className={`score-card-trend ${trend}`}>
                      {trend === 'improving' && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                          <polyline points="17 6 23 6 23 12"/>
                        </svg>
                      )}
                      {trend === 'stable' && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                      )}
                      {trend === 'worsening' && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
                          <polyline points="17 18 23 18 23 12"/>
                        </svg>
                      )}
                      {trend.charAt(0).toUpperCase() + trend.slice(1)}
                    </span>
                  </div>
                  <div className="score-history-list">
                    {scaleScores.slice(0, 4).map((score) => (
                      <div key={score.id} className="score-history-item clickable">
                        <span className="date">{formatDate(score.created_at)}</span>
                        <span className="value">{score.score} <span className="interpretation">{score.interpretation}</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          })()}

          {/* Default scores if none exist */}
          {scoreHistory.length === 0 && (
            <>
              <div className="score-card">
                <div className="score-card-header">
                  <span className="score-card-title">MIDAS</span>
                  <span className="score-card-trend improving">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                      <polyline points="17 6 23 6 23 12"/>
                    </svg>
                    Improving
                  </span>
                </div>
                <div className="score-history-list">
                  <div className="score-history-item clickable">
                    <span className="date">Jan 16, 2026</span>
                    <span className="value">18 <span className="interpretation">Moderate</span></span>
                  </div>
                  <div className="score-history-item clickable">
                    <span className="date">Jan 10, 2026</span>
                    <span className="value">24 <span className="interpretation">Moderate</span></span>
                  </div>
                  <div className="score-history-item clickable">
                    <span className="date">Dec 15, 2025</span>
                    <span className="value">42 <span className="interpretation">Severe</span></span>
                  </div>
                </div>
              </div>
              <div className="score-card">
                <div className="score-card-header">
                  <span className="score-card-title">HIT-6</span>
                  <span className="score-card-trend stable">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Stable
                  </span>
                </div>
                <div className="score-history-list">
                  <div className="score-history-item">
                    <span className="date">Jan 16, 2026</span>
                    <span className="value">58 <span className="interpretation">Substantial</span></span>
                  </div>
                  <div className="score-history-item">
                    <span className="date">Jan 10, 2026</span>
                    <span className="value">60 <span className="interpretation">Severe</span></span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
