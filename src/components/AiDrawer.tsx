'use client'

import { useState } from 'react'

interface AiDrawerProps {
  isOpen: boolean
  onClose: () => void
  activeTab: string
  setActiveTab: (tab: string) => void
  patient: any
  noteData: any
  updateNote: (field: string, value: any) => void
}

export default function AiDrawer({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  patient,
  noteData,
  updateNote,
}: AiDrawerProps) {
  const [question, setQuestion] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [summaryLevel, setSummaryLevel] = useState('Standard')
  const [selectedCondition, setSelectedCondition] = useState('')

  const tabs = [
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
            <span style={{ fontWeight: 600 }}>AI Assistant</span>
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
                background: activeTab === tab.id ? 'var(--primary)' : 'var(--bg-gray)',
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
                    onClick={() => setSummaryLevel(level)}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      border: '1px solid var(--border)',
                      background: summaryLevel === level ? 'var(--primary)' : 'var(--bg-white)',
                      color: summaryLevel === level ? 'white' : 'var(--text-secondary)',
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
              <select
                value={selectedCondition}
                onChange={(e) => setSelectedCondition(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  fontSize: '14px',
                }}
              >
                <option value="">Select a condition...</option>
                <option value="migraine">Migraine</option>
                <option value="tension">Tension Headache</option>
                <option value="cluster">Cluster Headache</option>
                <option value="epilepsy">Epilepsy</option>
                <option value="parkinsons">Parkinson Disease</option>
                <option value="ms">Multiple Sclerosis</option>
                <option value="neuropathy">Peripheral Neuropathy</option>
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
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </>
  )
}
