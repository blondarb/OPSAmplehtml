'use client'

import { useState } from 'react'
import type { HistorianSession } from '@/lib/historianTypes'

interface HistorianSessionPanelProps {
  sessions: HistorianSession[]
  onImport?: (session: HistorianSession) => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function HistorianSessionPanel({ sessions, onImport }: HistorianSessionPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedSection, setExpandedSection] = useState<string>('summary')

  if (!sessions || sessions.length === 0) return null

  const unreviewed = sessions.filter(s => !s.reviewed)
  const escalated = sessions.filter(s => s.safety_escalated && !s.reviewed)

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Section header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '8px',
        padding: '0 4px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.5 2A5.5 5.5 0 005 7.5c0 .88.21 1.71.58 2.45" />
            <path d="M4.5 12.5C3 13.5 2 15.37 2 17.5 2 20 4 22 6.5 22c1.5 0 2.84-.73 3.67-1.85" />
            <path d="M14.5 2A5.5 5.5 0 0120 7.5c0 .88-.21 1.71-.58 2.45" />
            <path d="M19.5 12.5c1.5 1 2.5 2.87 2.5 5 0 2.5-2 4.5-4.5 4.5-1.5 0-2.84-.73-3.67-1.85" />
            <path d="M12 2v20" />
          </svg>
          <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-primary, #1e293b)' }}>
            AI Historian
          </span>
          {unreviewed.length > 0 && (
            <span style={{
              background: '#0d9488',
              color: '#fff',
              fontSize: '0.65rem',
              fontWeight: 700,
              borderRadius: '8px',
              padding: '1px 6px',
              minWidth: '16px',
              textAlign: 'center',
            }}>
              {unreviewed.length}
            </span>
          )}
        </div>
      </div>

      {/* Safety escalation alert */}
      {escalated.length > 0 && (
        <div style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '8px',
          padding: '10px 12px',
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span style={{ color: '#ef4444', fontSize: '0.8rem', fontWeight: 600 }}>
            Safety escalation - {escalated.length} session{escalated.length > 1 ? 's' : ''} flagged
          </span>
        </div>
      )}

