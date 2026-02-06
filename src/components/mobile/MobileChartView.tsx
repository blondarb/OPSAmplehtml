'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import MobileVoiceRecorder from './MobileVoiceRecorder'
import MobileNotePreview from './MobileNotePreview'
import MobileRecommendationsSheet from './MobileRecommendationsSheet'
import { searchDiagnoses, type Diagnosis } from '@/lib/diagnosisData'

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
  const [fabOpen, setFabOpen] = useState(false)
  const [showNotePreview, setShowNotePreview] = useState(false)
  const [isChartPrepMode, setIsChartPrepMode] = useState(false)
  const [selectedDiagnoses, setSelectedDiagnoses] = useState<Diagnosis[]>([])
  const [activeRecommendation, setActiveRecommendation] = useState<Diagnosis | null>(null)
  const [diagnosisSearch, setDiagnosisSearch] = useState('')
  const [showDiagnosisSearch, setShowDiagnosisSearch] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Search diagnoses from the full 166+ diagnosis database
  const diagnosisSearchResults = useMemo(() => {
    if (!diagnosisSearch.trim()) return []
    const results = searchDiagnoses(diagnosisSearch)
    const selectedIds = new Set(selectedDiagnoses.map(d => d.id))
    return results.filter(d => !selectedIds.has(d.id)).slice(0, 10)
  }, [diagnosisSearch, selectedDiagnoses])

  interface ChartPrepSections {
    summary?: string
    alerts?: string
    suggestedHPI?: string
    suggestedAssessment?: string
    suggestedPlan?: string
  }

  const handleChartPrepComplete = (sections: ChartPrepSections) => {
    // Insert content with markers to allow re-runs
    if (sections.suggestedHPI) {
      const currentHPI = noteData['hpi'] || ''
      // Remove existing chart prep content
      const cleanHPI = currentHPI.replace(/--- Chart Prep ---[\s\S]*?--- End Chart Prep ---\n*/g, '').trim()
      const newHPI = cleanHPI
        ? `${cleanHPI}\n\n--- Chart Prep ---\n${sections.suggestedHPI}\n--- End Chart Prep ---`
        : `--- Chart Prep ---\n${sections.suggestedHPI}\n--- End Chart Prep ---`
      onUpdateNote('hpi', newHPI)
    }
    if (sections.suggestedAssessment) {
      const currentAx = noteData['assessment'] || ''
      const cleanAx = currentAx.replace(/--- Chart Prep ---[\s\S]*?--- End Chart Prep ---\n*/g, '').trim()
      const newAx = cleanAx
        ? `${cleanAx}\n\n--- Chart Prep ---\n${sections.suggestedAssessment}\n--- End Chart Prep ---`
        : `--- Chart Prep ---\n${sections.suggestedAssessment}\n--- End Chart Prep ---`
      onUpdateNote('assessment', newAx)
    }
    if (sections.suggestedPlan) {
      const currentPlan = noteData['plan'] || ''
      const cleanPlan = currentPlan.replace(/--- Chart Prep ---[\s\S]*?--- End Chart Prep ---\n*/g, '').trim()
      const newPlan = cleanPlan
        ? `${cleanPlan}\n\n--- Chart Prep ---\n${sections.suggestedPlan}\n--- End Chart Prep ---`
        : `--- Chart Prep ---\n${sections.suggestedPlan}\n--- End Chart Prep ---`
      onUpdateNote('plan', newPlan)
    }
    // Update summary if available
    if (sections.summary) {
      setAiSummary(sections.summary)
    }
  }

  const handleAddRecommendationsToPlan = (items: string[]) => {
    const currentPlan = noteData['plan'] || ''
    const newItems = items.map(item => `• ${item}`).join('\n')
    const newPlan = currentPlan
      ? `${currentPlan}\n\n${newItems}`
      : newItems
    onUpdateNote('plan', newPlan)
  }

  // Common diagnoses for quick selection (subset of full database)
  const commonDiagnoses = useMemo(() => [
    { id: 'migraine-chronic', name: 'Chronic Migraine', icd10: 'G43.709', category: 'headache' as const },
    { id: 'epilepsy-management', name: 'Epilepsy Management', icd10: 'G40.909', category: 'seizure' as const },
    { id: 'parkinsons-disease', name: "Parkinson's Disease", icd10: 'G20', category: 'movement' as const },
    { id: 'multiple-sclerosis', name: 'Multiple Sclerosis', icd10: 'G35', category: 'demyelinating' as const },
    { id: 'alzheimers-disease', name: "Alzheimer's Disease", icd10: 'G30.9', category: 'cognitive' as const },
    { id: 'tension-headache', name: 'Tension-type Headache', icd10: 'G44.2', category: 'headache' as const },
    { id: 'essential-tremor', name: 'Essential Tremor', icd10: 'G25.0', category: 'movement' as const },
    { id: 'peripheral-neuropathy', name: 'Peripheral Neuropathy', icd10: 'G62.9', category: 'neuromuscular' as const },
  ], [])

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
      id: 'assessment-plan',
      title: 'Assessment & Plan',
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
    // Handle combined assessment-plan section
    if (sectionId === 'assessment-plan') {
      const assessment = noteData['assessment'] || ''
      const plan = noteData['plan'] || ''
      const totalLength = assessment.trim().length + plan.trim().length
      if (totalLength === 0) return 'empty'
      if (totalLength < 20) return 'incomplete'
      return 'complete'
    }
    const content = noteData[sectionId]
    if (!content || content.trim().length === 0) return 'empty'
    if (content.trim().length < 20) return 'incomplete'
    return 'complete'
  }

  // Check if all required sections are complete
  const allRequiredComplete = sections
    .filter(s => s.required)
    .every(s => getSectionStatus(s.id) === 'complete')

  // Haptic feedback helper
  const triggerHaptic = (pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern)
    }
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
              <>
                <div style={{ whiteSpace: 'pre-wrap', marginBottom: '10px' }}>
                  {aiSummary.split('**').map((part, i) =>
                    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                  )}
                </div>
                {/* Chart Prep button */}
                <button
                  onClick={() => {
                    setIsChartPrepMode(true)
                    setRecordingField('chart-prep')
                    setIsRecording(true)
                    triggerHaptic(50)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    width: '100%',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  </svg>
                  Chart Prep - Dictate & Generate AI Note
                </button>
              </>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={generateSummary}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
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
                <button
                  onClick={() => {
                    setIsChartPrepMode(true)
                    setRecordingField('chart-prep')
                    setIsRecording(true)
                    triggerHaptic(50)
                  }}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  </svg>
                  Chart Prep
                </button>
              </div>
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

            {/* Text area - special handling for combined assessment-plan */}
            {activeSection === 'assessment-plan' ? (
              <>
                {/* Assessment textarea */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                    Assessment
                  </label>
                  <textarea
                    value={noteData['assessment'] || ''}
                    onChange={(e) => onUpdateNote('assessment', e.target.value)}
                    placeholder="Enter clinical assessment..."
                    style={{
                      width: '100%',
                      minHeight: '80px',
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
              </>
            ) : (
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
            )}

            {/* Diagnosis selection for Assessment & Plan section */}
            {activeSection === 'assessment-plan' && (
              <div style={{ marginTop: '12px', marginBottom: '16px' }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  Diagnoses — Tap for Treatment Recommendations
                </div>

                {/* Searchable diagnosis input */}
                <div style={{ position: 'relative', marginBottom: '8px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    background: 'var(--bg-gray)',
                    borderRadius: '8px',
                    border: showDiagnosisSearch ? '1px solid #0D9488' : '1px solid var(--border)',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                      <circle cx="11" cy="11" r="8"/>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input
                      type="text"
                      value={diagnosisSearch}
                      onChange={(e) => {
                        setDiagnosisSearch(e.target.value)
                        setShowDiagnosisSearch(true)
                      }}
                      onFocus={() => setShowDiagnosisSearch(true)}
                      placeholder="Search 166 diagnoses..."
                      style={{
                        flex: 1,
                        border: 'none',
                        background: 'transparent',
                        fontSize: '14px',
                        outline: 'none',
                        color: 'var(--text-primary)',
                      }}
                    />
                    {diagnosisSearch && (
                      <button
                        onClick={() => {
                          setDiagnosisSearch('')
                          setShowDiagnosisSearch(false)
                        }}
                        style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', color: 'var(--text-muted)' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Search results dropdown */}
                  {showDiagnosisSearch && diagnosisSearchResults.length > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: 'var(--bg-white)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      zIndex: 100,
                      maxHeight: '200px',
                      overflowY: 'auto',
                      marginTop: '4px',
                    }}>
                      {diagnosisSearchResults.map(dx => (
                        <button
                          key={dx.id}
                          onClick={() => {
                            setSelectedDiagnoses([...selectedDiagnoses, dx])
                            setActiveRecommendation(dx)
                            setDiagnosisSearch('')
                            setShowDiagnosisSearch(false)
                            triggerHaptic(30)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            padding: '10px 12px',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            textAlign: 'left',
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                              {dx.name}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {dx.icd10}
                            </div>
                          </div>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                          </svg>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected diagnoses */}
                {selectedDiagnoses.length > 0 && (
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    marginBottom: '8px',
                  }}>
                    {selectedDiagnoses.map(dx => (
                      <button
                        key={dx.id}
                        onClick={() => setActiveRecommendation(dx)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '6px 10px',
                          borderRadius: '16px',
                          border: '1px solid #0D9488',
                          background: '#0D948810',
                          color: '#0D9488',
                          fontSize: '12px',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        {dx.name}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedDiagnoses(selectedDiagnoses.filter(d => d.id !== dx.id))
                          }}
                          style={{ marginLeft: '2px', opacity: 0.7 }}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Quick diagnosis pills - show when no search active */}
                {!showDiagnosisSearch && (
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                  }}>
                    {commonDiagnoses
                      .filter(dx => !selectedDiagnoses.some(s => s.id === dx.id))
                      .slice(0, 6)
                      .map(dx => (
                        <button
                          key={dx.id}
                          onClick={() => {
                            setSelectedDiagnoses([...selectedDiagnoses, dx])
                            setActiveRecommendation(dx)
                            triggerHaptic(30)
                          }}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '16px',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-white)',
                            color: 'var(--text-secondary)',
                            fontSize: '12px',
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                        >
                          + {dx.name}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Plan textarea - shown after diagnoses in combined section */}
            {activeSection === 'assessment-plan' && (
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                  Plan
                </label>
                <textarea
                  value={noteData['plan'] || ''}
                  onChange={(e) => onUpdateNote('plan', e.target.value)}
                  placeholder="Enter treatment plan..."
                  style={{
                    width: '100%',
                    minHeight: '100px',
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
            )}
          </div>
        ) : (
          // Show all sections in compact view when none selected
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '12px' }}>
            {sections.map(section => {
              // Handle combined assessment-plan section
              const content = section.id === 'assessment-plan'
                ? [noteData['assessment'], noteData['plan']].filter(Boolean).join(' | ') || ''
                : noteData[section.id] || ''
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

      {/* FAB Menu */}
      {fabOpen && (
        <div
          onClick={() => setFabOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.3)',
            zIndex: 998,
          }}
        />
      )}

      <div style={{
        position: 'fixed',
        right: '16px',
        bottom: 'calc(24px + env(safe-area-inset-bottom))',
        zIndex: 999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '12px',
      }}>
        {/* Expanded menu items */}
        {fabOpen && (
          <>
            {/* Save Draft */}
            <button
              onClick={() => {
                triggerHaptic(30)
                onSave()
                setFabOpen(false)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 16px',
                background: 'var(--bg-white)',
                border: '1px solid var(--border)',
                borderRadius: '24px',
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                animation: 'fabItemIn 0.2s ease-out',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              Save Draft
            </button>

            {/* Prepare Note */}
            <button
              onClick={() => {
                triggerHaptic(30)
                setShowNotePreview(true)
                setFabOpen(false)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 16px',
                background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
                border: 'none',
                borderRadius: '24px',
                fontSize: '14px',
                fontWeight: 500,
                color: 'white',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)',
                animation: 'fabItemIn 0.15s ease-out',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              Prepare Note
            </button>

            {/* Sign & Complete */}
            <button
              onClick={() => {
                triggerHaptic([100, 50, 100])
                onSign()
                setFabOpen(false)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 16px',
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                border: 'none',
                borderRadius: '24px',
                fontSize: '14px',
                fontWeight: 600,
                color: 'white',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                animation: 'fabItemIn 0.1s ease-out',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              Sign & Complete
            </button>
          </>
        )}

        {/* Main FAB button */}
        <button
          onClick={() => {
            triggerHaptic(30)
            setFabOpen(!fabOpen)
          }}
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            border: 'none',
            background: allRequiredComplete
              ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
              : 'linear-gradient(135deg, #6B7280 0%, #4B5563 100%)',
            color: 'white',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.2s, background 0.3s',
            transform: fabOpen ? 'rotate(45deg)' : 'rotate(0deg)',
          }}
        >
          {fabOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          ) : allRequiredComplete ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          )}
        </button>
      </div>

      {/* Voice recorder overlay */}
      {isRecording && recordingField && (
        <MobileVoiceRecorder
          fieldLabel={isChartPrepMode ? 'Chart Prep' : (sections.find(s => s.id === recordingField)?.title || 'Note')}
          mode={isChartPrepMode ? 'chart-prep' : 'dictate'}
          patient={patient}
          noteData={noteData}
          onTranscription={handleTranscription}
          onChartPrepComplete={handleChartPrepComplete}
          onClose={() => {
            setIsRecording(false)
            setRecordingField(null)
            setIsChartPrepMode(false)
          }}
        />
      )}

      {/* Note preview */}
      <MobileNotePreview
        isOpen={showNotePreview}
        onClose={() => setShowNotePreview(false)}
        noteData={noteData}
        patient={patient}
        onSign={onSign}
      />

      {/* Recommendations sheet */}
      {activeRecommendation && (
        <MobileRecommendationsSheet
          isOpen={true}
          onClose={() => setActiveRecommendation(null)}
          diagnosisId={activeRecommendation.id}
          diagnosisName={activeRecommendation.name}
          onAddToPlan={handleAddRecommendationsToPlan}
        />
      )}

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fabItemIn {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  )
}
