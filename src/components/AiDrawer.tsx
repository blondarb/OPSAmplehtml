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
  selectedDiagnoses?: Array<{ id: string; name: string; icd10?: string }>
}

export default function AiDrawer({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  patient,
  noteData,
  updateNote,
  selectedDiagnoses = [],
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
  const [readingLevel, setReadingLevel] = useState<'simple' | 'standard' | 'advanced'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sevaro-handout-reading-level')
      if (saved === 'simple' || saved === 'standard' || saved === 'advanced') return saved
    }
    return 'standard'
  })
  const [handoutLanguage, setHandoutLanguage] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sevaro-handout-language') || ''
    }
    return ''
  })

  const tabs = [
    { id: 'ask-ai', label: 'Ask AI' },
    { id: 'summarize', label: 'Summary' },
    { id: 'handout', label: 'Handout' },
  ]

  // Helper to get user settings from localStorage
  const getUserSettings = () => {
    try {
      const savedSettings = localStorage.getItem('sevaro-user-settings')
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings)
        return {
          globalAiInstructions: parsed.globalAiInstructions || '',
          documentationStyle: parsed.documentationStyle || 'detailed',
          preferredTerminology: parsed.preferredTerminology || 'standard',
          practiceName: parsed.practiceName || '',
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
    return null
  }

  const handleLanguageChange = (value: string) => {
    setHandoutLanguage(value)
    localStorage.setItem('sevaro-handout-language', value)
  }

  const askAI = async () => {
    if (!question.trim()) return

    setLoading(true)
    setAiResponse('')

    try {
      const userSettings = getUserSettings()
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
          userSettings,
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

      const userSettings = getUserSettings()
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
          userSettings,
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

  const getReadingLevelInstructions = (level: 'simple' | 'standard' | 'advanced') => {
    switch (level) {
      case 'simple':
        return 'Write at a 5th grade reading level. Use short sentences and simple words. Avoid all medical jargon — explain everything in everyday language.'
      case 'advanced':
        return 'Write at a college reading level. Use full medical terminology and detailed clinical explanations. Assume the reader has health literacy.'
      default:
        return 'Write at an 8th grade reading level. Use some medical terms but always explain them in parentheses or plain language.'
    }
  }

  const handleReadingLevelChange = (level: 'simple' | 'standard' | 'advanced') => {
    setReadingLevel(level)
    localStorage.setItem('sevaro-handout-reading-level', level)
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
      stroke: 'Stroke Prevention',
      dementia: 'Memory & Dementia Care',
      vertigo: 'Vertigo & Dizziness',
    }

    try {
      const userSettings = getUserSettings()
      const patientName = patient ? `${patient.first_name}` : 'Patient'

      // Build the prompt based on whether it's a custom/personalized handout or a standard one
      let question: string
      let context: Record<string, string>

      // Resolve condition name: diagnosis-based selections use "dx:" prefix
      const isDiagnosisBased = selectedCondition.startsWith('dx:')
      const resolvedConditionName = isDiagnosisBased
        ? selectedCondition.slice(3) // strip "dx:" prefix
        : conditionNames[selectedCondition] || selectedCondition

      const readingInstructions = getReadingLevelInstructions(readingLevel)
      const languageInstructions = handoutLanguage.trim()
        ? `IMPORTANT: Write the entire handout in ${handoutLanguage.trim()}. All headings, content, and instructions must be in ${handoutLanguage.trim()}.`
        : ''

      if (isDiagnosisBased) {
        // Diagnosis-based handout from this visit's selections
        question = `Create a patient education handout for ${resolvedConditionName}.

Format the handout with these sections:
1. **What is ${resolvedConditionName}?** - Brief explanation in simple terms
2. **Common Symptoms** - Bullet list of key symptoms
3. **Treatment Options** - Overview of medications and lifestyle changes
4. **When to Seek Help** - Warning signs to watch for
5. **Helpful Tips** - 3-5 practical tips for managing the condition

Reading level instructions: ${readingInstructions}
${languageInstructions}`

        context = {
          patient: patientName,
          condition: resolvedConditionName,
        }
      } else if (selectedCondition === 'custom') {
        // Personalized handout based on this visit's note
        question = `Create a personalized patient education handout for ${patientName} based on their visit today.

Use the following information from their clinical note:
- Chief Complaint: ${noteData.chiefComplaint?.join(', ') || 'Not specified'}
- Assessment/Diagnosis: ${noteData.assessment || 'Not yet documented'}
- Treatment Plan: ${noteData.plan || 'Not yet documented'}

Format the handout with these sections:
1. **Your Visit Summary** - Brief, friendly recap of why they came in and what was found
2. **Your Diagnosis Explained** - Simple explanation of their condition(s)
3. **Your Treatment Plan** - What medications/treatments were prescribed and why
4. **What You Can Do at Home** - Lifestyle tips and self-care specific to their condition
5. **Warning Signs** - When to call the office or seek emergency care
6. **Follow-Up** - Reminder about next steps

Write this as if speaking directly to ${patientName}. Use "you" and "your" throughout.
Make it feel personal and specific to their situation, not generic.

Reading level instructions: ${readingInstructions}
${languageInstructions}`

        context = {
          patient: patientName,
          chiefComplaint: noteData.chiefComplaint?.join(', ') || '',
          assessment: noteData.assessment || '',
          plan: noteData.plan || '',
          hpi: noteData.hpi || '',
        }
      } else {
        // Standard condition-based handout
        question = `Create a patient education handout for ${conditionNames[selectedCondition] || selectedCondition}.

Format the handout with these sections:
1. **What is ${conditionNames[selectedCondition]}?** - Brief explanation in simple terms
2. **Common Symptoms** - Bullet list of key symptoms
3. **Treatment Options** - Overview of medications and lifestyle changes
4. **When to Seek Help** - Warning signs to watch for
5. **Helpful Tips** - 3-5 practical tips for managing the condition

Reading level instructions: ${readingInstructions}
${languageInstructions}`

        context = {
          patient: patientName,
          condition: selectedCondition,
        }
      }

      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          context,
          userSettings,
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
      <div className="ai-drawer show" style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '420px',
        maxWidth: '100vw', // Responsive: never exceed viewport
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
          background: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/>
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
                    background: 'var(--bg-white)',
                    color: 'var(--text-primary)',
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
                  background: 'var(--ai-response-bg, linear-gradient(135deg, #F0FDFA 0%, #ECFDF5 100%))',
                  borderLeft: '3px solid var(--primary)',
                  borderRadius: '8px',
                  padding: '16px',
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
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
                      background: 'var(--ai-badge-bg, #D1FAE5)',
                      color: 'var(--ai-badge-text, #059669)',
                    }}>
                      AI Generated
                    </span>
                    <button
                      onClick={() => copyToClipboard(aiResponse)}
                      style={{
                        marginLeft: 'auto',
                        padding: '4px 12px',
                        fontSize: '12px',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        background: 'var(--bg-white)',
                        color: 'var(--text-secondary)',
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
                  background: 'var(--ai-response-bg, linear-gradient(135deg, #F0FDFA 0%, #ECFDF5 100%))',
                  borderLeft: '3px solid var(--primary)',
                  borderRadius: '8px',
                  padding: '16px',
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
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
                      background: 'var(--ai-badge-bg, #D1FAE5)',
                      color: 'var(--ai-badge-text, #059669)',
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
                        color: 'var(--text-secondary)',
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
                Create personalized educational handouts based on this visit.
              </p>

              {/* Current Note Context */}
              {(noteData.chiefComplaint?.length > 0 || noteData.assessment || noteData.plan) && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px',
                  background: 'var(--bg-gray)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    From Current Note
                  </div>
                  {Array.isArray(noteData.chiefComplaint) && noteData.chiefComplaint.length > 0 && (
                    <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      <strong>Chief Complaint:</strong> {noteData.chiefComplaint.join(', ')}
                    </div>
                  )}
                  {noteData.assessment && (
                    <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      <strong>Assessment:</strong> {noteData.assessment.substring(0, 100)}{noteData.assessment.length > 100 ? '...' : ''}
                    </div>
                  )}
                </div>
              )}

              <select
                value={selectedCondition}
                onChange={(e) => setSelectedCondition(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  marginBottom: '12px',
                  fontSize: '14px',
                  background: 'var(--bg-white)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="">Select a condition...</option>
                {selectedDiagnoses.length > 0 && (
                  <optgroup label="From this visit">
                    {selectedDiagnoses.map(d => (
                      <option key={d.id} value={`dx:${d.name}`}>
                        {d.name}{d.icd10 ? ` (${d.icd10})` : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Common conditions">
                  <option value="migraine">Migraine</option>
                  <option value="tension">Tension Headache</option>
                  <option value="cluster">Cluster Headache</option>
                  <option value="epilepsy">Epilepsy</option>
                  <option value="parkinsons">Parkinson Disease</option>
                  <option value="ms">Multiple Sclerosis</option>
                  <option value="neuropathy">Peripheral Neuropathy</option>
                  <option value="stroke">Stroke Prevention</option>
                  <option value="dementia">Memory & Dementia</option>
                  <option value="vertigo">Vertigo & Dizziness</option>
                </optgroup>
                <optgroup label="Personalized">
                  <option value="custom">Based on this visit (personalized)</option>
                </optgroup>
              </select>

              {selectedCondition === 'custom' && (
                <p style={{ fontSize: '12px', color: 'var(--primary)', marginBottom: '12px', fontStyle: 'italic' }}>
                  The handout will be personalized using your patient's diagnosis, treatment plan, and medications from this note.
                </p>
              )}

              {/* Reading Level Selector */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', display: 'block' }}>
                  Reading Level
                </label>
                <div style={{
                  display: 'flex',
                  background: 'var(--bg-gray)',
                  borderRadius: '8px',
                  padding: '3px',
                  gap: '2px',
                }}>
                  {([
                    { value: 'simple' as const, label: 'Simple', desc: '5th grade' },
                    { value: 'standard' as const, label: 'Standard', desc: '8th grade' },
                    { value: 'advanced' as const, label: 'Advanced', desc: 'College' },
                  ]).map(level => (
                    <button
                      key={level.value}
                      onClick={() => handleReadingLevelChange(level.value)}
                      style={{
                        flex: 1,
                        padding: '8px 4px',
                        borderRadius: '6px',
                        border: 'none',
                        background: readingLevel === level.value ? 'var(--bg-white)' : 'transparent',
                        boxShadow: readingLevel === level.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{
                        fontSize: '13px',
                        fontWeight: readingLevel === level.value ? 600 : 500,
                        color: readingLevel === level.value ? 'var(--primary)' : 'var(--text-secondary)',
                      }}>
                        {level.label}
                      </div>
                      <div style={{
                        fontSize: '10px',
                        color: readingLevel === level.value ? 'var(--primary)' : 'var(--text-muted)',
                        marginTop: '2px',
                      }}>
                        {level.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Language Selection */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>
                  Language
                </label>
                <input
                  type="text"
                  value={handoutLanguage}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  placeholder="Leave blank for English"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '13px',
                    background: 'var(--bg-white)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

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
                {handoutLoading ? 'Generating...' : selectedCondition === 'custom' ? 'Generate Personalized Handout' : selectedCondition.startsWith('dx:') ? 'Generate Diagnosis Handout' : 'Generate Handout'}
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

              {handoutResult && !handoutLoading && (() => {
                const practiceName = getUserSettings()?.practiceName || ''
                return (
                  <>
                    <div style={{
                      marginTop: '16px',
                      background: 'var(--ai-response-bg, linear-gradient(135deg, #F0FDFA 0%, #ECFDF5 100%))',
                      borderLeft: '3px solid var(--primary)',
                      borderRadius: '8px',
                      padding: '16px',
                    }}>
                      {practiceName && (
                        <div style={{
                          textAlign: 'center',
                          marginBottom: '12px',
                          paddingBottom: '12px',
                          borderBottom: '1px solid var(--border)',
                        }}>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {practiceName}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Patient Education Handout
                          </div>
                        </div>
                      )}
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                        {handoutResult}
                      </div>
                      <div style={{
                        marginTop: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap',
                      }} data-no-print>
                        <span style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: 'var(--ai-badge-bg, #D1FAE5)',
                          color: 'var(--ai-badge-text, #059669)',
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
                            color: 'var(--text-secondary)',
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
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                          onClick={() => {
                            const printWrapper = document.getElementById('handout-print-wrapper')
                            if (printWrapper) {
                              printWrapper.innerHTML = `
                                <div class="handout-print-header">
                                  ${practiceName ? `<div class="handout-print-practice">${practiceName}</div>` : ''}
                                  <div class="handout-print-subtitle">Patient Education Handout</div>
                                </div>
                                <div class="handout-print-content">${handoutResult.replace(/\n/g, '<br/>')}</div>
                                <div class="handout-print-footer">
                                  <span>${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                                  ${practiceName ? `<span>${practiceName}</span>` : ''}
                                </div>
                              `
                            }
                            window.print()
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                          </svg>
                          Print
                        </button>
                      </div>
                    </div>
                    {/* Hidden print wrapper */}
                    <div id="handout-print-wrapper" className="handout-print-wrapper" />
                  </>
                )
              })()}
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
