'use client'

import { useState, useRef, useEffect } from 'react'
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
  const [showSummary, setShowSummary] = useState(true)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const sections: Section[] = [
    {
      id: 'hpi',
      title: 'HPI',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
      color: '#0D9488',
      required: true,
    },
    {
      id: 'ros',
      title: 'ROS',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>,
      color: '#8B5CF6',
    },
    {
      id: 'exam',
      title: 'Exam',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
      color: '#F59E0B',
    },
    {
      id: 'assessment',
      title: 'Assessment',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
      color: '#EF4444',
      required: true,
    },
    {
      id: 'plan',
      title: 'Plan',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
      color: '#10B981',
      required: true,
    },
  ]

  // Generate AI summary on mount
  useEffect(() => {
    if (!aiSummary && patient.reason) {
      generateSummary()
    }
  }, [patient.id])

  const generateSummary = async () => {
    setIsGeneratingSummary(true)
    try {
      // Simulate API call - in production would call /api/ai/chart-prep
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Mock summary based on reason
      const summaries: Record<string, string> = {
        'New onset headaches': `**Referral Summary**\n\n67yo F presenting with new onset headaches. Key considerations:\n• Onset, duration, and frequency pattern\n• Associated symptoms (visual, nausea, neuro)\n• Red flags: thunderclap, positional, systemic symptoms\n• Prior imaging/workup if any\n\n**Suggested Focus**: Headache characterization, neuro exam, review any imaging`,
        'Tremor evaluation': `**Referral Summary**\n\n52yo M for tremor evaluation. Key considerations:\n• Rest vs action tremor\n• Unilateral vs bilateral\n• Family history of tremor/PD\n• Medication review (lithium, valproate, etc)\n\n**Suggested Focus**: Tremor characterization, UPDRS if indicated, medication reconciliation`,
        'Migraine follow-up': `**Follow-up Summary**\n\n45yo F migraine follow-up. Review:\n• Current headache frequency/severity\n• Preventive medication efficacy & tolerability\n• Acute medication use (overuse risk)\n• Lifestyle factors & triggers\n\n**Suggested Focus**: MIDAS/HIT-6, medication adjustment if needed`,
        'Memory concerns': `**Referral Summary**\n\n73yo M with memory concerns. Key considerations:\n• Onset and progression pattern\n• Functional impact (IADLs, driving)\n• Mood symptoms\n• Medication review\n\n**Suggested Focus**: Cognitive screening (MoCA), depression screen, labs if not done`,
        'MS follow-up': `**Follow-up Summary**\n\n38yo F MS follow-up. Review:\n• New or worsening symptoms since last visit\n• DMT adherence and tolerability\n• MRI findings if recent\n• Functional status\n\n**Suggested Focus**: EDSS, DMT discussion, symptom management`,
      }

      setAiSummary(summaries[patient.reason || ''] || `**Patient Summary**\n\n${patient.age}yo ${patient.gender} presenting for ${patient.reason || 'evaluation'}.\n\n**Suggested Focus**: Complete history and examination`)
    } catch (err) {
      console.error('Failed to generate summary:', err)
    } finally {
      setIsGeneratingSummary(false)
    }
  }

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
      {/* Compact patient header */}
      <div style={{
        background: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
        padding: '12px 16px',
        color: 'white',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            fontWeight: 600,
            flexShrink: 0,
          }}>
            {patient.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '16px', fontWeight: 600 }}>{patient.name}</div>
            <div style={{ fontSize: '12px', opacity: 0.9 }}>
              {patient.age}yo {patient.gender} · {patient.reason}
            </div>
          </div>
        </div>
      </div>

      {/* AI Summary Card - collapsible */}
      <div style={{
        margin: '12px',
        background: 'var(--bg-white)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        <button
          onClick={() => setShowSummary(!showSummary)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 12px',
            background: 'linear-gradient(135deg, #F0FDFA 0%, #CCFBF1 100%)',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: '#0D9488' }}>
            AI Summary
          </span>
          {isGeneratingSummary && (
            <div style={{
              width: '14px',
              height: '14px',
              border: '2px solid #0D9488',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
          )}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0D9488"
            strokeWidth="2"
            style={{
              transform: showSummary ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {showSummary && (
          <div style={{
            padding: '10px 12px',
            fontSize: '13px',
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
            borderTop: '1px solid var(--border)',
          }}>
            {isGeneratingSummary ? (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Generating summary...
              </div>
            ) : aiSummary ? (
              <div style={{ whiteSpace: 'pre-wrap' }}>
                {aiSummary.split('**').map((part, i) =>
                  i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                )}
              </div>
            ) : (
              <button
                onClick={generateSummary}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #0D9488',
                  background: 'transparent',
                  color: '#0D9488',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Generate Summary
              </button>
            )}
          </div>
        )}
      </div>

      {/* Section cards - compact horizontal scroll for quick access */}
      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '0 12px 8px',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        {sections.map(section => {
          const status = getSectionStatus(section.id)
          const isActive = activeSection === section.id
          return (
            <button
              key={section.id}
              onClick={() => setActiveSection(isActive ? null : section.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                borderRadius: '20px',
                border: isActive ? `2px solid ${section.color}` : '1px solid var(--border)',
                background: isActive ? `${section.color}10` : 'var(--bg-white)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <span style={{ color: section.color }}>{section.icon}</span>
              <span style={{
                fontSize: '13px',
                fontWeight: 500,
                color: isActive ? section.color : 'var(--text-primary)',
              }}>
                {section.title}
              </span>
              {status === 'complete' && (
                <div style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  background: '#10B981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
              )}
              {section.required && status === 'empty' && (
                <span style={{
                  fontSize: '8px',
                  fontWeight: 600,
                  padding: '2px 4px',
                  borderRadius: '4px',
                  background: '#FEE2E2',
                  color: '#EF4444',
                }}>
                  REQ
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Expanded section content */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '0 12px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {activeSection ? (
          <div style={{
            background: 'var(--bg-white)',
            borderRadius: '12px',
            padding: '12px',
            border: '1px solid var(--border)',
            marginBottom: '12px',
          }}>
            {/* Section header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <span style={{ color: sections.find(s => s.id === activeSection)?.color }}>
                  {sections.find(s => s.id === activeSection)?.icon}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {sections.find(s => s.id === activeSection)?.title}
                </span>
              </div>

              {/* Voice button - compact */}
              <button
                onClick={() => startVoiceRecording(activeSection)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 10px',
                  background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                  border: 'none',
                  borderRadius: '16px',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                </svg>
                Dictate
              </button>
            </div>

            {/* Text area */}
            <textarea
              value={noteData[activeSection] || ''}
              onChange={(e) => onUpdateNote(activeSection, e.target.value)}
              placeholder={`Enter ${sections.find(s => s.id === activeSection)?.title.toLowerCase()}...`}
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '10px',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '14px',
                lineHeight: 1.5,
                resize: 'vertical',
                fontFamily: 'inherit',
                background: 'var(--bg-gray)',
              }}
            />
          </div>
        ) : (
          // Show all sections in compact view when none selected
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '12px' }}>
            {sections.map(section => {
              const content = noteData[section.id] || ''
              const status = getSectionStatus(section.id)

              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '12px',
                    background: 'var(--bg-white)',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
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
                      gap: '6px',
                      marginBottom: '2px',
                    }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {section.title}
                      </span>
                      {section.required && status === 'empty' && (
                        <span style={{
                          fontSize: '9px',
                          fontWeight: 600,
                          padding: '1px 4px',
                          borderRadius: '3px',
                          background: '#FEE2E2',
                          color: '#EF4444',
                        }}>
                          Required
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: content ? 'var(--text-secondary)' : 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {content ? content.substring(0, 80) + (content.length > 80 ? '...' : '') : 'Tap to add...'}
                    </div>
                  </div>
                  {status === 'complete' && (
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: '#10B981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </div>
                  )}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-muted)"
                    strokeWidth="2"
                    style={{ flexShrink: 0 }}
                  >
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom action bar - compact */}
      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '10px 12px',
        background: 'var(--bg-white)',
        borderTop: '1px solid var(--border)',
        paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
      }}>
        <button
          onClick={onSave}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--bg-white)',
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          Save
        </button>
        <button
          onClick={onSign}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '8px',
            border: 'none',
            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
            fontSize: '14px',
            fontWeight: 600,
            color: 'white',
            cursor: 'pointer',
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

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
