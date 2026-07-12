'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import SampleNoteLoader from './SampleNoteLoader'
import DemoScenarioLoader, {
  type DemoScenarioLoaderHandle,
} from './DemoScenarioLoader'
import FileUploadZone from './FileUploadZone'
import { FILE_CONSTRAINTS } from '@/lib/triage/types'
import {
  assessReferralTextInput,
  MIN_REFERRAL_TEXT_LENGTH,
} from '@/lib/triage/triageInputPolicy'
import {
  commitReferralIdentityChange,
  sameReferralFileSelection,
  shouldRotateReferralInputMode,
} from '@/lib/triage/referralFileSelection'

export interface ReferralSubmissionMetadata {
  patient_age?: number | string
  patient_sex?: string
}

export interface TriageInputPanelHandle {
  clearVisibleReferralInput: () => void
}

type ReferralMetadataValidation =
  | { ok: true; metadata: ReferralSubmissionMetadata }
  | {
      ok: false
      reason: 'invalid_patient_age' | 'invalid_patient_sex'
      message: string
      metadata: ReferralSubmissionMetadata
    }

const PATIENT_SEX_VALUES = new Set(['Male', 'Female', 'Other'])

export function validatedReferralMetadata(
  age: string,
  sex: string,
): ReferralMetadataValidation {
  const normalizedAge = age.trim()
  const rawMetadata: ReferralSubmissionMetadata = {
    ...(normalizedAge ? { patient_age: normalizedAge } : {}),
    ...(sex ? { patient_sex: sex } : {}),
  }
  if (normalizedAge && !/^[0-9]+$/.test(normalizedAge)) {
    return {
      ok: false,
      reason: 'invalid_patient_age',
      message: 'Age must be a whole number from 0 through 130.',
      metadata: rawMetadata,
    }
  }
  const patientAge = normalizedAge ? Number(normalizedAge) : undefined
  if (
    patientAge !== undefined &&
    (!Number.isSafeInteger(patientAge) || patientAge < 0 || patientAge > 130)
  ) {
    return {
      ok: false,
      reason: 'invalid_patient_age',
      message: 'Age must be a whole number from 0 through 130.',
      metadata: rawMetadata,
    }
  }
  if (sex && !PATIENT_SEX_VALUES.has(sex)) {
    return {
      ok: false,
      reason: 'invalid_patient_sex',
      message: 'Sex must be Male, Female, or Other.',
      metadata: {
        ...(patientAge !== undefined ? { patient_age: patientAge } : {}),
        patient_sex: sex,
      },
    }
  }
  return {
    ok: true,
    metadata: {
      ...(patientAge !== undefined ? { patient_age: patientAge } : {}),
      ...(sex
        ? { patient_sex: sex }
        : {}),
    },
  }
}

