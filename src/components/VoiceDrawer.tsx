'use client'

import { useState } from 'react'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'

interface VisitAIOutput {
  hpiFromVisit?: string
  rosFromVisit?: string
  examFromVisit?: string
  assessmentFromVisit?: string
  planFromVisit?: string
  transcriptSummary?: string
  confidence?: {
    hpi?: number
    ros?: number
    exam?: number
    assessment?: number
    plan?: number
  }
}

interface VoiceDrawerProps {
  isOpen: boolean
  onClose: () => void
  activeTab: string
  setActiveTab: (tab: string) => void
  patient: any
  noteData: any
  updateNote: (field: string, value: any) => void
  activeTextField?: string | null
  updateRawDictation?: (field: string, rawText: string) => void
  chartPrepOutput?: any
  onChartPrepComplete?: (output: any) => void
  onVisitAIComplete?: (output: VisitAIOutput, transcript: string) => void
}

export default function VoiceDrawer({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  patient,
  noteData,
  updateNote,
  activeTextField,
  updateRawDictation,
  chartPrepOutput,
  onChartPrepComplete,
  onVisitAIComplete,
}: VoiceDrawerProps) {
  const [aiResponse, setAiResponse] = useState('')
  const [chartPrepSections, setChartPrepSections] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [insertedSections, setInsertedSections] = useState<Set<string>>(new Set())

  // Chart Prep specific state
  const [prepNotes, setPrepNotes] = useState<Array<{ text: string; timestamp: string; category: string }>>([])
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['patientSummary', 'keyConsiderations']))

  // Visit AI specific state
  const [visitAIOutput, setVisitAIOutput] = useState<VisitAIOutput | null>(null)
  const [visitTranscript, setVisitTranscript] = useState<string>('')
  const [visitAIProcessing, setVisitAIProcessing] = useState(false)
  const [visitAIError, setVisitAIError] = useState<string | null>(null)

  // Separate voice recorder for Chart Prep dictation
  const {
    isRecording: isPrepRecording,
    isPaused: isPrepPaused,
    isTranscribing: isPrepTranscribing,
    error: prepRecordingError,
    transcribedText: prepTranscribedText,
    recordingDuration: prepRecordingDuration,
    startRecording: startPrepRecording,
    pauseRecording: pausePrepRecording,
    resumeRecording: resumePrepRecording,
    stopRecording: stopPrepRecording,
    restartRecording: restartPrepRecording,
    clearTranscription: clearPrepTranscription,
  } = useVoiceRecorder()

  // Voice recorder for Visit AI (Document tab)
  const {
    isRecording: isVisitRecording,
    isPaused: isVisitPaused,
    isTranscribing: isVisitTranscribing,
    error: visitRecordingError,
    recordingDuration: visitRecordingDuration,
    startRecording: startVisitRecording,
    pauseRecording: pauseVisitRecording,
    resumeRecording: resumeVisitRecording,
    stopRecording: stopVisitRecordingRaw,
    restartRecording: restartVisitRecording,
  } = useVoiceRecorder()

  // Format duration as MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const tabs = [
    { id: 'chart-prep', label: 'Chart Prep' },
    { id: 'document', label: 'Document' },
  ]

  const generateChartPrep = async () => {
    setLoading(true)
    setChartPrepSections(null)
    setInsertedSections(new Set())

    try {
      const response = await fetch('/api/ai/chart-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient,
          noteData,
          prepNotes,
        }),
      })

      const data = await response.json()
      if (data.sections) {
        setChartPrepSections(data.sections)
        setAiResponse('')
        if (onChartPrepComplete) {
          onChartPrepComplete(data.sections)
        }
      } else {
        setAiResponse(data.response || data.error || 'No response')
        setChartPrepSections(null)
      }
    } catch (error) {
      setAiResponse('Error generating chart prep')
      setChartPrepSections(null)
    }

    setLoading(false)
  }

  // Process Visit AI recording
  const processVisitAI = async (audioBlob: Blob) => {
    setVisitAIProcessing(true)
    setVisitAIError(null)
    setVisitAIOutput(null)
    setVisitTranscript('')

    try {
      const formData = new FormData()
      const extension = audioBlob.type.includes('webm') ? 'webm' : 'm4a'
      const audioFile = new File([audioBlob], `visit-recording.${extension}`, { type: audioBlob.type })
      formData.append('audio', audioFile)

      if (patient) {
        formData.append('patient', JSON.stringify(patient))
      }
      if (chartPrepSections || chartPrepOutput) {
        formData.append('chartPrep', JSON.stringify(chartPrepSections || chartPrepOutput))
      }

      const response = await fetch('/api/ai/visit-ai', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (data.error) {
        setVisitAIError(data.error)
      } else {
        setVisitAIOutput(data.visitAI)
        setVisitTranscript(data.transcript || '')

        if (onVisitAIComplete && data.visitAI) {
          onVisitAIComplete(data.visitAI, data.transcript || '')
        }
      }
    } catch (error: any) {
      setVisitAIError(error?.message || 'Error processing visit recording')
    }

    setVisitAIProcessing(false)
  }

  // Stop visit recording and process
  const stopVisitRecording = async () => {
    stopVisitRecordingRaw()
  }

  // Clear Visit AI results
  const clearVisitAI = () => {
    setVisitAIOutput(null)
    setVisitTranscript('')
    setVisitAIError(null)
  }

  // Insert a chart prep section into a note field
  const insertSection = (sectionKey: string, targetField: string) => {
    if (!chartPrepSections || !chartPrepSections[sectionKey]) return

    const content = chartPrepSections[sectionKey]
    const currentValue = noteData[targetField] || ''
    const newValue = currentValue ? `${currentValue}\n\n${content}` : content
    updateNote(targetField, newValue)
    setInsertedSections(prev => new Set([...prev, sectionKey]))
  }

  // Chart prep section configuration
  const chartPrepConfig = [
    { key: 'visitPurpose', label: 'Visit Purpose', targetField: null, icon: '🎯', highlight: false },
    { key: 'alerts', label: 'Alerts', targetField: null, icon: '⚠️', highlight: true },
    { key: 'keyMetrics', label: 'Key Metrics', targetField: null, icon: '📊', highlight: false },
    { key: 'currentTreatment', label: 'Current Treatment', targetField: null, icon: '💊', highlight: false },
    { key: 'lastVisitSummary', label: 'Last Visit', targetField: null, icon: '📋', highlight: false },
    { key: 'suggestedFocus', label: 'Suggested Focus', targetField: null, icon: '🔮', highlight: true },
    { key: 'suggestedHPI', label: 'Suggested HPI', targetField: 'hpi', icon: '📝', highlight: false },
    { key: 'suggestedAssessment', label: 'Suggested Assessment', targetField: 'assessment', icon: '💡', highlight: false },
    { key: 'suggestedPlan', label: 'Suggested Plan', targetField: 'plan', icon: '📌', highlight: false },
    { key: 'patientSummary', label: 'Patient Summary', targetField: null, icon: '👤', highlight: false, legacy: true },
    { key: 'keyConsiderations', label: 'Key Considerations', targetField: null, icon: '⚠️', highlight: true, legacy: true },
  ]

  // Prep note categories
  const prepCategories = [
    { id: 'general', label: 'General' },
    { id: 'referral', label: 'Referral' },
    { id: 'imaging', label: 'Imaging' },
    { id: 'labs', label: 'Labs' },
    { id: 'history', label: 'History' },
    { id: 'assessment', label: 'Assessment' },
  ]

  // Auto-detect category from transcribed text
  const detectCategory = (text: string): string => {
    const lower = text.toLowerCase()

    if (lower.includes('mri') || lower.includes('ct') || lower.includes('scan') ||
        lower.includes('imaging') || lower.includes('x-ray') || lower.includes('ultrasound') ||
        lower.includes('eeg') || lower.includes('emg')) {
      return 'imaging'
    }

    if (lower.includes('lab') || lower.includes('blood') || lower.includes('level') ||
        lower.includes('test result') || lower.includes('hemoglobin') || lower.includes('glucose') ||
        lower.includes('creatinine') || lower.includes('liver') || lower.includes('thyroid')) {
      return 'labs'
    }

    if (lower.includes('referral') || lower.includes('referred') || lower.includes('consult') ||
        lower.includes('primary care') || lower.includes('specialist') || lower.includes('sent by')) {
      return 'referral'
    }

    if (lower.includes('history') || lower.includes('past medical') || lower.includes('pmh') ||
        lower.includes('surgical') || lower.includes('family history') || lower.includes('social')) {
      return 'history'
    }

    if (lower.includes('assessment') || lower.includes('impression') || lower.includes('diagnosis') ||
        lower.includes('likely') || lower.includes('suspect') || lower.includes('differential') ||
        lower.includes('think') || lower.includes('plan') || lower.includes('recommend')) {
      return 'assessment'
    }

    return 'general'
  }

  // Add prep note when transcription completes
  const addPrepNote = () => {
    if (prepTranscribedText && prepTranscribedText.trim()) {
      const autoCategory = detectCategory(prepTranscribedText)
      const newNote = {
        text: prepTranscribedText.trim(),
        timestamp: new Date().toISOString(),
        category: autoCategory,
      }
      setPrepNotes(prev => [...prev, newNote])
      clearPrepTranscription()
    }
  }

  // Toggle section expansion
  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Add all insertable sections to note at once
  const insertAllSections = () => {
    if (!chartPrepSections) return

    const fieldUpdates: Record<string, string[]> = {
      hpi: [],
      assessment: [],
      plan: [],
    }

    chartPrepConfig.forEach(section => {
      if (section.targetField && chartPrepSections[section.key]) {
        fieldUpdates[section.targetField].push(chartPrepSections[section.key])
      }
    })

    if (prepNotes.length > 0) {
      const prepNotesText = prepNotes.map(n => `[${n.category}] ${n.text}`).join('\n\n')
      fieldUpdates.hpi.unshift(`--- Pre-Visit Notes ---\n${prepNotesText}\n--- End Pre-Visit Notes ---\n`)
    }

    Object.entries(fieldUpdates).forEach(([field, contents]) => {
      if (contents.length > 0) {
        const currentValue = noteData[field] || ''
        const newValue = currentValue
          ? `${currentValue}\n\n${contents.join('\n\n')}`
          : contents.join('\n\n')
        updateNote(field, newValue)
      }
    })

    setInsertedSections(new Set(chartPrepConfig.filter(s => s.targetField).map(s => s.key)))
  }

  // Delete a prep note
  const deletePrepNote = (index: number) => {
    setPrepNotes(prev => prev.filter((_, i) => i !== index))
  }

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 1000,
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '420px',
        height: '100%',
        background: 'var(--bg-white)',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideIn 0.3s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px',
          background: 'linear-gradient(135deg, #EF4444 0%, #F87171 100%)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
              <path d="M19 10v2a7 7 0 01-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            <span style={{ fontWeight: 600 }}>Voice & Dictation</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '4px',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                border: 'none',
                background: activeTab === tab.id ? '#EF4444' : 'var(--bg-gray)',
                color: activeTab === tab.id ? 'white' : 'var(--text-secondary)',
                flex: 1,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {/* Chart Prep Tab */}
          {activeTab === 'chart-prep' && (
            <div>
              <p style={{ marginBottom: '12px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                Review records and dictate notes. AI will summarize key points to guide your visit.
              </p>

              {/* Dictation Section */}
              <div style={{
                background: isPrepRecording ? 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)' : 'var(--bg-gray)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '12px',
                border: isPrepRecording ? '2px solid var(--error)' : '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
                    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/>
                  </svg>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    Dictate While Reviewing
                  </span>
                </div>

                {/* Recording controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {!isPrepRecording ? (
                    <button
                      onClick={startPrepRecording}
                      disabled={isPrepTranscribing}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '10px',
                        borderRadius: '6px',
                        border: 'none',
                        background: isPrepTranscribing ? 'var(--bg-gray)' : '#EF4444',
                        color: isPrepTranscribing ? 'var(--text-muted)' : 'white',
                        cursor: isPrepTranscribing ? 'wait' : 'pointer',
                        fontSize: '13px',
                        fontWeight: 500,
                      }}
                    >
                      {isPrepTranscribing ? (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                          </svg>
                          Transcribing...
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                          </svg>
                          Record Note
                        </>
                      )}
                    </button>
                  ) : (
                    <>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '10px 12px',
                        background: isPrepPaused ? 'var(--warning)' : 'var(--error)',
                        borderRadius: '6px',
                        color: 'white',
                        fontSize: '13px',
                        fontWeight: 600,
                      }}>
                        <span style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: 'white',
                          animation: isPrepPaused ? 'none' : 'pulse 1s infinite',
                          opacity: isPrepPaused ? 0.5 : 1,
                        }} />
                        {formatDuration(prepRecordingDuration)}
                      </div>

                      <button
                        onClick={isPrepPaused ? resumePrepRecording : pausePrepRecording}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '36px',
                          height: '36px',
                          borderRadius: '6px',
                          border: 'none',
                          background: 'var(--bg-gray)',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                        }}
                        title={isPrepPaused ? 'Resume' : 'Pause'}
                      >
                        {isPrepPaused ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3"/>
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="4" width="4" height="16"/>
                            <rect x="14" y="4" width="4" height="16"/>
                          </svg>
                        )}
                      </button>

                      <button
                        onClick={restartPrepRecording}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '36px',
                          height: '36px',
                          borderRadius: '6px',
                          border: 'none',
                          background: 'var(--bg-gray)',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                        }}
                        title="Restart"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                        </svg>
                      </button>

                      <button
                        onClick={stopPrepRecording}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '10px',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#EF4444',
                          color: 'white',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: 500,
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="4" y="4" width="16" height="16" rx="2"/>
                        </svg>
                        Done
                      </button>
                    </>
                  )}
                </div>

                {/* Transcription result */}
                {prepTranscribedText && (
                  <div style={{ marginTop: '8px', padding: '8px', background: 'var(--bg-white)', borderRadius: '6px', border: '1px solid #A7F3D0' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '8px' }}>{prepTranscribedText}</p>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={addPrepNote} style={{ flex: 1, padding: '6px', background: '#EF4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>
                        Add to Notes
                      </button>
                      <button onClick={clearPrepTranscription} style={{ padding: '6px 10px', background: 'var(--bg-gray)', color: 'var(--text-muted)', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>
                        Discard
                      </button>
                    </div>
                  </div>
                )}

                {prepRecordingError && (
                  <p style={{ marginTop: '8px', fontSize: '11px', color: 'var(--error)' }}>{prepRecordingError}</p>
                )}
              </div>

              {/* Your Prep Notes */}
              {prepNotes.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    Your Notes ({prepNotes.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {prepNotes.map((note, idx) => (
                      <div key={idx} style={{
                        padding: '8px',
                        background: 'var(--bg-gray)',
                        borderRadius: '6px',
                        borderLeft: '3px solid #EF4444',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                            {prepCategories.find(c => c.id === note.category)?.label || note.category}
                          </span>
                          <button onClick={() => deletePrepNote(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                          </button>
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>{note.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generate AI Summary Button */}
              <button
                onClick={generateChartPrep}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  background: loading ? 'var(--bg-gray)' : 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
                  color: loading ? 'var(--text-muted)' : 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 500,
                  cursor: loading ? 'wait' : 'pointer',
                  marginBottom: '12px',
                  width: '100%',
                  justifyContent: 'center',
                }}
              >
                {loading ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                    </svg>
                    Analyzing Records...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                    Generate AI Summary
                  </>
                )}
              </button>

              {/* Alerts Section */}
              {chartPrepSections && chartPrepSections.alerts && chartPrepSections.alerts.trim() && (
                <div style={{
                  background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '12px',
                  border: '1px solid #EF4444',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '16px' }}>⚠️</span>
                    <span style={{ fontWeight: 600, fontSize: '13px', color: '#991B1B' }}>Alerts</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#7F1D1D', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {chartPrepSections.alerts}
                  </div>
                </div>
              )}

              {/* Suggested Focus */}
              {chartPrepSections && chartPrepSections.suggestedFocus && (
                <div style={{
                  background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '12px',
                  border: '1px solid #F59E0B',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '16px' }}>🔮</span>
                    <span style={{ fontWeight: 600, fontSize: '13px', color: '#92400E' }}>Suggested Focus for This Visit</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#78350F', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {chartPrepSections.suggestedFocus}
                  </div>
                </div>
              )}

              {/* Legacy Key Points */}
              {chartPrepSections && chartPrepSections.keyConsiderations && !chartPrepSections.suggestedFocus && (
                <div style={{
                  background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '12px',
                  border: '1px solid #F59E0B',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '16px' }}>⚠️</span>
                    <span style={{ fontWeight: 600, fontSize: '13px', color: '#92400E' }}>Key Points for This Visit</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#78350F', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {chartPrepSections.keyConsiderations}
                  </div>
                </div>
              )}

              {/* Add All Button */}
              {chartPrepSections && (
                <button
                  onClick={insertAllSections}
                  disabled={insertedSections.size === chartPrepConfig.filter(s => s.targetField).length}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    background: insertedSections.size === chartPrepConfig.filter(s => s.targetField).length ? '#D1FAE5' : 'var(--warning)',
                    color: insertedSections.size === chartPrepConfig.filter(s => s.targetField).length ? '#059669' : 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 500,
                    cursor: insertedSections.size === chartPrepConfig.filter(s => s.targetField).length ? 'default' : 'pointer',
                    marginBottom: '12px',
                    width: '100%',
                    justifyContent: 'center',
                  }}
                >
                  {insertedSections.size === chartPrepConfig.filter(s => s.targetField).length ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>
                      </svg>
                      All Sections Added to Note
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14"/>
                      </svg>
                      Add All to Note
                    </>
                  )}
                </button>
              )}

              {/* Collapsible Detailed Sections */}
              {chartPrepSections && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {chartPrepConfig.map(section => {
                    const content = chartPrepSections[section.key]
                    if (!content) return null
                    if (section.key === 'alerts' || section.key === 'suggestedFocus') return null
                    if (section.key === 'keyConsiderations' && chartPrepSections.suggestedFocus) return null
                    if (section.key === 'patientSummary' && chartPrepSections.visitPurpose) return null
                    if ((section as any).legacy) return null

                    const isExpanded = expandedSections.has(section.key)
                    const isInserted = insertedSections.has(section.key)
                    const canInsert = section.targetField !== null

                    return (
                      <div
                        key={section.key}
                        style={{
                          background: isInserted ? '#F0FDF4' : 'var(--bg-white)',
                          border: isInserted ? '1px solid #86EFAC' : '1px solid var(--border)',
                          borderRadius: '6px',
                          overflow: 'hidden',
                        }}
                      >
                        <button
                          onClick={() => toggleSection(section.key)}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 10px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px' }}>{section.icon}</span>
                            <span style={{ fontWeight: 500, fontSize: '12px', color: 'var(--text-primary)' }}>
                              {section.label}
                            </span>
                            {isInserted && (
                              <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: '#22C55E', color: 'white' }}>
                                ✓
                              </span>
                            )}
                          </div>
                          <svg
                            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"
                            style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                          >
                            <path d="M6 9l6 6 6-6"/>
                          </svg>
                        </button>

                        {isExpanded && (
                          <div style={{ padding: '0 10px 10px 10px' }}>
                            <div style={{
                              fontSize: '12px',
                              color: 'var(--text-secondary)',
                              lineHeight: 1.5,
                              whiteSpace: 'pre-wrap',
                              marginBottom: canInsert ? '8px' : '0',
                            }}>
                              {content}
                            </div>
                            {canInsert && !isInserted && (
                              <button
                                onClick={() => insertSection(section.key, section.targetField!)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 8px',
                                  background: '#EF4444',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  fontSize: '10px',
                                  fontWeight: 500,
                                  cursor: 'pointer',
                                }}
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M12 5v14M5 12h14"/>
                                </svg>
                                Insert to {section.targetField?.toUpperCase()}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* AI disclaimer */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    background: '#FEF3C7',
                    borderRadius: '4px',
                    fontSize: '10px',
                    color: '#92400E',
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                    </svg>
                    AI-generated. Review before finalizing.
                  </div>
                </div>
              )}

              {/* Fallback for non-structured response */}
              {aiResponse && !chartPrepSections && (
                <div style={{
                  background: 'linear-gradient(135deg, #F0FDFA 0%, #ECFDF5 100%)',
                  border: '1px solid #A7F3D0',
                  borderRadius: '8px',
                  padding: '12px',
                }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                    {aiResponse}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Document Tab - Visit AI */}
          {activeTab === 'document' && (
            <div>
              <p style={{ marginBottom: '12px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                Record your patient visit. AI will transcribe the conversation and generate clinical note sections.
              </p>

              {/* Main Recording UI */}
              {!visitAIOutput && !visitAIProcessing && (
                <div style={{
                  background: isVisitRecording
                    ? isVisitPaused
                      ? 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)'
                      : 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)'
                    : 'var(--bg-gray)',
                  borderRadius: '8px',
                  padding: '20px',
                  marginBottom: '16px',
                  border: isVisitRecording
                    ? isVisitPaused ? '2px solid var(--warning)' : '2px solid var(--error)'
                    : '1px solid var(--border)',
                }}>
                  {!isVisitRecording ? (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        background: '#EF4444',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px',
                        cursor: 'pointer',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                      }}
                        onClick={startVisitRecording}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.05)'
                          e.currentTarget.style.boxShadow = '0 4px 20px rgba(239, 68, 68, 0.4)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)'
                          e.currentTarget.style.boxShadow = 'none'
                        }}
                      >
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                          <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                          <path d="M19 10v2a7 7 0 01-14 0v-2"/>
                          <line x1="12" y1="19" x2="12" y2="23"/>
                          <line x1="8" y1="23" x2="16" y2="23"/>
                        </svg>
                      </div>
                      <p style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
                        Start Visit Recording
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        AI will transcribe and extract clinical content
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px',
                        marginBottom: '16px',
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 16px',
                          background: isVisitPaused ? 'var(--warning)' : 'var(--error)',
                          borderRadius: '20px',
                          color: 'white',
                        }}>
                          <span style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: 'white',
                            animation: isVisitPaused ? 'none' : 'pulse 1s infinite',
                            opacity: isVisitPaused ? 0.5 : 1,
                          }} />
                          <span style={{ fontWeight: 600, fontSize: '18px', fontFamily: 'monospace' }}>
                            {formatDuration(visitRecordingDuration)}
                          </span>
                        </div>
                      </div>

                      {!isVisitPaused && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '3px',
                          height: '40px',
                          marginBottom: '16px',
                        }}>
                          {[...Array(12)].map((_, i) => (
                            <div
                              key={i}
                              style={{
                                width: '4px',
                                height: '100%',
                                background: 'var(--error)',
                                borderRadius: '2px',
                                animation: `waveform 0.5s ease-in-out ${i * 0.05}s infinite alternate`,
                              }}
                            />
                          ))}
                        </div>
                      )}

                      <p style={{
                        textAlign: 'center',
                        fontWeight: 500,
                        color: isVisitPaused ? '#92400E' : '#991B1B',
                        marginBottom: '16px',
                      }}>
                        {isVisitPaused ? 'Recording Paused' : 'Recording in progress...'}
                      </p>

                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button
                          onClick={isVisitPaused ? resumeVisitRecording : pauseVisitRecording}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '10px 16px',
                            borderRadius: '6px',
                            border: 'none',
                            background: 'var(--bg-white)',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500,
                          }}
                        >
                          {isVisitPaused ? (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                              </svg>
                              Resume
                            </>
                          ) : (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="6" y="4" width="4" height="16"/>
                                <rect x="14" y="4" width="4" height="16"/>
                              </svg>
                              Pause
                            </>
                          )}
                        </button>

                        <button
                          onClick={restartVisitRecording}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '10px 16px',
                            borderRadius: '6px',
                            border: 'none',
                            background: 'var(--bg-white)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500,
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                          </svg>
                          Restart
                        </button>

                        <button
                          onClick={stopVisitRecording}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '10px 20px',
                            borderRadius: '6px',
                            border: 'none',
                            background: '#EF4444',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500,
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="4" y="4" width="16" height="16" rx="2"/>
                          </svg>
                          Stop & Process
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Processing state */}
              {visitAIProcessing && (
                <div style={{
                  background: 'linear-gradient(135deg, #EDE9FE 0%, #DDD6FE 100%)',
                  borderRadius: '8px',
                  padding: '24px',
                  textAlign: 'center',
                  marginBottom: '16px',
                  border: '1px solid #A78BFA',
                }}>
                  <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: '#8B5CF6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                    </svg>
                  </div>
                  <p style={{ fontWeight: 500, color: '#5B21B6', marginBottom: '4px' }}>
                    Processing Visit Recording...
                  </p>
                  <p style={{ fontSize: '12px', color: '#7C3AED' }}>
                    Transcribing audio and extracting clinical content
                  </p>
                </div>
              )}

              {/* Error state */}
              {visitAIError && (
                <div style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" style={{ marginTop: '2px', flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                  </svg>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13px', color: '#DC2626', marginBottom: '8px' }}>{visitAIError}</p>
                    <button
                      onClick={clearVisitAI}
                      style={{
                        padding: '6px 12px',
                        background: 'var(--bg-white)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}

              {/* Visit AI Results */}
              {visitAIOutput && (
                <div>
                  <div style={{
                    background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '12px',
                    border: '1px solid #86EFAC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>
                      </svg>
                      <span style={{ fontWeight: 500, color: '#059669', fontSize: '13px' }}>
                        Visit Processed Successfully
                      </span>
                    </div>
                    <button
                      onClick={clearVisitAI}
                      style={{
                        padding: '4px 8px',
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        border: 'none',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      Clear
                    </button>
                  </div>

                  {visitAIOutput.transcriptSummary && (
                    <div style={{
                      background: 'var(--bg-gray)',
                      borderRadius: '6px',
                      padding: '10px',
                      marginBottom: '12px',
                    }}>
                      <p style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Visit Summary
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {visitAIOutput.transcriptSummary}
                      </p>
                    </div>
                  )}

                  <p style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Extracted Content (click &quot;Generate Note&quot; in toolbar to apply)
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      { key: 'hpiFromVisit', label: 'HPI', icon: '📝' },
                      { key: 'rosFromVisit', label: 'Review of Systems', icon: '📋' },
                      { key: 'examFromVisit', label: 'Physical Exam', icon: '🩺' },
                      { key: 'assessmentFromVisit', label: 'Assessment', icon: '💡' },
                      { key: 'planFromVisit', label: 'Plan', icon: '📌' },
                    ].map(section => {
                      const content = visitAIOutput[section.key as keyof VisitAIOutput]
                      if (!content || typeof content !== 'string') return null

                      const confidence = visitAIOutput.confidence?.[section.key.replace('FromVisit', '') as keyof typeof visitAIOutput.confidence]
                      const confidenceColor = confidence && confidence >= 0.8 ? '#059669'
                        : confidence && confidence >= 0.6 ? '#D97706'
                        : '#DC2626'

                      return (
                        <div
                          key={section.key}
                          style={{
                            background: 'var(--bg-white)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            padding: '10px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '12px' }}>{section.icon}</span>
                              <span style={{ fontWeight: 500, fontSize: '12px', color: 'var(--text-primary)' }}>
                                {section.label}
                              </span>
                            </div>
                            {confidence && (
                              <span style={{
                                fontSize: '10px',
                                padding: '2px 6px',
                                borderRadius: '10px',
                                background: `${confidenceColor}15`,
                                color: confidenceColor,
                              }}>
                                {Math.round(confidence * 100)}%
                              </span>
                            )}
                          </div>
                          <p style={{
                            fontSize: '12px',
                            color: 'var(--text-secondary)',
                            lineHeight: 1.5,
                            whiteSpace: 'pre-wrap',
                            maxHeight: '80px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {content}
                          </p>
                        </div>
                      )
                    })}
                  </div>

                  <div style={{
                    marginTop: '12px',
                    padding: '10px',
                    background: '#FEF3C7',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                    <span style={{ fontSize: '11px', color: '#92400E' }}>
                      Click <strong>&quot;Generate Note&quot;</strong> in the note toolbar to apply this content
                    </span>
                  </div>
                </div>
              )}

              {/* Tips */}
              {!isVisitRecording && !visitAIProcessing && !visitAIOutput && (
                <div style={{
                  background: 'var(--bg-gray)',
                  borderRadius: '8px',
                  padding: '12px',
                }}>
                  <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    Recording Tips:
                  </p>
                  <ul style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, paddingLeft: '16px' }}>
                    <li>Position microphone clearly</li>
                    <li>Use Pause during interruptions</li>
                    <li>Works with visits up to 30+ minutes</li>
                    <li>AI extracts HPI, ROS, Exam, Assessment, Plan</li>
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes waveform {
          from { transform: scaleY(0.3); }
          to { transform: scaleY(1); }
        }
      `}</style>
    </>
  )
}
