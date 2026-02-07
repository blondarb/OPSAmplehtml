'use client'

import { useState, useEffect } from 'react'
import HistorianSessionPanel from './HistorianSessionPanel'
import type { PatientMedication, PatientAllergy } from '@/lib/medicationTypes'

interface ChartPrepOutput {
  summary?: string
  alerts?: string
  visitPurpose?: string
  suggestedHPI?: string
  suggestedAssessment?: string
  suggestedPlan?: string
}

interface LeftSidebarProps {
  patient: any
  priorVisits: any[]
  scoreHistory: any[]
  patientMessages?: any[]
  historianSessions?: any[]
  onImportHistorian?: (session: any) => void
  isOpen?: boolean
  onClose?: () => void
  medications?: PatientMedication[]
  allergies?: PatientAllergy[]
  // Chart Prep viewer
  chartPrepOutput?: ChartPrepOutput | null
  isChartPrepProcessing?: boolean
  onOpenVoiceDrawer?: () => void
}

export default function LeftSidebar({ patient, priorVisits, scoreHistory, patientMessages = [], historianSessions = [], onImportHistorian, isOpen = true, onClose, medications = [], allergies = [], chartPrepOutput, isChartPrepProcessing, onOpenVoiceDrawer }: LeftSidebarProps) {
  const [expandedVisit, setExpandedVisit] = useState<string | null>(priorVisits[0]?.id || null)
  const [aiSummaryEnabled, setAiSummaryEnabled] = useState(true)
  const [scoreHistoryOpen, setScoreHistoryOpen] = useState(true)
  const [priorVisitsOpen, setPriorVisitsOpen] = useState(true)
  const [medsOpen, setMedsOpen] = useState(true)
  const [localTime, setLocalTime] = useState<string>('--:--')
  const [viewingNoteId, setViewingNoteId] = useState<string | null>(null)

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
    <>
    <style>{`
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `}</style>
    {/* Mobile overlay backdrop */}
    <div
      className={`sidebar-overlay ${isOpen ? 'show' : ''}`}
      onClick={onClose}
    />
    <aside className={`left-sidebar ${isOpen ? 'open' : ''}`} style={{
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
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Meridian Neurology</h3>
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
      <div data-tour="patient-info" style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
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

      {/* Chart Prep Summary Panel */}
      {(chartPrepOutput || isChartPrepProcessing) && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '10px',
          }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: isChartPrepProcessing
                ? 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)'
                : 'linear-gradient(135deg, #EF4444 0%, #F87171 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {isChartPrepProcessing ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                </svg>
              )}
            </div>
            <h4 style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
              flex: 1,
            }}>
              Chart Prep Notes
            </h4>
            {onOpenVoiceDrawer && (
              <button
                onClick={onOpenVoiceDrawer}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--primary)',
                  fontSize: '12px',
                  padding: 0,
                }}
              >
                View
              </button>
            )}
          </div>

          {isChartPrepProcessing ? (
            <div style={{
              padding: '12px',
              background: 'linear-gradient(135deg, #F0FDFA 0%, #CCFBF1 100%)',
              borderRadius: '6px',
              border: '1px solid #5EEAD4',
            }}>
              <p style={{ fontSize: '12px', color: '#0D9488', margin: 0 }}>
                Processing your chart review notes...
              </p>
            </div>
          ) : chartPrepOutput && (
            <>
              {/* Alerts */}
              {chartPrepOutput.alerts && (
                <div style={{
                  padding: '8px 10px',
                  background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
                  borderRadius: '6px',
                  marginBottom: '8px',
                  border: '1px solid #EF4444',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#991B1B" strokeWidth="2" style={{ flexShrink: 0, marginTop: '1px' }}>
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <p style={{ fontSize: '11px', color: '#991B1B', margin: 0, lineHeight: 1.4 }}>
                      {chartPrepOutput.alerts.length > 150 ? chartPrepOutput.alerts.slice(0, 150) + '...' : chartPrepOutput.alerts}
                    </p>
                  </div>
                </div>
              )}

              {/* Summary */}
              {(chartPrepOutput.summary || chartPrepOutput.visitPurpose) && (
                <div style={{
                  padding: '8px 10px',
                  background: 'var(--bg-gray)',
                  borderRadius: '6px',
                  borderLeft: '3px solid var(--primary)',
                }}>
                  <p style={{
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    margin: 0,
                    lineHeight: 1.5,
                  }}>
                    {(chartPrepOutput.summary || chartPrepOutput.visitPurpose || '').slice(0, 200)}
                    {(chartPrepOutput.summary || chartPrepOutput.visitPurpose || '').length > 200 && '...'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Medications & Allergies Summary */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={() => setMedsOpen(!medsOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            marginBottom: medsOpen ? '10px' : 0,
            width: '100%',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="2"
            style={{
              transform: medsOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.2s',
            }}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          <h4 style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
              <path d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-6 9h6m-6 4h4"/>
            </svg>
            Medications
            {medications.filter(m => m.is_active).length > 0 && (
              <span style={{
                background: 'var(--primary)',
                color: 'white',
                borderRadius: '10px',
                padding: '1px 7px',
                fontSize: '11px',
                fontWeight: 600,
              }}>
                {medications.filter(m => m.is_active).length}
              </span>
            )}
          </h4>
        </button>

        {medsOpen && (
          <div>
            {/* Severe/life-threatening allergy alerts */}
            {(allergies ?? []).filter(a => a.is_active && (a.severity === 'severe' || a.severity === 'life-threatening')).length > 0 && (
              <div style={{
                background: '#FEE2E2',
                border: '1px solid #FCA5A5',
                borderLeft: '4px solid #EF4444',
                borderRadius: '0 8px 8px 0',
                padding: '8px 10px',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '6px',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" style={{ flexShrink: 0, marginTop: '1px' }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div style={{ fontSize: '11px', color: '#991B1B', fontWeight: 500 }}>
                  {(allergies ?? []).filter(a => a.is_active && (a.severity === 'severe' || a.severity === 'life-threatening')).map(a =>
                    `${a.allergen}${a.reaction ? ` (${a.reaction})` : ''}`
                  ).join(', ')}
                </div>
              </div>
            )}

            {/* Medication list */}
            {medications.filter(m => m.is_active).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {medications.filter(m => m.is_active).map(med => (
                  <div key={med.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}>
                    <div style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: 'var(--primary)',
                      flexShrink: 0,
                    }} />
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{med.medication_name}</span>
                    {med.dosage && <span style={{ color: 'var(--text-muted)' }}>{med.dosage}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '4px 0' }}>
                No active medications
              </div>
            )}

            {/* Active allergies summary */}
            {(allergies ?? []).filter(a => a.is_active).length > 0 && (
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Allergies</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {(allergies ?? []).filter(a => a.is_active).map(a => a.allergen).join(', ')}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Prior Visits Section */}
      <div data-tour="prior-visits" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: priorVisitsOpen ? '12px' : 0,
        }}>
          <button
            onClick={() => setPriorVisitsOpen(!priorVisitsOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="2"
              style={{
                transform: priorVisitsOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.2s',
              }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Prior Visits</h4>
          </button>
          {priorVisitsOpen && (
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
          )}
        </div>

        {priorVisitsOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {priorVisits.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No prior visits on record
            </div>
          ) : priorVisits.slice(0, 4).map((visit) => {
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

                {/* Expanded Content */}
                {isExpanded && (
                  <div style={{
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border)',
                  }}>
                    {/* AI Summary */}
                    {aiSummaryEnabled && (
                      <div style={{
                        background: 'var(--ai-summary-bg, linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%))',
                        border: '1px solid var(--ai-summary-border, #FCD34D)',
                        borderRadius: '8px',
                        padding: '12px',
                        marginBottom: '10px',
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginBottom: '8px',
                          fontWeight: 600,
                          fontSize: '12px',
                          color: 'var(--ai-summary-header, #B45309)',
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#F59E0B">
                            <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/>
                          </svg>
                          AI Summary
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          {visit.clinical_notes?.ai_summary || 'Patient reports improved symptoms with current treatment. Continue current regimen and reassess at next visit.'}
                        </div>
                      </div>
                    )}

                    {/* View Full Note Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setViewingNoteId(visit.id)
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-white)',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--primary)'
                        e.currentTarget.style.color = 'var(--primary)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)'
                        e.currentTarget.style.color = 'var(--text-secondary)'
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10 9 9 9 8 9"/>
                      </svg>
                      View Full Note
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          </div>
        )}
      </div>

      {/* Score History Section */}
      <div style={{ padding: '12px 16px' }}>
        <button
          onClick={() => setScoreHistoryOpen(!scoreHistoryOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            marginBottom: scoreHistoryOpen ? '12px' : 0,
          }}
        >
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
          <h4 style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            margin: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>
            </svg>
            Score History
          </h4>
        </button>

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

              if (!hasData) {
                return (
                  <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    No score history available
                  </div>
                )
              }

              return scaleTypes.map(scaleType => {
                    const scaleScores = scoreHistory.filter(s => s.scale_type === scaleType)
                    const lowerIsBetter = !scaleType.includes('MOCA')
                    const trend = scaleScores.length > 1
                      ? (lowerIsBetter
                        ? (scaleScores[0].score < scaleScores[1].score ? 'improving' : scaleScores[0].score > scaleScores[1].score ? 'worsening' : 'stable')
                        : (scaleScores[0].score > scaleScores[1].score ? 'improving' : scaleScores[0].score < scaleScores[1].score ? 'worsening' : 'stable'))
                      : 'stable'
                    return (
                      <ScoreCard key={scaleType} scale={{
                        type: scaleType,
                        trend: trend as 'improving' | 'stable' | 'worsening',
                        scores: scaleScores.slice(0, 4).map(s => ({
                          date: formatDate(s.created_at),
                          value: s.score,
                          interpretation: s.interpretation,
                        })),
                      }} />
                    )
                  })
            })()}
          </div>
        )}
      </div>
      {/* Patient Messages Section */}
      {patientMessages.length > 0 && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <h4 style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            margin: '0 0 12px 0',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            Patient Messages
            <span style={{
              background: '#8B5CF6',
              color: '#fff',
              borderRadius: '10px',
              padding: '1px 7px',
              fontSize: '11px',
              fontWeight: 600,
              marginLeft: '4px',
            }}>
              {patientMessages.filter((m: any) => !m.is_read).length || patientMessages.length}
            </span>
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {patientMessages.slice(0, 5).map((msg: any) => (
              <div
                key={msg.id}
                style={{
                  background: msg.is_read ? 'var(--bg-gray)' : 'rgba(139,92,246,0.08)',
                  border: msg.is_read ? '1px solid transparent' : '1px solid rgba(139,92,246,0.2)',
                  borderRadius: '8px',
                  padding: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {msg.patient_name}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {new Date(msg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                {msg.subject && (
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '2px' }}>
                    {msg.subject}
                  </div>
                )}
                <div style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {msg.body}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Historian Sessions */}
      {historianSessions.length > 0 && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <HistorianSessionPanel
            sessions={historianSessions}
            onImport={onImportHistorian}
          />
        </div>
      )}
    </aside>

    {/* Full Note Modal */}
    {(() => {
      const viewingVisitNote = viewingNoteId ? priorVisits.find(v => v.id === viewingNoteId) : null
      if (!viewingNoteId || !viewingVisitNote) return null

      const cn = viewingVisitNote?.clinical_notes
      const sections = cn ? [
        { title: 'History of Present Illness', content: cn.hpi },
        { title: 'Review of Systems', content: cn.ros },
        { title: 'Physical Examination', content: cn.exam },
        { title: 'Assessment', content: cn.assessment },
        { title: 'Plan', content: cn.plan },
      ].filter(s => s.content) : []

      return (
        <>
          <div
            onClick={() => setViewingNoteId(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 2000,
            }}
          />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '90%',
            maxWidth: '800px',
            maxHeight: '85vh',
            background: 'var(--bg-white)',
            borderRadius: '16px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            zIndex: 2001,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-gray)',
            }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  Clinical Note
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                  {viewingVisitNote.visit_date ? formatDate(viewingVisitNote.visit_date) : ''}{viewingVisitNote.provider ? ` - ${viewingVisitNote.provider}` : ''}
                  {viewingVisitNote.chief_complaint ? ` | ${Array.isArray(viewingVisitNote.chief_complaint) ? viewingVisitNote.chief_complaint.join(', ') : viewingVisitNote.chief_complaint}` : ''}
                </p>
              </div>
              <button
                onClick={() => setViewingNoteId(null)}
                style={{
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--bg-white)',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px',
            }}>
              {/* Reason for Visit banner */}
              {viewingVisitNote.chief_complaint && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'var(--ai-summary-bg, linear-gradient(135deg, #F0FDFA 0%, #CCFBF1 100%))',
                  border: '1px solid var(--ai-summary-border, #5EEAD4)',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reason for Visit</span>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginTop: '2px' }}>
                      {Array.isArray(viewingVisitNote.chief_complaint) ? viewingVisitNote.chief_complaint.join(', ') : viewingVisitNote.chief_complaint}
                    </div>
                  </div>
                </div>
              )}

              {sections.length > 0 ? sections.map((section, index) => (
                <div key={section.title} style={{ marginBottom: index < sections.length - 1 ? '24px' : 0 }}>
                  <h3 style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--primary)',
                    marginBottom: '10px',
                    paddingBottom: '8px',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    {section.title}
                  </h3>
                  <div style={{
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {section.content}
                  </div>
                </div>
              )) : (
                <div style={{ padding: '24px' }}>
                  {cn?.ai_summary || viewingVisitNote.clinical_notes?.ai_summary ? (
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '10px',
                        fontWeight: 600,
                        fontSize: '13px',
                        color: '#B45309',
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#F59E0B">
                          <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/>
                        </svg>
                        AI Summary
                      </div>
                      <div style={{
                        fontSize: '13px',
                        color: 'var(--text-primary)',
                        lineHeight: 1.7,
                        whiteSpace: 'pre-wrap',
                      }}>
                        {cn?.ai_summary || viewingVisitNote.clinical_notes?.ai_summary}
                      </div>
                    </div>
                  ) : null}
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
                    Detailed note content is not available for this visit.
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              background: 'var(--bg-gray)',
            }}>
              <button
                onClick={() => {
                  const parts: string[] = []
                  if (cn?.hpi) parts.push(`HISTORY OF PRESENT ILLNESS:\n${cn.hpi}`)
                  if (cn?.ros) parts.push(`REVIEW OF SYSTEMS:\n${cn.ros}`)
                  if (cn?.exam) parts.push(`PHYSICAL EXAMINATION:\n${cn.exam}`)
                  if (cn?.assessment) parts.push(`ASSESSMENT:\n${cn.assessment}`)
                  if (cn?.plan) parts.push(`PLAN:\n${cn.plan}`)
                  if (parts.length === 0 && (cn?.ai_summary || viewingVisitNote.clinical_notes?.ai_summary)) {
                    parts.push(`AI SUMMARY:\n${cn?.ai_summary || viewingVisitNote.clinical_notes?.ai_summary}`)
                  }
                  navigator.clipboard.writeText(parts.join('\n\n'))
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-white)',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
                Copy Note
              </button>
              <button
                onClick={() => setViewingNoteId(null)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--primary)',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </>
      )
    })()}
    </>
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
