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
}: AiDrawerProps) {
  const [question, setQuestion] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedInsertField, setSelectedInsertField] = useState<string>('hpi')

  // Voice recording for Document tab
  const {
    isRecording,
    isTranscribing,
    error: recordingError,
    transcribedText,
    recordingDuration,
    startRecording,
    stopRecording,
    clearTranscription,
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
      setAiResponse(data.response || data.error || 'No response')
    } catch (error) {
      setAiResponse('Error generating chart prep')
    }

    setLoading(false)
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
              <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                AI-generated pre-visit summary based on patient history.
              </p>
              <button
                onClick={generateChartPrep}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 20px',
                  background: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  marginBottom: '16px',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? (
                  <>
                    <span className="animate-spin">...</span>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                    Generate Chart Prep
                  </>
                )}
              </button>

              {aiResponse && (
                <div style={{
                  background: 'linear-gradient(135deg, #F0FDFA 0%, #ECFDF5 100%)',
                  border: '1px solid #A7F3D0',
                  borderRadius: '8px',
                  padding: '16px',
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
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
