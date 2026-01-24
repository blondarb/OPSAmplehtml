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
  const [summaryResult, setSummaryResult] = useState('')
  const [handoutResult, setHandoutResult] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [handoutLoading, setHandoutLoading] = useState(false)

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

  const generateSummary = async () => {
    setSummaryLoading(true)
    setSummaryResult('')

    try {
      const levelInstructions = {
        'Simple': 'Use simple language a 5th grader could understand. Keep it to 2-3 sentences.',
        'Standard': 'Use patient-friendly language. Keep it to a short paragraph.',
        'Detailed': 'Provide a comprehensive summary with all relevant details, but still in patient-friendly language.',
      }

      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: `Generate a ${summaryLevel.toLowerCase()} patient-friendly summary of this visit. ${levelInstructions[summaryLevel as keyof typeof levelInstructions]}

Include:
- Why they came in (chief complaint)
- What was found
- What the plan is

Do NOT use medical jargon. Write as if explaining to the patient directly.`,
          context: {
            patient: patient ? `${patient.first_name} ${patient.last_name}` : 'The patient',
            chiefComplaint: noteData.chiefComplaint?.join(', ') || 'General consultation',
            hpi: noteData.hpi || '',
            assessment: noteData.assessment || '',
            plan: noteData.plan || '',
          },
        }),
      })

      const data = await response.json()
      if (data.error) {
        setSummaryResult(`Error: ${data.error}`)
      } else {
        setSummaryResult(data.response)
      }
    } catch (error) {
      setSummaryResult('Error connecting to AI service. Please check your API key configuration.')
    }

    setSummaryLoading(false)
  }

  const generateHandout = async () => {
    if (!selectedCondition) return

    setHandoutLoading(true)
    setHandoutResult('')

    const conditionNames: Record<string, string> = {
      migraine: 'Migraine',
      tension: 'Tension-Type Headache',
      cluster: 'Cluster Headache',
      epilepsy: 'Epilepsy',
      parkinsons: "Parkinson's Disease",
      ms: 'Multiple Sclerosis',
      neuropathy: 'Peripheral Neuropathy',
    }

    try {
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: `Create a patient education handout for ${conditionNames[selectedCondition] || selectedCondition}.

Format the handout with these sections:
1. **What is ${conditionNames[selectedCondition]}?** - Brief explanation in simple terms
2. **Common Symptoms** - Bullet list of key symptoms
3. **Treatment Options** - Overview of medications and lifestyle changes
4. **When to Seek Help** - Warning signs to watch for
5. **Helpful Tips** - 3-5 practical tips for managing the condition

Use patient-friendly language. Avoid medical jargon. Keep it informative but not overwhelming.`,
          context: {
            patient: patient ? `${patient.first_name} ${patient.last_name}` : 'Patient',
            condition: selectedCondition,
          },
        }),
      })

      const data = await response.json()
      if (data.error) {
        setHandoutResult(`Error: ${data.error}`)
      } else {
        setHandoutResult(data.response)
      }
    } catch (error) {
      setHandoutResult('Error connecting to AI service. Please check your API key configuration.')
    }

    setHandoutLoading(false)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
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
                onClick={generateSummary}
                disabled={summaryLoading}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  opacity: summaryLoading ? 0.7 : 1,
                }}
              >
                {summaryLoading ? 'Generating...' : 'Generate Patient Summary'}
              </button>

              {summaryLoading && (
                <div style={{
                  marginTop: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '16px',
                  background: 'var(--bg-gray)',
                  borderRadius: '8px',
                }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <span style={{ animation: 'pulse 1s infinite' }}>.</span>
                    <span style={{ animation: 'pulse 1s infinite 0.2s' }}>.</span>
                    <span style={{ animation: 'pulse 1s infinite 0.4s' }}>.</span>
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Creating summary...</span>
                </div>
              )}

              {summaryResult && !summaryLoading && (
                <div style={{
                  marginTop: '16px',
                  background: 'linear-gradient(135deg, #F0FDFA 0%, #ECFDF5 100%)',
                  borderLeft: '3px solid var(--primary)',
                  borderRadius: '8px',
                  padding: '16px',
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                    {summaryResult}
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
                    <button
                      onClick={() => copyToClipboard(summaryResult)}
                      style={{
                        marginLeft: 'auto',
                        padding: '4px 12px',
                        fontSize: '12px',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        background: 'var(--bg-white)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                      </svg>
                      Copy
                    </button>
                  </div>
                </div>
              )}
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
                onClick={generateHandout}
                disabled={handoutLoading || !selectedCondition}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  opacity: handoutLoading || !selectedCondition ? 0.7 : 1,
                }}
              >
                {handoutLoading ? 'Generating...' : 'Generate Handout'}
              </button>

              {handoutLoading && (
                <div style={{
                  marginTop: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '16px',
                  background: 'var(--bg-gray)',
                  borderRadius: '8px',
                }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <span style={{ animation: 'pulse 1s infinite' }}>.</span>
                    <span style={{ animation: 'pulse 1s infinite 0.2s' }}>.</span>
                    <span style={{ animation: 'pulse 1s infinite 0.4s' }}>.</span>
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Creating handout...</span>
                </div>
              )}

              {handoutResult && !handoutLoading && (
                <div style={{
                  marginTop: '16px',
                  background: 'linear-gradient(135deg, #F0FDFA 0%, #ECFDF5 100%)',
                  borderLeft: '3px solid var(--primary)',
                  borderRadius: '8px',
                  padding: '16px',
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                    {handoutResult}
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
                    <button
                      onClick={() => copyToClipboard(handoutResult)}
                      style={{
                        marginLeft: 'auto',
                        padding: '4px 12px',
                        fontSize: '12px',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        background: 'var(--bg-white)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                      </svg>
                      Copy
                    </button>
                    <button
                      style={{
                        padding: '4px 12px',
                        fontSize: '12px',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        background: 'var(--bg-white)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      onClick={() => window.print()}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                      </svg>
                      Print
                    </button>
                  </div>
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
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </>
  )
}