interface Props {
  onSubmit: (
    referralText: string,
    metadata: ReferralSubmissionMetadata,
  ) => void
  loading: boolean
  // Phase 2 additions
  onSubmitFiles?: (
    files: File[],
    metadata: ReferralSubmissionMetadata,
  ) => void
  inputMode?: 'paste' | 'upload'
  onInputModeChange?: (mode: 'paste' | 'upload') => void
  loadingMessage?: string
  onCancel?: () => void
  onReferralLifecycle: (event: 'clear' | 'source_replacement') => void
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

const TriageInputPanel = forwardRef<TriageInputPanelHandle, Props>(
  function TriageInputPanel(
    {
      onSubmit,
      loading,
      onSubmitFiles,
      inputMode: controlledInputMode,
      onInputModeChange,
      loadingMessage,
      onCancel,
      onReferralLifecycle,
    },
    ref,
  ) {
  const [text, setText] = useState('')
  const [showMetadata, setShowMetadata] = useState(false)
  const [age, setAge] = useState('')
  const [sex, setSex] = useState('')
  const [metadataError, setMetadataError] = useState('')
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0)
  const [internalMode, setInternalMode] = useState<'paste' | 'upload'>('paste')
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [demoFiles, setDemoFiles] = useState<File[] | undefined>(undefined)
  const demoLoaderRef = useRef<DemoScenarioLoaderHandle>(null)

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

  // Preserve the complete paste. The server chooses single-pass versus durable
  // long-packet processing; the client must never drop a potentially critical
  // tail at that boundary.
  const textInput = assessReferralTextInput(text)
  const isLongNote = textInput.requiresExtraction
  const hasFiles = uploadedFiles.length === 1
  const needsExtraction =
    (activeMode === 'paste' && textInput.canSubmit) ||
    (activeMode === 'upload' && hasFiles)

  function beginReferralLifecycle(
    event: 'clear' | 'source_replacement',
  ) {
    demoLoaderRef.current?.invalidatePendingLoad()
    onReferralLifecycle(event)
  }

  function commitVisibleIdentityChange<T>(
    current: T,
    next: T,
    commit: (value: T) => void,
    equals?: (current: T, next: T) => boolean,
  ) {
    return commitReferralIdentityChange(
      current,
      next,
      {
        beginReplacement: () =>
          beginReferralLifecycle('source_replacement'),
        commit,
      },
      equals,
    )
  }

  function handleInputModeChange(mode: 'paste' | 'upload') {
    if (activeMode === mode) return
    if (
      shouldRotateReferralInputMode({
        currentMode: activeMode,
        nextMode: mode,
        pastePopulated: text.length > 0,
        uploadPopulated: uploadedFiles.length > 0,
      })
    ) {
      beginReferralLifecycle('source_replacement')
    } else {
      demoLoaderRef.current?.invalidatePendingLoad()
    }
    setActiveMode(mode)
  }

  function handleSubmit() {
    if (loading) return
    const validation = validatedReferralMetadata(age, sex)
    if (!validation.ok) {
      setMetadataError(validation.message)
    } else {
      setMetadataError('')
    }
    if (activeMode === 'upload' && hasFiles && onSubmitFiles) {
      onSubmitFiles(uploadedFiles, validation.metadata)
      return
    }
    if (!(textInput.canSubmit || textInput.canRunSafetyScreen)) return
    onSubmit(textInput.submissionText, validation.metadata)
  }

  function handleBeginDemoLoad() {
    // The loader has already claimed and invalidated its own generation. Calling
    // beginReferralLifecycle here would abort that new load through the ref.
    onReferralLifecycle('source_replacement')
  }

  function handleLoadDemoFiles(files: File[]) {
    setDemoFiles([...files])
    setActiveMode('upload')
  }

  function handleTextChange(nextText: string) {
    commitVisibleIdentityChange(text, nextText, setText)
  }

  function handleFilesChange(files: File[]) {
    commitVisibleIdentityChange(
      uploadedFiles,
      files,
      setUploadedFiles,
      sameReferralFileSelection,
    )
  }

  function handleDemoFilesChange(files: File[]) {
    // The demo click already opened the new-referral boundary synchronously.
    setUploadedFiles(files)
  }

  function handleSampleNoteSelection(noteText: string) {
    commitVisibleIdentityChange(text, noteText, setText)
  }

  function handleAgeChange(nextAge: string) {
    setMetadataError('')
    commitVisibleIdentityChange(age, nextAge, setAge)
  }

  function handleSexChange(nextSex: string) {
    setMetadataError('')
    commitVisibleIdentityChange(sex, nextSex, setSex)
  }

  const handleExternalFilesConsumed = useCallback(() => {
    setDemoFiles(undefined)
  }, [])

  const clearVisibleReferralInput = useCallback(() => {
    demoLoaderRef.current?.invalidatePendingLoad()
    setText('')
    setAge('')
    setSex('')
    setMetadataError('')
    setUploadedFiles([])
    setDemoFiles(undefined)
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      clearVisibleReferralInput,
    }),
    [clearVisibleReferralInput],
  )

  function handleReset() {
    beginReferralLifecycle('clear')
    clearVisibleReferralInput()
  }

