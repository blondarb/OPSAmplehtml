'use client'

import { useState } from 'react'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'

interface AiDrawerProps {
  isOpen: boolean
  onClose: () => void
  activeTab: string
  setActiveTab: (tab: string) => void
  patient: any
  noteData: any
  updateNote: (field: string, value: any) => void
  activeTextField?: string | null
  updateRawDictation?: (field: string, rawText: string) => void
}

export default function AiDrawer({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  patient,
  noteData,
  updateNote,
  activeTextField,
  updateRawDictation,
}: AiDrawerProps) {
  const [question, setQuestion] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [chartPrepSections, setChartPrepSections] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [selectedInsertField, setSelectedInsertField] = useState<string>('hpi')
  const [insertedSections, setInsertedSections] = useState<Set<string>>(new Set())

  // Chart Prep specific state
  const [prepNotes, setPrepNotes] = useState<Array<{ text: string; timestamp: string; category: string }>>([])
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['patientSummary', 'keyConsiderations']))

  // Voice recording for Document tab
  const {
    isRecording,
    isTranscribing,
    error: recordingError,
    transcribedText,
    rawText,
    recordingDuration,
    startRecording,
    stopRecording,
    clearTranscription,
  } = useVoiceRecorder()

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

  // Format duration as MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Insert transcribed text into selected field
  const insertTranscription = (field: string) => {
    if (transcribedText) {
      const currentValue = noteData[field] || ''
      const newValue = currentValue ? `${currentValue} ${transcribedText}` : transcribedText
      updateNote(field, newValue)
      // Also save raw dictation if available
      if (rawText && updateRawDictation) {
        updateRawDictation(field, rawText)
      }
      clearTranscription()
    }
  }

  const tabs = [
    { id: 'chart-prep', label: 'Chart Prep' },
    { id: 'document', label: 'Document' },
    { id: 'ask-ai', label: 'Ask AI' },
    { id: 'summarize', label: 'Summary' },
    { id: 'handout', label: 'Handout' },
  ]

  const askAI = async () => {
    if (!question.trim()) return

    setLoading(true)
    setAiResponse('')

    try {
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          context: {
            patient: patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown',
            chiefComplaint: noteData.chiefComplaint?.join(', ') || '',
            hpi: noteData.hpi || '',
          },
        }),
      })

      const data = await response.json()

      if (data.error) {
        setAiResponse(`Error: ${data.error}`)
      } else {
        setAiResponse(data.response)
      }
    } catch (error) {
      setAiResponse('Error connecting to AI service. Please check your API key configuration.')
    }

    setLoading(false)
  }

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
        }),
      })

      const data = await response.json()
      if (data.sections) {
        setChartPrepSections(data.sections)
        setAiResponse('') // Clear old text response
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
    { key: 'patientSummary', label: 'Patient Summary', targetField: null, icon: '👤' },
    { key: 'suggestedHPI', label: 'Suggested HPI', targetField: 'hpi', icon: '📝' },
    { key: 'relevantHistory', label: 'Relevant History', targetField: null, icon: '📋' },
    { key: 'currentMedications', label: 'Current Medications', targetField: null, icon: '💊' },
    { key: 'imagingFindings', label: 'Imaging Findings', targetField: null, icon: '🔬' },
    { key: 'scaleTrends', label: 'Clinical Scale Trends', targetField: null, icon: '📊' },
    { key: 'keyConsiderations', label: 'Key Considerations', targetField: null, icon: '⚠️' },
    { key: 'suggestedAssessment', label: 'Suggested Assessment', targetField: 'assessment', icon: '🎯' },
    { key: 'suggestedPlan', label: 'Suggested Plan', targetField: 'plan', icon: '📌' },
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

    // Check for imaging-related keywords
    if (lower.includes('mri') || lower.includes('ct') || lower.includes('scan') ||
        lower.includes('imaging') || lower.includes('x-ray') || lower.includes('ultrasound') ||
        lower.includes('eeg') || lower.includes('emg')) {
      return 'imaging'
    }

    // Check for lab-related keywords
    if (lower.includes('lab') || lower.includes('blood') || lower.includes('level') ||
        lower.includes('test result') || lower.includes('hemoglobin') || lower.includes('glucose') ||
        lower.includes('creatinine') || lower.includes('liver') || lower.includes('thyroid')) {
      return 'labs'
    }

    // Check for referral-related keywords
    if (lower.includes('referral') || lower.includes('referred') || lower.includes('consult') ||
        lower.includes('primary care') || lower.includes('specialist') || lower.includes('sent by')) {
      return 'referral'
    }

    // Check for history-related keywords
    if (lower.includes('history') || lower.includes('past medical') || lower.includes('pmh') ||
        lower.includes('surgical') || lower.includes('family history') || lower.includes('social')) {
      return 'history'
    }

    // Check for assessment-related keywords
    if (lower.includes('assessment') || lower.includes('impression') || lower.includes('diagnosis') ||
        lower.includes('likely') || lower.includes('suspect') || lower.includes('differential') ||
        lower.includes('think') || lower.includes('plan') || lower.includes('recommend')) {
      return 'assessment'
    }

    return 'general'
  }

  // Add prep note when transcription completes - auto-categorize
  const addPrepNote = () => {
    console.log('addPrepNote called, prepTranscribedText:', prepTranscribedText)
    if (prepTranscribedText && prepTranscribedText.trim()) {
      const autoCategory = detectCategory(prepTranscribedText)
      console.log('Auto-detected category:', autoCategory)
      const newNote = {
        text: prepTranscribedText.trim(),
        timestamp: new Date().toISOString(),
        category: autoCategory,
      }
      console.log('Adding new note:', newNote)
      setPrepNotes(prev => {
        const updated = [...prev, newNote]
        console.log('Updated prepNotes:', updated)
        return updated
      })
      clearPrepTranscription()
    } else {
      console.log('prepTranscribedText is empty or falsy, not adding note')
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

    // Also add any prep notes to HPI
    if (prepNotes.length > 0) {
      const prepNotesText = prepNotes.map(n => `[${n.category}] ${n.text}`).join('\n\n')
      fieldUpdates.hpi.unshift(`--- Pre-Visit Notes ---\n${prepNotesText}\n--- End Pre-Visit Notes ---\n`)
    }

    // Update each field
    Object.entries(fieldUpdates).forEach(([field, contents]) => {
      if (contents.length > 0) {
        const currentValue = noteData[field] || ''
        const newValue = currentValue
          ? `${currentValue}\n\n${contents.join('\n\n')}`
          : contents.join('\n\n')
        updateNote(field, newValue)
      }
    })

    // Mark all as inserted
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
          background: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <span style={{ fontWeight: 600 }}>AI Tools</span>
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
          overflowX: 'auto',
        }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                border: 'none',
                background: activeTab === tab.id ? 'var(--primary)' : 'var(--bg-gray)',
                color: activeTab === tab.id ? 'white' : 'var(--text-secondary)',
                whiteSpace: 'nowrap',
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
              {/* Workflow description */}
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
                    // Start button
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
                        background: isPrepTranscribing ? 'var(--bg-gray)' : 'var(--primary)',
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
                    // Recording controls: timer + pause/resume + stop + restart
                    <>
                      {/* Timer display */}
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

                      {/* Pause/Resume button */}
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
                          // Play icon
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3"/>
                          </svg>
                        ) : (
                          // Pause icon
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="4" width="4" height="16"/>
                            <rect x="14" y="4" width="4" height="16"/>
                          </svg>
                        )}
                      </button>

                      {/* Restart button */}
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

                      {/* Stop button */}
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
                          background: 'var(--primary)',
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
                      <button onClick={addPrepNote} style={{ flex: 1, padding: '6px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>
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
                        borderLeft: '3px solid var(--info)',
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

              {/* Key Points Summary - shown when sections exist */}
              {chartPrepSections && chartPrepSections.keyConsiderations && (
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
                    if (!content || section.key === 'keyConsiderations') return null // Skip key considerations, shown above

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
                        {/* Collapsible Header */}
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

                        {/* Expandable Content */}
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
                                  background: 'var(--primary)',
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

          {/* Document Tab */}
          {activeTab === 'document' && (
            <div>
              <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Record your voice and AI will transcribe it using Whisper.
              </p>

              {/* Recording UI */}
              <div style={{
                background: isRecording ? 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)' : 'var(--bg-gray)',
                borderRadius: '8px',
                padding: '24px',
                textAlign: 'center',
                marginBottom: '16px',
                border: isRecording ? '2px solid var(--error)' : '1px solid var(--border)',
              }}>
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isTranscribing}
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    background: isRecording ? 'var(--error)' : isTranscribing ? 'var(--bg-gray)' : 'var(--primary)',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                    cursor: isTranscribing ? 'wait' : 'pointer',
                    animation: isRecording ? 'pulse 1.5s infinite' : 'none',
                    boxShadow: isRecording ? '0 0 0 8px rgba(239, 68, 68, 0.2)' : 'none',
                  }}
                >
                  {isTranscribing ? (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                    </svg>
                  ) : isRecording ? (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  ) : (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/>
                    </svg>
                  )}
                </button>

                {isRecording && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginBottom: '8px',
                  }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--error)',
                      animation: 'pulse 1s infinite',
                    }} />
                    <span style={{ fontWeight: 600, color: 'var(--error)', fontSize: '18px' }}>
                      {formatDuration(recordingDuration)}
                    </span>
                  </div>
                )}

                <p style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {isTranscribing ? 'Transcribing...' : isRecording ? 'Recording... Click to Stop' : 'Click to Start Recording'}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {isRecording ? 'Speak clearly into your microphone' : 'AI will transcribe your speech using Whisper'}
                </p>
              </div>

              {/* Error message */}
              {recordingError && (
                <div style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                  </svg>
                  <span style={{ fontSize: '13px', color: '#DC2626' }}>{recordingError}</span>
                </div>
              )}

              {/* Transcribed text */}
              {transcribedText && (
                <div style={{
                  background: 'linear-gradient(135deg, #F0FDFA 0%, #ECFDF5 100%)',
                  border: '1px solid #A7F3D0',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '16px',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px',
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>
                    </svg>
                    <span style={{ fontWeight: 500, color: '#059669', fontSize: '13px' }}>Transcription Complete</span>
                  </div>
                  <p style={{ fontSize: '14px', color: 'var(--text-primary)', marginBottom: '16px', lineHeight: 1.5 }}>
                    {transcribedText}
                  </p>

                  {/* Insert options */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                      Insert into:
                    </label>
                    <select
                      value={selectedInsertField}
                      onChange={(e) => setSelectedInsertField(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        fontSize: '13px',
                        marginBottom: '8px',
                      }}
                    >
                      <option value="hpi">HPI (History of Present Illness)</option>
                      <option value="assessment">Assessment</option>
                      <option value="plan">Plan</option>
                      <option value="ros">Review of Systems</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => insertTranscription(selectedInsertField)}
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        background: 'var(--primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      Insert Text
                    </button>
                    <button
                      onClick={clearTranscription}
                      style={{
                        padding: '10px 16px',
                        background: 'var(--bg-white)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )}

              {/* Tips */}
              <div style={{
                background: 'var(--bg-gray)',
                borderRadius: '8px',
                padding: '12px',
              }}>
                <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Tips for best results:
                </p>
                <ul style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, paddingLeft: '16px' }}>
                  <li>Speak clearly at a moderate pace</li>
                  <li>Minimize background noise</li>
                  <li>Use medical terminology as needed</li>
                </ul>
              </div>
            </div>
          )}

          {/* Ask AI Tab */}
          {activeTab === 'ask-ai' && (
            <div>
              <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Ask clinical questions and get AI-powered answers.
              </p>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && askAI()}
                  placeholder="Ask a clinical question..."
                  style={{
                    flex: 1,
                    padding: '12px',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={askAI}
                  disabled={loading || !question.trim()}
                  style={{
                    padding: '12px 16px',
                    background: 'var(--primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    opacity: loading || !question.trim() ? 0.7 : 1,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                  </svg>
                </button>
              </div>

              {/* Suggested questions */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                {[
                  'CGRP mechanism of action?',
                  'Botox dosing for migraine?',
                  'Migraine preventive options?',
                ].map(q => (
                  <button
                    key={q}
                    onClick={() => setQuestion(q)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '16px',
                      fontSize: '12px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-white)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>

              {loading && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '16px',
                  background: 'var(--bg-gray)',
                  borderRadius: '8px',
                }}>
                  <div style={{
                    display: 'flex',
                    gap: '4px',
                  }}>
                    <span style={{ animation: 'pulse 1s infinite' }}>.</span>
                    <span style={{ animation: 'pulse 1s infinite 0.2s' }}>.</span>
                    <span style={{ animation: 'pulse 1s infinite 0.4s' }}>.</span>
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>AI is thinking...</span>
                </div>
              )}

              {aiResponse && !loading && (
                <div style={{
                  background: 'linear-gradient(135deg, #F0FDFA 0%, #ECFDF5 100%)',
                  borderLeft: '3px solid var(--primary)',
                  borderRadius: '8px',
                  padding: '16px',
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                    {aiResponse}
                  </div>
                  <div style={{
                    marginTop: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <span style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: '#D1FAE5',
                      color: '#059669',
                    }}>
                      AI Generated
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Summarize Tab */}
          {activeTab === 'summarize' && (
            <div>
              <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Generate a patient-friendly summary of the visit.
              </p>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {['Simple', 'Standard', 'Detailed'].map(level => (
                  <button
                    key={level}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      border: '1px solid var(--border)',
                      background: level === 'Standard' ? 'var(--primary)' : 'var(--bg-white)',
                      color: level === 'Standard' ? 'white' : 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    {level}
                  </button>
                ))}
              </div>
              <button
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Generate Patient Summary
              </button>
            </div>
          )}

          {/* Handout Tab */}
          {activeTab === 'handout' && (
            <div>
              <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Create educational handouts for the patient.
              </p>
              <select style={{
                width: '100%',
                padding: '12px',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '14px',
              }}>
                <option>Select a condition...</option>
                <option>Migraine</option>
                <option>Tension Headache</option>
                <option>Cluster Headache</option>
              </select>
              <button
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Generate Handout
              </button>
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
      `}</style>
    </>
  )
}
