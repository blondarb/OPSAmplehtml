'use client'

import { useState } from 'react'
import SampleNoteLoader from './SampleNoteLoader'

interface Props {
  onSubmit: (referralText: string, metadata: {
    patient_age?: number
    patient_sex?: string
    referring_provider_type?: string
  }) => void
  loading: boolean
}

const LOADING_MESSAGES = [
  'Analyzing clinical presentation...',
  'Evaluating red flags...',
  'Scoring clinical dimensions...',
  'Generating triage recommendation...',
]

export default function TriageInputPanel({ onSubmit, loading }: Props) {
  const [text, setText] = useState('')
  const [showMetadata, setShowMetadata] = useState(false)
  const [age, setAge] = useState('')
  const [sex, setSex] = useState('')
  const [providerType, setProviderType] = useState('')
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0)

  // Rotate loading messages
  useState(() => {
    if (!loading) return
    const interval = setInterval(() => {
      setLoadingMsgIndex(prev => (prev + 1) % LOADING_MESSAGES.length)
    }, 2000)
    return () => clearInterval(interval)
  })

  function handleSubmit() {
    if (text.length < 50 || loading) return
    const metadata: Record<string, string | number> = {}
    if (age) metadata.patient_age = parseInt(age, 10)
    if (sex) metadata.patient_sex = sex
    if (providerType) metadata.referring_provider_type = providerType
    onSubmit(text, metadata)
  }

  function handleReset() {
    setText('')
    setAge('')
    setSex('')
    setProviderType('')
  }

  const charCount = text.length
  const canSubmit = charCount >= 50 && !loading

  return (
    <div style={{
      background: '#0f172a',
      borderRadius: '12px',
      border: '1px solid #334155',
      padding: '24px',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        <h2 style={{ color: '#e2e8f0', fontSize: '1rem', fontWeight: 600, margin: 0 }}>
          Paste Referral Note or Intake Summary
        </h2>
        <SampleNoteLoader onSelect={(noteText) => setText(noteText)} />
      </div>

      {/* Textarea */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 5000))}
        placeholder="Paste referral note, intake summary, or describe the clinical scenario..."
        rows={8}
        disabled={loading}
        style={{
          width: '100%',
          padding: '14px',
          borderRadius: '8px',
          background: '#1e293b',
          color: '#e2e8f0',
          border: '1px solid #475569',
          fontSize: '0.9rem',
          lineHeight: 1.6,
          resize: 'vertical',
          minHeight: '160px',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          boxSizing: 'border-box',
          opacity: loading ? 0.5 : 1,
        }}
      />

      {/* Character count */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '8px',
      }}>
        <span style={{
          color: charCount < 50 ? '#94a3b8' : '#16A34A',
          fontSize: '0.75rem',
        }}>
          {charCount}/5,000 characters
          {charCount > 0 && charCount < 50 && ` (minimum 50 required)`}
        </span>
      </div>

      {/* Metadata toggle */}
      <button
        onClick={() => setShowMetadata(!showMetadata)}
        style={{
          marginTop: '12px',
          background: 'transparent',
          border: 'none',
          color: '#94a3b8',
          fontSize: '0.8rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: 0,
        }}
      >
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform: showMetadata ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        Patient Metadata (Optional)
      </button>

      {/* Metadata fields */}
      {showMetadata && (
        <div style={{
          display: 'flex',
          gap: '12px',
          marginTop: '12px',
          flexWrap: 'wrap',
        }}>
          <div style={{ flex: '1 1 100px' }}>
            <label style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Age</label>
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="e.g., 65"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                background: '#1e293b',
                color: '#e2e8f0',
                border: '1px solid #475569',
                fontSize: '0.85rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Sex</label>
            <select
              value={sex}
              onChange={(e) => setSex(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                background: '#1e293b',
                color: '#e2e8f0',
                border: '1px solid #475569',
                fontSize: '0.85rem',
              }}
            >
              <option value="">Not specified</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Referring Provider</label>
            <select
              value={providerType}
              onChange={(e) => setProviderType(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                background: '#1e293b',
                color: '#e2e8f0',
                border: '1px solid #475569',
                fontSize: '0.85rem',
              }}
            >
              <option value="">Not specified</option>
              <option value="PCP">PCP</option>
              <option value="ED">Emergency Department</option>
              <option value="Specialist">Specialist</option>
              <option value="Hospitalist">Hospitalist</option>
              <option value="Self-referral">Self-referral</option>
            </select>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginTop: '20px',
        alignItems: 'center',
      }}>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            padding: '12px 32px',
            borderRadius: '8px',
            background: canSubmit ? '#EA580C' : '#334155',
            color: '#fff',
            border: 'none',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: loading ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {loading ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              {LOADING_MESSAGES[loadingMsgIndex]}
            </>
          ) : (
            'Triage This Patient'
          )}
        </button>

        {text.length > 0 && !loading && (
          <button
            onClick={handleReset}
            style={{
              padding: '12px 20px',
              borderRadius: '8px',
              background: 'transparent',
              color: '#94a3b8',
              border: '1px solid #475569',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        )}
      </div>

      {loading && (
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      )}
    </div>
  )
}
