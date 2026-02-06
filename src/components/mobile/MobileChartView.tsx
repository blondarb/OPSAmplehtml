'use client'

import { useState, useRef } from 'react'
import MobileVoiceRecorder from './MobileVoiceRecorder'

interface Section {
  id: string
  title: string
  icon: React.ReactNode
  color: string
  required?: boolean
}

interface MobileChartViewProps {
  patient: {
    id: string
    name: string
    age: number
    gender: string
    reason?: string
  }
  noteData: Record<string, string>
  onUpdateNote: (field: string, value: string) => void
  onSave: () => void
  onSign: () => void
}

export default function MobileChartView({
  patient,
  noteData,
  onUpdateNote,
  onSave,
  onSign,
}: MobileChartViewProps) {
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingField, setRecordingField] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const sections: Section[] = [
    {
      id: 'hpi',
      title: 'History of Present Illness',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
      color: '#0D9488',
      required: true,
    },
    {
      id: 'ros',
      title: 'Review of Systems',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>,
      color: '#8B5CF6',
    },
    {
      id: 'exam',
      title: 'Physical Exam',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
      color: '#F59E0B',
    },
    {
      id: 'assessment',
      title: 'Assessment',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
      color: '#EF4444',
      required: true,
    },
    {
      id: 'plan',
      title: 'Plan',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
      color: '#10B981',
      required: true,
    },
  ]

  const startVoiceRecording = (sectionId: string) => {
    setRecordingField(sectionId)
    setIsRecording(true)
  }

  const handleTranscription = (text: string) => {
    if (recordingField) {
      const currentValue = noteData[recordingField] || ''
      const newValue = currentValue ? `${currentValue}\n\n${text}` : text
      onUpdateNote(recordingField, newValue)
    }
    setIsRecording(false)
    setRecordingField(null)
  }

  const getSectionStatus = (sectionId: string) => {
    const content = noteData[sectionId]
    if (!content || content.trim().length === 0) return 'empty'
    if (content.trim().length < 20) return 'incomplete'
    return 'complete'
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }}>
      {/* Patient header card */}
      <div style={{
        background: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
        padding: '20px',
        color: 'white',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '12px',
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px',
            fontWeight: 600,
          }}>
            {patient.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 600 }}>{patient.name}</div>
            <div style={{ fontSize: '14px', opacity: 0.9 }}>
              {patient.age}yo {patient.gender}
            </div>
          </div>
        </div>
        {patient.reason && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.15)',
            padding: '10px 14px',
            borderRadius: '10px',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
            {patient.reason}
          </div>
        )}
      </div>

      {/* Section cards */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {sections.map(section => {
          const status = getSectionStatus(section.id)
          const isExpanded = activeSection === section.id
          const content = noteData[section.id] || ''

          return (
            <div
              key={section.id}
              style={{
                background: 'var(--bg-white)',
                borderRadius: '16px',
                marginBottom: '12px',
                overflow: 'hidden',
                border: '1px solid var(--border)',
                transition: 'all 0.3s ease',
              }}
            >
              {/* Section header */}
              <button
                onClick={() => setActiveSection(isExpanded ? null : section.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '16px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  background: `${section.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: section.color,
                  flexShrink: 0,
                }}>
                  {section.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <span style={{
                      fontSize: '15px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                    }}>
                      {section.title}
                    </span>
                    {section.required && status === 'empty' && (
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: '#FEE2E2',
                        color: '#EF4444',
                      }}>
                        Required
                      </span>
                    )}
                  </div>
                  {content && !isExpanded && (
                    <div style={{
                      fontSize: '13px',
                      color: 'var(--text-muted)',
                      marginTop: '2px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {content.substring(0, 60)}...
                    </div>
                  )}
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  {status === 'complete' && (
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: '#10B981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </div>
                  )}
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-muted)"
                    strokeWidth="2"
                    style={{
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div style={{
                  padding: '0 16px 16px',
                  borderTop: '1px solid var(--border)',
                }}>
                  {/* Voice button */}
                  <button
                    onClick={() => startVoiceRecording(section.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '14px',
                      marginTop: '16px',
                      background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                      border: 'none',
                      borderRadius: '12px',
                      color: 'white',
                      fontSize: '15px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="23"/>
                      <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                    Dictate {section.title}
                  </button>

                  {/* Text area */}
                  <textarea
                    value={content}
                    onChange={(e) => onUpdateNote(section.id, e.target.value)}
                    placeholder={`Enter ${section.title.toLowerCase()}...`}
                    style={{
                      width: '100%',
                      minHeight: '150px',
                      marginTop: '12px',
                      padding: '14px',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      fontSize: '15px',
                      lineHeight: 1.6,
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      background: 'var(--bg-gray)',
                    }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Bottom action bar */}
      <div style={{
        display: 'flex',
        gap: '12px',
        padding: '16px',
        background: 'var(--bg-white)',
        borderTop: '1px solid var(--border)',
        paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
      }}>
        <button
          onClick={onSave}
          style={{
            flex: 1,
            padding: '14px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: 'var(--bg-white)',
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          Save Draft
        </button>
        <button
          onClick={onSign}
          style={{
            flex: 1,
            padding: '14px',
            borderRadius: '12px',
            border: 'none',
            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
            fontSize: '15px',
            fontWeight: 600,
            color: 'white',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
          }}
        >
          Sign & Complete
        </button>
      </div>

      {/* Voice recorder overlay */}
      {isRecording && recordingField && (
        <MobileVoiceRecorder
          fieldLabel={sections.find(s => s.id === recordingField)?.title || 'Note'}
          onTranscription={handleTranscription}
          onClose={() => {
            setIsRecording(false)
            setRecordingField(null)
          }}
        />
      )}
    </div>
  )
}
