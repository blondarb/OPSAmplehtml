'use client'

import { useState, useCallback } from 'react'

interface PatientHistorySummaryProps {
  patient: any
  priorVisits: any[]
  medications: any[]
  allergies: any[]
  scoreHistory: any[]
  noteData: any
}

type SummaryMode = 'brief' | 'standard' | 'detailed'

export default function PatientHistorySummary({
  patient,
  priorVisits,
  medications,
  allergies,
  scoreHistory,
  noteData,
}: PatientHistorySummaryProps) {
  const [collapsed, setCollapsed] = useState(true)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState('')
  const [mode, setMode] = useState<SummaryMode>('standard')
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [editedSummary, setEditedSummary] = useState('')

  const hasPriorVisits = priorVisits && priorVisits.length > 0

  const generateSummary = useCallback(async () => {
    if (!hasPriorVisits) return

    setLoading(true)
    setSummary('')

    const modeInstructions: Record<SummaryMode, string> = {
      brief: 'Keep it to 2-3 sentences. Include only the visit purpose and any critical alerts (e.g., drug allergies, red flags).',
      standard: 'Include: visit purpose, key metrics/scores with trends, current treatment regimen, and a one-line summary of the most recent visit. Keep it under 150 words.',
      detailed: 'Include: visit purpose, all relevant metrics with trends, full treatment history, focus areas for today, and a detailed summary of recent visits. Be thorough but concise.',
    }

    // Build context from prior visits
    const visitSummaries = priorVisits.slice(0, 5).map(v => {
      const date = v.visit_date ? new Date(v.visit_date).toLocaleDateString() : 'Unknown date'
      const cc = Array.isArray(v.chief_complaint) ? v.chief_complaint.join(', ') : v.chief_complaint || ''
      const aiSummary = v.clinical_notes?.ai_summary || ''
      const hpi = v.clinical_notes?.hpi || ''
      const assessment = v.clinical_notes?.assessment || ''
      const plan = v.clinical_notes?.plan || ''
      return `Visit ${date} (${v.visit_type || 'visit'}): CC: ${cc}. ${aiSummary || `HPI: ${hpi.substring(0, 200)}. Assessment: ${assessment.substring(0, 200)}. Plan: ${plan.substring(0, 200)}`}`
    }).join('\n')

    // Build medication list
    const medList = medications
      .filter((m: any) => m.status === 'active')
      .map((m: any) => `${m.medication_name} ${m.dosage || ''} ${m.frequency || ''}`.trim())
      .join(', ') || 'None documented'

    // Build allergy list
    const allergyList = allergies
      .map((a: any) => `${a.allergen} (${a.severity || 'unknown severity'})`)
      .join(', ') || 'NKDA'

    // Build score history
    const scores = scoreHistory.slice(0, 5).map((s: any) => {
      const date = s.date ? new Date(s.date).toLocaleDateString() : ''
      return `${s.scaleName || s.scale_name}: ${s.score}/${s.maxScore || '?'} (${s.interpretation || ''}) ${date}`
    }).join('; ') || 'None'

    try {
      // Get user settings
      let userSettings = null
      try {
        const savedSettings = localStorage.getItem('sevaro-user-settings')
        if (savedSettings) {
          const parsed = JSON.parse(savedSettings)
          userSettings = {
            globalAiInstructions: parsed.globalAiInstructions || '',
            documentationStyle: parsed.documentationStyle || 'detailed',
          }
        }
      } catch (e) { /* ignore */ }

      const response = await fetch('/api/ai/chart-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dictation: `Generate a ${mode} longitudinal patient history summary for this returning patient.

${modeInstructions[mode]}

Patient: ${patient?.first_name || ''} ${patient?.last_name || ''}, ${patient?.gender || ''}, DOB: ${patient?.date_of_birth || 'unknown'}
Active Medications: ${medList}
Allergies: ${allergyList}
Clinical Scores: ${scores}

Prior Visit History:
${visitSummaries}

Format as a concise clinical summary. Use section headers if in standard or detailed mode. Do NOT use markdown formatting.`,
          context: {
            patient: `${patient?.first_name || ''} ${patient?.last_name || ''}`,
            chiefComplaint: noteData.chiefComplaint?.join(', ') || '',
          },
          userSettings,
        }),
      })

      const data = await response.json()
      if (data.error) {
        setSummary(`Error: ${data.error}`)
      } else {
        // chart-prep returns { summary, sections, alerts, suggestedFocus }
        const result = data.summary || data.response || ''
        setSummary(result)
        setEditedSummary(result)
      }
    } catch (error) {
      setSummary('Error connecting to AI service. Please check your API key.')
    }

    setLoading(false)
  }, [hasPriorVisits, mode, priorVisits, medications, allergies, scoreHistory, patient, noteData])

  const handleEdit = () => {
    setEditingSection('summary')
    setEditedSummary(summary)
  }

  const handleSaveEdit = () => {
    setSummary(editedSummary)
    setEditingSection(null)
  }

  const handleCancelEdit = () => {
    setEditedSummary(summary)
    setEditingSection(null)
  }

  return (
    <div style={{
      background: 'var(--bg-white)',
      borderRadius: '12px',
      marginBottom: '16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 20px',
          cursor: 'pointer',
          background: summary ? 'linear-gradient(135deg, #F0FDFA 0%, #F5F3FF 100%)' : 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
            <path d="M12 8v4l3 3" />
            <circle cx="12" cy="12" r="10" />
          </svg>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Patient History Summary
          </span>
          {summary && (
            <span style={{
              fontSize: '10px',
              padding: '2px 8px',
              borderRadius: '4px',
              background: '#D1FAE5',
              color: '#059669',
              fontWeight: 500,
            }}>
              AI Generated
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!collapsed && hasPriorVisits && (
            <button
              onClick={(e) => { e.stopPropagation(); generateSummary(); }}
              disabled={loading}
              style={{
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: 500,
                color: 'white',
                background: 'var(--primary)',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {loading ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                  </svg>
                  Generating...
                </>
              ) : summary ? 'Refresh' : 'Generate'}
            </button>
          )}
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"
            style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>

      {/* Content */}
      {!collapsed && (
        <div style={{ padding: '0 20px 16px' }}>
          {/* Mode selector */}
          {hasPriorVisits && (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              {(['brief', 'standard', 'detailed'] as SummaryMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    padding: '4px 12px',
                    fontSize: '11px',
                    fontWeight: 500,
                    borderRadius: '6px',
                    border: mode === m ? 'none' : '1px solid var(--border)',
                    background: mode === m ? 'var(--primary)' : 'var(--bg-white)',
                    color: mode === m ? 'white' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!hasPriorVisits && (
            <p style={{
              fontSize: '13px',
              color: 'var(--text-muted)',
              fontStyle: 'italic',
              margin: '8px 0 0',
            }}>
              No prior visits on file. Summary will be available for returning patients.
            </p>
          )}

          {/* Loading state */}
          {loading && (
            <div style={{
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
              <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Analyzing patient history...</span>
            </div>
          )}

          {/* Summary display */}
          {summary && !loading && (
            <div style={{
              background: 'var(--bg-gray)',
              borderLeft: '3px solid var(--primary)',
              borderRadius: '8px',
              padding: '14px',
            }}>
              {editingSection === 'summary' ? (
                <>
                  <textarea
                    value={editedSummary}
                    onChange={(e) => setEditedSummary(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: '120px',
                      padding: '10px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '13px',
                      lineHeight: 1.6,
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      background: 'var(--bg-white)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button
                      onClick={handleSaveEdit}
                      style={{
                        padding: '4px 12px',
                        fontSize: '11px',
                        fontWeight: 500,
                        background: 'var(--primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      style={{
                        padding: '4px 12px',
                        fontSize: '11px',
                        fontWeight: 500,
                        background: 'var(--bg-white)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6,
                  }}>
                    {summary}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button
                      onClick={handleEdit}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                      Edit
                    </button>
                    <button
                      onClick={() => navigator.clipboard.writeText(summary)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                      </svg>
                      Copy
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
