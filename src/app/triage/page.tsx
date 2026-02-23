'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { TriageResult, ClinicalExtraction, TriagePageState, FILE_CONSTRAINTS } from '@/lib/triage/types'
import TriageInputPanel from '@/components/triage/TriageInputPanel'
import TriageOutputPanel from '@/components/triage/TriageOutputPanel'
import ExtractionReviewPanel from '@/components/triage/ExtractionReviewPanel'
import DisclaimerBanner from '@/components/triage/DisclaimerBanner'

export default function TriagePage() {
  const [pageState, setPageState] = useState<TriagePageState>('input')
  const [result, setResult] = useState<TriageResult | null>(null)
  const [extraction, setExtraction] = useState<ClinicalExtraction | null>(null)
  const [originalText, setOriginalText] = useState('')
  const [inputMode, setInputMode] = useState<'paste' | 'upload'>('paste')
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const abortControllerRef = useRef<AbortController | null>(null)

  // Cancel in-flight AI requests
  function handleCancel() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setPageState('input')
    setError('')
  }

  // Phase 1 flow: short paste text — triage directly (no extraction)
  async function handleSubmit(
    referralText: string,
    metadata: { patient_age?: number; patient_sex?: string; referring_provider_type?: string }
  ) {
    const isLongNote = referralText.length >= FILE_CONSTRAINTS.SHORT_NOTE_THRESHOLD

    if (isLongNote) {
      // Long text: run extraction first
      setOriginalText(referralText)
      await runExtraction(referralText, metadata)
      return
    }

    // Short text: triage directly (Phase 1 flow)
    setPageState('triaging')
    setError('')
    setResult(null)

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const res = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referral_text: referralText, ...metadata }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'The triage system is temporarily unavailable. Please triage this patient manually and contact support.')
      }

      const data: TriageResult = await res.json()
      setResult(data)
      setPageState('result')
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return // User cancelled
      setError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.')
      setPageState('input')
    }
  }

  // Phase 2: run extraction on long text
  async function runExtraction(
    text: string,
    metadata?: { patient_age?: number; patient_sex?: string; referring_provider_type?: string }
  ) {
    setPageState('extracting')
    setError('')

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const res = await fetch('/api/triage/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          patient_age: metadata?.patient_age,
          patient_sex: metadata?.patient_sex,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Extraction failed. Please try again.')
      }

      const extractionResult: ClinicalExtraction = await res.json()
      setExtraction(extractionResult)
      setPageState('review')
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return // User cancelled
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during extraction.')
      setPageState('input')
    }
  }

  // Phase 2: handle file upload — send to extract endpoint
  async function handleSubmitFiles(files: File[]) {
    if (files.length === 0) return

    setUploadedFiles(files)
    setPageState('extracting')
    setError('')

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      // Process the first file (single-file flow for now)
      const file = files[0]
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/triage/extract', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'File extraction failed. Please try again.')
      }

      const extractionResult: ClinicalExtraction = await res.json()
      setExtraction(extractionResult)
      // Store original text from extraction for the review panel
      setOriginalText(extractionResult.extracted_summary)
      setPageState('review')
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return // User cancelled
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during file processing.')
      setPageState('input')
    }
  }

  // Phase 2: user approves extraction, proceed to triage
  async function handleApproveExtraction(editedSummary: string) {
    setPageState('triaging')
    setError('')

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const res = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referral_text: editedSummary,
          extracted_summary: editedSummary,
          source_type: inputMode === 'upload' ? (extraction?.source_filename?.toLowerCase().endsWith('.docx') ? 'docx' : extraction?.source_filename?.toLowerCase().endsWith('.txt') ? 'txt' : 'pdf') : 'paste',
          source_filename: extraction?.source_filename,
          extraction_confidence: extraction?.extraction_confidence,
          note_type_detected: extraction?.note_type_detected,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'The triage system is temporarily unavailable. Please triage this patient manually and contact support.')
      }

      const data: TriageResult = await res.json()
      setResult(data)
      setPageState('result')
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return // User cancelled
      setError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.')
      setPageState('review')
    }
  }

  // Reset everything
  function handleTryAnother() {
    setResult(null)
    setExtraction(null)
    setOriginalText('')
    setUploadedFiles([])
    setError('')
    setPageState('input')
  }

  // Go back from review to input
  function handleBackFromReview() {
    setExtraction(null)
    setPageState('input')
  }

  // Determine loading state for input panel
  const isInputLoading = pageState === 'extracting' || pageState === 'triaging'
  const loadingMessage = pageState === 'extracting'
    ? 'Extracting clinical information...'
    : pageState === 'triaging'
      ? undefined
      : undefined

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        background: '#9a3412',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
      }}>
        <Link href="/" style={{
          color: '#fed7aa',
          textDecoration: 'none',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Home
        </Link>
        <div style={{
          width: '1px',
          height: '20px',
          background: 'rgba(255,255,255,0.2)',
        }} />
        <h1 style={{
          color: '#fff',
          fontSize: '1rem',
          fontWeight: 600,
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fdba74" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          AI Triage Tool
        </h1>
        <span style={{
          color: '#fdba74',
          fontSize: '0.7rem',
          fontWeight: 500,
          padding: '2px 8px',
          background: 'rgba(251,146,60,0.2)',
          borderRadius: '4px',
        }}>
          Demo
        </span>
      </div>

      {/* Main content */}
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        padding: '32px 24px',
      }}>
        {/* Intro text */}
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <p style={{
            color: '#94a3b8',
            fontSize: '0.85rem',
            lineHeight: 1.6,
            maxWidth: '600px',
            margin: '0 auto',
          }}>
            Paste a referral note or upload clinical documents. The AI analyzes clinical features, scores five dimensions,
            and the application calculates a triage tier deterministically. All scoring is transparent and auditable.
          </p>
        </div>

        {/* State machine rendering */}

        {/* Input state */}
        {(pageState === 'input' || pageState === 'extracting') && (
          <>
            <TriageInputPanel
              onSubmit={handleSubmit}
              loading={isInputLoading}
              onSubmitFiles={handleSubmitFiles}
              inputMode={inputMode}
              onInputModeChange={setInputMode}
              loadingMessage={loadingMessage}
              onCancel={isInputLoading ? handleCancel : undefined}
            />

            {/* Error message */}
            {error && (
              <div style={{
                marginTop: '16px',
                padding: '14px 16px',
                background: 'rgba(220, 38, 38, 0.1)',
                border: '1px solid #DC2626',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <p style={{ color: '#fca5a5', fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
                  {error}
                </p>
              </div>
            )}

            <DisclaimerBanner />
          </>
        )}

        {/* Review state */}
        {pageState === 'review' && extraction && (
          <>
            <ExtractionReviewPanel
              extraction={extraction}
              originalText={originalText}
              onApprove={handleApproveExtraction}
              onBack={handleBackFromReview}
            />

            {/* Error message */}
            {error && (
              <div style={{
                marginTop: '16px',
                padding: '14px 16px',
                background: 'rgba(220, 38, 38, 0.1)',
                border: '1px solid #DC2626',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <p style={{ color: '#fca5a5', fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
                  {error}
                </p>
              </div>
            )}

            <DisclaimerBanner />
          </>
        )}

        {/* Triaging state (standalone loading) */}
        {pageState === 'triaging' && !result && (
          <div style={{
            background: '#0f172a',
            borderRadius: '12px',
            border: '1px solid #334155',
            padding: '48px 24px',
            textAlign: 'center',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2" style={{ animation: 'spin 1s linear infinite', marginBottom: '16px' }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <p style={{ color: '#e2e8f0', fontSize: '0.95rem', fontWeight: 500, margin: '0 0 4px' }}>
              Scoring triage dimensions...
            </p>
            <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '0 0 16px' }}>
              The AI is analyzing clinical features and generating a recommendation.
            </p>
            <button
              onClick={handleCancel}
              style={{
                padding: '8px 24px',
                borderRadius: '8px',
                background: 'transparent',
                color: '#94a3b8',
                border: '1px solid #475569',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <style>{`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        )}

        {/* Result state */}
        {pageState === 'result' && result && (
          <TriageOutputPanel result={result} onTryAnother={handleTryAnother} />
        )}
      </div>
    </div>
  )
}
