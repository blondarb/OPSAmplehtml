'use client'

import { useState, useEffect } from 'react'
import SampleNoteLoader from './SampleNoteLoader'
import FileUploadZone from './FileUploadZone'
import { FILE_CONSTRAINTS } from '@/lib/triage/types'

interface Props {
  onSubmit: (referralText: string, metadata: {
    patient_age?: number
    patient_sex?: string
    referring_provider_type?: string
  }) => void
  loading: boolean
  // Phase 2 additions
  onSubmitFiles?: (files: File[]) => void
  inputMode?: 'paste' | 'upload'
  onInputModeChange?: (mode: 'paste' | 'upload') => void
  loadingMessage?: string
}

const LOADING_MESSAGES = [
  'Analyzing clinical presentation...',
  'Evaluating red flags...',
  'Scoring clinical dimensions...',
  'Generating triage recommendation...',
]

const EXTRACTING_MESSAGES = [
  'Extracting clinical information...',
  'Identifying key findings...',
  'Detecting note type...',
  'Building clinical summary...',
]

export default function TriageInputPanel({
  onSubmit,
  loading,
  onSubmitFiles,
  inputMode: controlledInputMode,
  onInputModeChange,
  loadingMessage,
}: Props) {
  const [text, setText] = useState('')
  const [showMetadata, setShowMetadata] = useState(false)
  const [age, setAge] = useState('')
  const [sex, setSex] = useState('')
  const [providerType, setProviderType] = useState('')
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0)
  const [internalMode, setInternalMode] = useState<'paste' | 'upload'>('paste')
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])

  // Use controlled mode if provided, otherwise internal state
  const activeMode = controlledInputMode ?? internalMode
  const setActiveMode = (mode: 'paste' | 'upload') => {
    if (onInputModeChange) {
      onInputModeChange(mode)
    } else {
      setInternalMode(mode)
    }
  }

  // Determine which loading messages to show
  const isExtracting = loadingMessage?.toLowerCase().includes('extract')
  const messages = isExtracting ? EXTRACTING_MESSAGES : LOADING_MESSAGES

  // Rotate loading messages
  useEffect(() => {
    if (!loading) {
      setLoadingMsgIndex(0)
      return
    }
    const interval = setInterval(() => {
      setLoadingMsgIndex(prev => (prev + 1) % messages.length)
    }, 2000)
    return () => clearInterval(interval)
  }, [loading, messages.length])

  // Determine if this is a long note or file upload for button text
  const isLongNote = text.length >= FILE_CONSTRAINTS.SHORT_NOTE_THRESHOLD
  const hasFiles = uploadedFiles.length > 0
  const needsExtraction = isLongNote || hasFiles

  function handleSubmit() {
    if (activeMode === 'upload' && hasFiles && onSubmitFiles) {
      onSubmitFiles(uploadedFiles)
      return
    }
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
    setUploadedFiles([])
  }

  const charCount = text.length
  const canSubmitPaste = charCount >= 50 && !loading
  const canSubmitUpload = hasFiles && !loading
  const canSubmit = activeMode === 'paste' ? canSubmitPaste : canSubmitUpload

  // Button label
  let buttonLabel = 'Triage This Patient'
  if (activeMode === 'upload' && hasFiles) {
    buttonLabel = 'Extract & Triage'
  } else if (activeMode === 'paste' && isLongNote) {
    buttonLabel = 'Extract & Triage'
  }

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
          {activeMode === 'paste'
            ? 'Paste Referral Note or Intake Summary'
            : 'Upload Clinical Documents'}
        </h2>
        {activeMode === 'paste' && (
          <SampleNoteLoader onSelect={(noteText) => setText(noteText)} />
        )}
      </div>

      {/* Tab switcher */}
      <div style={{
        display: 'flex',
        gap: '4px',
        marginBottom: '16px',
        background: '#1e293b',
        borderRadius: '8px',
        padding: '4px',
        width: 'fit-content',
      }}>
        <button
          onClick={() => setActiveMode('paste')}
          disabled={loading}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: 'none',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            background: activeMode === 'paste' ? '#334155' : 'transparent',
            color: activeMode === 'paste' ? '#e2e8f0' : '#94a3b8',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          </svg>
          Paste Text
        </button>
        <button
          onClick={() => setActiveMode('upload')}
          disabled={loading}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: 'none',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            background: activeMode === 'upload' ? '#334155' : 'transparent',
            color: activeMode === 'upload' ? '#e2e8f0' : '#94a3b8',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload File(s)
          {hasFiles && activeMode !== 'upload' && (
            <span style={{
              backgroundColor: '#EA580C',
              color: '#fff',
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: '10px',
              minWidth: '18px',
              textAlign: 'center',
            }}>
              {uploadedFiles.length}
            </span>
          )}
        </button>
      </div>

      {/* Paste Text mode */}
      {activeMode === 'paste' && (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, FILE_CONSTRAINTS.MAX_TEXT_LENGTH))}
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
              {charCount.toLocaleString()}/{FILE_CONSTRAINTS.MAX_TEXT_LENGTH.toLocaleString()} characters
              {charCount > 0 && charCount < 50 && ` (minimum 50 required)`}
            </span>
            {isLongNote && (
              <span style={{
                color: '#0D9488',
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                Long note — extraction will run first
              </span>
            )}
          </div>
        </>
      )}

      {/* Upload File(s) mode */}
      {activeMode === 'upload' && (
        <FileUploadZone
          onFilesChange={setUploadedFiles}
          disabled={loading}
        />
      )}

      {/* Files selected indicator (visible in both modes) */}
      {hasFiles && activeMode === 'paste' && (
        <div style={{
          marginTop: '8px',
          padding: '6px 10px',
          borderRadius: '6px',
          background: 'rgba(234, 88, 12, 0.1)',
          border: '1px solid rgba(234, 88, 12, 0.3)',
          fontSize: '0.8rem',
          color: '#fdba74',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''} also queued in Upload tab
        </div>
      )}

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
            background: canSubmit
              ? (needsExtraction ? '#0D9488' : '#EA580C')
              : '#334155',
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
              {loadingMessage || messages[loadingMsgIndex]}
            </>
          ) : (
            buttonLabel
          )}
        </button>

        {((activeMode === 'paste' && text.length > 0) || (activeMode === 'upload' && hasFiles)) && !loading && (
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