      {/* Session cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {sessions.map(session => {
          const isExpanded = expandedId === session.id
          const hasRedFlags = session.red_flags && session.red_flags.length > 0

          return (
            <div
              key={session.id}
              style={{
                borderRadius: '8px',
                border: session.safety_escalated
                  ? '1px solid rgba(239,68,68,0.4)'
                  : hasRedFlags
                    ? '1px solid rgba(245,158,11,0.3)'
                    : '1px solid var(--border-color, #e2e8f0)',
                background: 'var(--card-bg, #fff)',
                overflow: 'hidden',
              }}
            >
              {/* Card header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : session.id)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      background: session.session_type === 'new_patient' ? 'rgba(139,92,246,0.15)' : 'rgba(13,148,136,0.15)',
                      color: session.session_type === 'new_patient' ? '#8B5CF6' : '#0d9488',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}>
                      {session.session_type === 'new_patient' ? 'New' : 'F/U'}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-primary, #1e293b)' }}>
                      {session.patient_name || 'Patient'}
                    </span>
                    {session.safety_escalated && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#ef4444" stroke="none">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                    )}
                    {!session.reviewed && (
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: '#0d9488', display: 'inline-block',
                      }} />
                    )}
                  </div>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary, #64748b)" strokeWidth="2"
                    style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
                <div style={{ display: 'flex', gap: '12px', fontSize: '0.7rem', color: 'var(--text-secondary, #64748b)' }}>
                  <span>{formatDuration(session.duration_seconds)}</span>
                  <span>{session.question_count} questions</span>
                  <span>{formatTime(session.created_at)}</span>
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border-color, #e2e8f0)', padding: '12px' }}>
                  {/* Sub-tabs */}
                  <div style={{ display: 'flex', gap: '0', marginBottom: '12px', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                    {['summary', 'structured', 'transcript'].map(sec => (
                      <button
                        key={sec}
                        onClick={() => setExpandedSection(sec)}
                        style={{
                          padding: '6px 12px',
                          background: 'none',
                          border: 'none',
                          borderBottom: expandedSection === sec ? '2px solid #0d9488' : '2px solid transparent',
                          color: expandedSection === sec ? '#0d9488' : 'var(--text-secondary, #64748b)',
                          fontWeight: 600,
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          textTransform: 'capitalize',
                        }}
                      >
                        {sec}
                      </button>
                    ))}
                  </div>

                  {/* Red flags banner */}
                  {hasRedFlags && (
                    <div style={{
                      background: 'rgba(245,158,11,0.1)',
                      border: '1px solid rgba(245,158,11,0.3)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      marginBottom: '10px',
                    }}>
                      <div style={{ fontWeight: 600, fontSize: '0.7rem', color: '#f59e0b', marginBottom: '4px' }}>
                        Red Flags ({session.red_flags!.length})
                      </div>
                      {session.red_flags!.map((rf, i) => (
                        <div key={i} style={{ fontSize: '0.75rem', color: 'var(--text-primary, #1e293b)', marginBottom: '2px' }}>
                          <span style={{
                            display: 'inline-block',
                            width: 6, height: 6, borderRadius: '50%',
                            background: rf.severity === 'high' ? '#ef4444' : rf.severity === 'medium' ? '#f59e0b' : '#64748b',
                            marginRight: '4px',
                          }} />
                          {rf.flag}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Summary */}
                  {expandedSection === 'summary' && (
                    <div>
                      {session.narrative_summary ? (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-primary, #1e293b)', lineHeight: 1.5, margin: 0 }}>
                          {session.narrative_summary}
                        </p>
                      ) : (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontStyle: 'italic', margin: 0 }}>
                          No summary available.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Structured data */}
                  {expandedSection === 'structured' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {session.structured_output ? (
                        Object.entries(session.structured_output)
                          .filter(([, v]) => v && String(v).trim())
                          .map(([key, value]) => (
                            <div key={key}>
                              <div style={{
                                fontWeight: 600,
                                fontSize: '0.7rem',
                                color: 'var(--text-secondary, #64748b)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.03em',
                                marginBottom: '2px',
                              }}>
                                {key.replace(/_/g, ' ')}
                              </div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-primary, #1e293b)', lineHeight: 1.4 }}>
                                {String(value)}
                              </div>
                            </div>
                          ))
                      ) : (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontStyle: 'italic', margin: 0 }}>
                          No structured data available.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Transcript */}
                  {expandedSection === 'transcript' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto' }}>
                      {session.transcript && session.transcript.length > 0 ? (
                        session.transcript.map((entry, i) => (
                          <div
                            key={i}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '6px',
                              background: entry.role === 'assistant' ? 'rgba(13,148,136,0.06)' : 'rgba(139,92,246,0.06)',
                              borderLeft: `2px solid ${entry.role === 'assistant' ? '#0d9488' : '#8B5CF6'}`,
                            }}
                          >
                            <div style={{
                              fontSize: '0.65rem',
                              color: entry.role === 'assistant' ? '#0d9488' : '#8B5CF6',
                              fontWeight: 600,
                              marginBottom: '1px',
                            }}>
                              {entry.role === 'assistant' ? 'AI' : 'Patient'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-primary, #1e293b)', lineHeight: 1.4 }}>
                              {entry.text}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontStyle: 'italic', margin: 0 }}>
                          No transcript available.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    {onImport && !session.imported_to_note && (
                      <button
                        onClick={() => onImport(session)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          background: '#0d9488',
                          color: '#fff',
                          border: 'none',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        Import to Note
                      </button>
                    )}
                    {session.imported_to_note && (
                      <span style={{ fontSize: '0.75rem', color: '#22c55e', fontWeight: 600, padding: '6px 0' }}>
                        Imported
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
