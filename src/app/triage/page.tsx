'use client'

import { useState, useRef } from 'react'
import { TriageResult, ClinicalExtraction, TriagePageState, FILE_CONSTRAINTS, BatchItem } from '@/lib/triage/types'
import { streamPostJSON, streamPostFormData } from '@/lib/triage/streamClient'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { Brain, ClipboardCheck } from 'lucide-react'
import Link from 'next/link'
import TriageInputPanel from '@/components/triage/TriageInputPanel'
import TriageOutputPanel from '@/components/triage/TriageOutputPanel'
import ExtractionReviewPanel from '@/components/triage/ExtractionReviewPanel'
import BatchResultsPanel from '@/components/triage/BatchResultsPanel'
import DisclaimerBanner from '@/components/triage/DisclaimerBanner'

export default function TriagePage() {
  const [pageState, setPageState] = useState<TriagePageState>('input')
  const [result, setResult] = useState<TriageResult | null>(null)
  const [extraction, setExtraction] = useState<ClinicalExtraction | null>(null)
  const [originalText, setOriginalText] = useState('')
  const [inputMode, setInputMode] = useState<'paste' | 'upload'>('paste')
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [batchItems, setBatchItems] = useState<BatchItem[]>([])
  const [error, setError] = useState('')
  const abortControllerRef = useRef<AbortController | null>(null)

  // Cancel in-flight AI requests
  function handleCancel() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setBatchItems([])
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
      const data = await streamPostJSON<TriageResult>(
        '/api/triage',
        { referral_text: referralText, ...metadata },
        controller.signal,
      )
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
      const extractionResult = await streamPostJSON<ClinicalExtraction>(
        '/api/triage/extract',
        {
          text,
          patient_age: metadata?.patient_age,
          patient_sex: metadata?.patient_sex,
        },
        controller.signal,
      )
      setExtraction(extractionResult)
      setPageState('review')
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return // User cancelled
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during extraction.')
      setPageState('input')
    }
  }

  // Batch file upload: extract + triage all files end-to-end, no review step
  async function handleSubmitFiles(files: File[]) {
    if (files.length === 0) return

    setUploadedFiles(files)
    setError('')

    // Initialize batch items
    const items: BatchItem[] = files.map((file, i) => ({
      id: `batch-${Date.now()}-${i}`,
      filename: file.name,
      file,
      status: 'pending' as const,
    }))
    setBatchItems(items)
    setPageState('batch')

    const controller = new AbortController()
    abortControllerRef.current = controller

    // Process each file sequentially: extract → triage
    for (let i = 0; i < items.length; i++) {
      if (controller.signal.aborted) return

      const item = items[i]
      const file = files[i]

      // --- Stage 1: Extract ---
      setBatchItems(prev => prev.map(b =>
        b.id === item.id ? { ...b, status: 'extracting' } : b
      ))

      try {
        const formData = new FormData()
        formData.append('file', file)

        const extraction = await streamPostFormData<ClinicalExtraction>(
          '/api/triage/extract',
          formData,
          controller.signal,
        )

        setBatchItems(prev => prev.map(b =>
          b.id === item.id ? { ...b, status: 'triaging', extraction } : b
        ))

        // --- Stage 2: Triage the extracted summary ---
        const triageResult = await streamPostJSON<TriageResult>(
          '/api/triage',
          {
            referral_text: extraction.extracted_summary,
            extracted_summary: extraction.extracted_summary,
            source_type: file.name.toLowerCase().endsWith('.docx') ? 'docx' : file.name.toLowerCase().endsWith('.txt') ? 'txt' : 'pdf',
            source_filename: file.name,
            extraction_confidence: extraction.extraction_confidence,
            note_type_detected: extraction.note_type_detected,
          },
          controller.signal,
        )

        setBatchItems(prev => prev.map(b =>
          b.id === item.id ? { ...b, status: 'completed', triageResult } : b
        ))
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setBatchItems(prev => prev.map(b =>
          b.id === item.id ? { ...b, status: 'error', error: err instanceof Error ? err.message : 'Processing failed' } : b
        ))
      }
    }
  }

  // Phase 2: user approves extraction, proceed to triage
  async function handleApproveExtraction(editedSummary: string) {
    setPageState('triaging')
    setError('')

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const data = await streamPostJSON<TriageResult>(
        '/api/triage',
        {
          referral_text: editedSummary,
          extracted_summary: editedSummary,
          source_type: inputMode === 'upload' ? (extraction?.source_filename?.toLowerCase().endsWith('.docx') ? 'docx' : extraction?.source_filename?.toLowerCase().endsWith('.txt') ? 'txt' : 'pdf') : 'paste',
          source_filename: extraction?.source_filename,
          extraction_confidence: extraction?.extraction_confidence,
          note_type_detected: extraction?.note_type_detected,
        },
        controller.signal,
      )
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
    setBatchItems([])
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
    <PlatformShell>
    <FeatureSubHeader
      title="AI Triage Tool"
      icon={Brain}
      accentColor="#F59E0B"
      nextStep={{ label: 'Physician Workspace', route: '/physician' }}
    />
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    }}>

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
          <Link
            href="/triage/validate"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '12px',
              padding: '6px 14px',
              background: 'rgba(139, 92, 246, 0.1)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              borderRadius: '6px',
              color: '#8B5CF6',
              fontSize: '0.75rem',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            <ClipboardCheck size={13} />
            Independent Reviewers — Click Here for Validation Study
          </Link>
        </div>

        {/* State machine rendering */}

        {/* Input state — keep mounted during triaging to preserve textarea text */}
        {(pageState === 'input' || pageState === 'extracting' || pageState === 'triaging') && (
          <div style={{ display: pageState === 'triaging' ? 'none' : undefined }}>
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
          </div>
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

        {/* Batch state */}
        {pageState === 'batch' && batchItems.length > 0 && (
          <BatchResultsPanel items={batchItems} onTryAnother={handleTryAnother} />
        )}
      </div>
    </div>
    </PlatformShell>
  )
}