  const charCount = textInput.characterCount
  const canSubmitPaste =
    (textInput.canSubmit || textInput.canRunSafetyScreen) && !loading
  const canSubmitUpload = hasFiles && !loading
  const canSubmit = activeMode === 'paste' ? canSubmitPaste : canSubmitUpload

  // Button label
  let buttonLabel = 'Extract & Triage'
  if (
    activeMode === 'paste' &&
    textInput.canRunSafetyScreen
  ) {
    buttonLabel = 'Run Safety Check'
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
            : 'Upload Referral File'}
        </h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {activeMode === 'paste' && (
            <SampleNoteLoader onSelect={handleSampleNoteSelection} />
          )}
          <DemoScenarioLoader
            ref={demoLoaderRef}
            onBeginLoad={handleBeginDemoLoad}
            onLoadFiles={handleLoadDemoFiles}
          />
        </div>
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
          onClick={() => handleInputModeChange('paste')}
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
          onClick={() => handleInputModeChange('upload')}
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
          Upload Referral File
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
            onChange={(e) => handleTextChange(e.target.value)}
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
              color: textInput.exceedsVerifiedPacketLimit
                ? '#F87171'
                : textInput.belowMinimum
                  ? '#94a3b8'
                  : '#16A34A',
              fontSize: '0.75rem',
            }}>
              {charCount.toLocaleString()}/{FILE_CONSTRAINTS.MAX_PACKET_TEXT_LENGTH.toLocaleString()} characters
              {charCount > 0 && textInput.belowMinimum &&
                ` (minimum ${MIN_REFERRAL_TEXT_LENGTH} required)`}
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
          {textInput.canRunSafetyScreen && (
            <div
              role="alert"
              style={{
                marginTop: '8px',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #D97706',
                background: 'rgba(217, 119, 6, 0.12)',
                color: '#FDE68A',
                fontSize: '0.78rem',
                lineHeight: 1.5,
              }}
            >
              This note is too short for outpatient scoring. Run the server
              safety check so explicit emergency or same-day language is not
              missed; a negative check will still require more information.
            </div>
          )}
          {textInput.exceedsVerifiedPacketLimit && (
            <div
              role="alert"
              style={{
                marginTop: '8px',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #DC2626',
                background: 'rgba(220, 38, 38, 0.12)',
                color: '#FECACA',
                fontSize: '0.78rem',
                lineHeight: 1.5,
              }}
            >
              This referral exceeds the verified packet limit. Nothing was
              truncated; keep it on manual review and use the controlled
              large-packet ingestion workflow.
            </div>
          )}
        </>
      )}

      {/* Upload referral file mode */}
      {activeMode === 'upload' && (
        <FileUploadZone
          files={uploadedFiles}
          onFilesChange={handleFilesChange}
          onExternalFilesChange={handleDemoFilesChange}
          onExternalFilesConsumed={handleExternalFilesConsumed}
          disabled={loading}
          externalFiles={demoFiles}
        />
      )}

      {/* Referral file indicator (visible in both modes) */}
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
          Referral file queued in Upload tab
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
              min={0}
              max={130}
              step={1}
              value={age}
              onChange={(e) => handleAgeChange(e.target.value)}
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
              onChange={(e) => handleSexChange(e.target.value)}
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
          <p style={{ flex: '1 1 100%', color: '#94a3b8', fontSize: '0.72rem', margin: 0 }}>
            Referring-provider type is unavailable until a reviewed provenance schema can persist and verify its source.
          </p>
        </div>
      )}

      {metadataError && (
        <div role="alert" style={{ marginTop: '12px', color: '#FCA5A5', fontSize: '0.78rem' }}>
          {metadataError}
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

        {loading && onCancel ? (
          <button
            onClick={onCancel}
            style={{
              padding: '12px 20px',
              borderRadius: '8px',
              background: 'transparent',
              color: '#f87171',
              border: '1px solid #DC2626',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        ) : (
          ((activeMode === 'paste' && text.length > 0) || (activeMode === 'upload' && hasFiles)) && !loading && (
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
          )
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
  },
)

export default TriageInputPanel
