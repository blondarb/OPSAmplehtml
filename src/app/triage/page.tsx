'use client'

import { useState, useRef, useEffect } from 'react'
import { flushSync } from 'react-dom'
import type {
  ClinicalExtraction,
  TriagePageState,
  TriageResult,
} from '@/lib/triage/types'
import {
  postTriage,
  postExtractJSON,
  postExtractFormData,
  TriageStartError,
  isAbortError,
  type LongPacketProgress,
  type PollStartResponse,
  type PollSafetyNotice,
} from '@/lib/triage/pollClient'
import { formatLongPacketProgress } from '@/lib/triage/longPacketProgressView'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { Brain, ClipboardCheck } from 'lucide-react'
import Link from 'next/link'
import TriageInputPanel, {
  type ReferralSubmissionMetadata,
  type TriageInputPanelHandle,
} from '@/components/triage/TriageInputPanel'
import TriageOutputPanel from '@/components/triage/TriageOutputPanel'
import ExtractionReviewPanel from '@/components/triage/ExtractionReviewPanel'
import DisclaimerBanner from '@/components/triage/DisclaimerBanner'
import TriageHelpGuide from '@/components/triage/TriageHelpGuide'
import ExtractionIngressSafetyAlert, {
  mergeExtractionIngressSafetyNotice,
  retainExtractionIngressSafetyNotice,
  type ExtractionIngressSafetyNotice,
} from '@/components/triage/ExtractionIngressSafetyAlert'
import {
  beginReferralAttempt,
  cancelReferralAttempt,
  createReferralCaseNonce,
  invalidateReferralAttempts,
  isCurrentReferralAttempt,
  retryReferralAttempt,
  type ReferralAttemptState,
  type ReferralAttemptToken,
} from '@/lib/triage/referralAttempt'
import { selectSingleReferralFile } from '@/lib/triage/referralFileSelection'
import {
  coordinateCompletedExtraction,
  retainedSafetyHoldFromError,
  triageBoundExtraction,
} from '@/lib/triage/canonicalReferralCoordinator'
import { continueAfterSafetyNoticePaint } from '@/lib/triage/safetyNoticePaintBarrier'
import {
  acceptSafetyHold,
  acceptTrustedRoutineSafetyScreen,
  CANCELED_SAFETY_SCREEN_UNCONFIRMED_REASON,
  initialReferralSafetyNoticeScope,
  preserveSafetyNoticeOnCancel,
  preserveSafetyNoticeOnSourceReplacement,
} from '@/lib/triage/referralSafetyNoticeLifecycle'

export default function TriagePage() {
  const [pageState, setPageState] = useState<TriagePageState>('input')
  const [result, setResult] = useState<TriageResult | null>(null)
  const [extraction, setExtraction] = useState<ClinicalExtraction | null>(null)
  const [coordinatedExtraction, setCoordinatedExtraction] = useState<
    ReturnType<typeof coordinateCompletedExtraction> | null
  >(null)
  const [originalText, setOriginalText] = useState('')
  const [inputMode, setInputMode] = useState<'paste' | 'upload'>('paste')
  const [error, setError] = useState('')
  const [ingressSafetyNotice, setIngressSafetyNotice] =
    useState<ExtractionIngressSafetyNotice | null>(null)
  const ingressSafetyNoticeRef =
    useRef<ExtractionIngressSafetyNotice | null>(null)
  const safetyNoticeScopeRef = useRef(initialReferralSafetyNoticeScope())
  const [longPacketProgress, setLongPacketProgress] =
    useState<LongPacketProgress | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const referralAttemptRef = useRef<ReferralAttemptState>({
    sourceIdentity: null,
    generation: 0,
    caseNonce: createReferralCaseNonce(),
  })
  const fileIdentityRef = useRef({
    ids: new WeakMap<File, string>(),
    nextId: 1,
  })
  const triageInputPanelRef = useRef<TriageInputPanelHandle>(null)

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      referralAttemptRef.current = invalidateReferralAttempts(
        referralAttemptRef.current,
        createReferralCaseNonce(),
      )
    }
  }, [])

  function commitIngressSafetyNotice(
    notice: ExtractionIngressSafetyNotice | null,
  ) {
    ingressSafetyNoticeRef.current = notice
    setIngressSafetyNotice(notice)
  }

  function activateReferralIdentity(sourceIdentity: string) {
    const attempt = beginReferralAttempt(
      referralAttemptRef.current,
      sourceIdentity,
    )
    referralAttemptRef.current = attempt.state
    return attempt.token
  }

  function startReferralRequest(sourceIdentity: string) {
    abortControllerRef.current?.abort()
    const token = activateReferralIdentity(sourceIdentity)
    const controller = new AbortController()
    abortControllerRef.current = controller
    return { token, controller }
  }

  function continueReferralRequest() {
    abortControllerRef.current?.abort()
    const attempt = retryReferralAttempt(referralAttemptRef.current)
    referralAttemptRef.current = attempt.state
    const controller = new AbortController()
    abortControllerRef.current = controller
    return { token: attempt.token, controller }
  }

  function isCurrentAttempt(token: ReferralAttemptToken) {
    return isCurrentReferralAttempt(referralAttemptRef.current, token)
  }

  function mergeScopedSafetyNotice(
    token: ReferralAttemptToken,
    incoming: ExtractionIngressSafetyNotice,
  ) {
    if (!isCurrentAttempt(token)) return
    const accepted = acceptSafetyHold(
      safetyNoticeScopeRef.current,
      token.sourceIdentity,
    )
    safetyNoticeScopeRef.current = accepted.scope
    commitIngressSafetyNotice(
      mergeExtractionIngressSafetyNotice(
        accepted.replaceExisting ? null : ingressSafetyNoticeRef.current,
        incoming,
      ),
    )
  }

  function acceptTrustedRoutineScreen(token: ReferralAttemptToken) {
    if (!isCurrentAttempt(token)) return
    const accepted = acceptTrustedRoutineSafetyScreen(
      safetyNoticeScopeRef.current,
      token.sourceIdentity,
    )
    safetyNoticeScopeRef.current = accepted.scope
    if (accepted.clearExisting) commitIngressSafetyNotice(null)
  }

  function pasteSourceIdentity(
    text: string,
    metadata: ReferralSubmissionMetadata,
  ) {
    return `paste:${text.length}:${metadata.patient_age ?? ''}:${metadata.patient_sex ?? ''}:${text}`
  }

  function fileSourceIdentity(file: File) {
    const existing = fileIdentityRef.current.ids.get(file)
    if (existing) return existing
    const identity = `file-object:${fileIdentityRef.current.nextId++}:${file.name}:${file.size}:${file.lastModified}`
    fileIdentityRef.current.ids.set(file, identity)
    return identity
  }

  function surfaceExtractionIngressSafety(
    start: Readonly<PollStartResponse>,
    token: ReferralAttemptToken,
    sourceLabel?: string,
  ) {
    if (!isCurrentAttempt(token)) return
    const safetyPathway =
      start.safety_pathway === 'emergency_now' ||
      start.safety_pathway === 'same_day_clinician_review'
        ? start.safety_pathway
        : undefined
    if (start.immediate_review_required !== true && !safetyPathway) {
      acceptTrustedRoutineScreen(token)
      return
    }
    mergeScopedSafetyNotice(
      token,
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: start.safety_triage_session_id ?? null,
        ...(sourceLabel ? { sourceLabel } : {}),
        ...(safetyPathway ? { safetyPathway } : {}),
        outpatientScoringBlocked: false,
        humanReviewRequired: true,
        schedulingLocked: true,
      },
    )
  }

  function surfacePolledSafety(
    safety: Readonly<PollSafetyNotice>,
    token: ReferralAttemptToken,
    sourceLabel?: string,
  ) {
    mergeScopedSafetyNotice(
      token,
      {
        immediateReviewRequired: safety.immediateActionRequired,
        safetyTriageSessionId: safety.safetyWorkflowId ?? null,
        ...(sourceLabel ? { sourceLabel } : {}),
        ...(safety.safetyPathway
          ? { safetyPathway: safety.safetyPathway }
          : {}),
        outpatientScoringBlocked: safety.outpatientScoringBlocked,
        humanReviewRequired: safety.humanReviewRequired,
        schedulingLocked: safety.schedulingLocked,
        ...(safety.safetyWorkflowIdentityConflict
          ? { safetyWorkflowIdentityConflict: true }
          : {}),
        ...(safety.holdReason ? { holdReason: safety.holdReason } : {}),
      },
    )
  }

  function retainStructuredStartSafety(
    error: unknown,
    token: ReferralAttemptToken,
  ) {
    if (!isCurrentAttempt(token)) return
    if (!(error instanceof TriageStartError)) return
    const governedHold = retainedSafetyHoldFromError(error)
    const priorScope = safetyNoticeScopeRef.current
    const replacementSource = Boolean(
      priorScope.kind !== 'none' &&
        priorScope.sourceIdentity !== token.sourceIdentity,
    )
    let retained = retainExtractionIngressSafetyNotice(
      replacementSource ? null : ingressSafetyNoticeRef.current,
      error,
    )
    if (!retained) return
    if (governedHold) {
      retained = mergeExtractionIngressSafetyNotice(retained, {
        immediateReviewRequired: true,
        safetyTriageSessionId: retained.safetyTriageSessionId,
        ...(retained.sourceLabel ? { sourceLabel: retained.sourceLabel } : {}),
        safetyPathway: governedHold.carePathway,
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
        ...(error.reason ? { holdReason: error.reason } : {}),
      })
    }
    const accepted = acceptSafetyHold(priorScope, token.sourceIdentity)
    safetyNoticeScopeRef.current = accepted.scope
    commitIngressSafetyNotice(retained)
  }

  function handleReferralLifecycle(
    event: 'clear' | 'source_replacement',
  ) {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    referralAttemptRef.current = invalidateReferralAttempts(
      referralAttemptRef.current,
      createReferralCaseNonce(),
    )
    setResult(null)
    setExtraction(null)
    setCoordinatedExtraction(null)
    setOriginalText('')
    setError('')
    if (event === 'clear') {
      safetyNoticeScopeRef.current = initialReferralSafetyNoticeScope()
      commitIngressSafetyNotice(null)
    } else {
      safetyNoticeScopeRef.current = preserveSafetyNoticeOnSourceReplacement(
        safetyNoticeScopeRef.current,
      )
    }
    setLongPacketProgress(null)
    setPageState('input')
  }

  function handleStartNewReferral() {
    handleReferralLifecycle('clear')
    triageInputPanelRef.current?.clearVisibleReferralInput()
  }

  // Cancel in-flight AI requests
  function handleCancel() {
    const activeSourceIdentity = referralAttemptRef.current.sourceIdentity
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    referralAttemptRef.current = cancelReferralAttempt(
      referralAttemptRef.current,
    )
    const cancellation = preserveSafetyNoticeOnCancel(
      safetyNoticeScopeRef.current,
      activeSourceIdentity,
    )
    safetyNoticeScopeRef.current = cancellation.scope
    if (
      cancellation.createManualFallback &&
      !ingressSafetyNoticeRef.current
    ) {
      commitIngressSafetyNotice({
        immediateReviewRequired: false,
        safetyTriageSessionId: null,
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
        holdReason: CANCELED_SAFETY_SCREEN_UNCONFIRMED_REASON,
      })
    }
    setLongPacketProgress(null)
    setPageState('input')
    setError('')
  }

  function surfaceCoordinatedSafetyHold(
    decision: ReturnType<typeof coordinateCompletedExtraction>['decision'],
    token: ReferralAttemptToken,
    sourceLabel: string,
  ) {
    if (!decision.humanReviewHold || !isCurrentAttempt(token)) return
    const current = ingressSafetyNoticeRef.current
    mergeScopedSafetyNotice(token, {
      immediateReviewRequired: decision.immediateCarePathway !== null,
      safetyTriageSessionId: current?.safetyTriageSessionId ?? null,
      sourceLabel: current?.sourceLabel ?? sourceLabel,
      ...(decision.immediateCarePathway
        ? { safetyPathway: decision.immediateCarePathway }
        : {}),
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
      ...(decision.approvalBlockedReason
        ? { holdReason: decision.approvalBlockedReason }
        : {}),
    })
  }

  async function runBoundTriage(
    extractionResult: ClinicalExtraction,
    token: ReferralAttemptToken,
    controller: AbortController,
    sourceLabel: string,
  ) {
    setPageState('triaging')
    setError('')
    try {
      const data = await triageBoundExtraction(
        extractionResult,
        (request) =>
          postTriage<TriageResult>(request, controller.signal, {
            onSafety: (safety) =>
              surfacePolledSafety(safety, token, sourceLabel),
          }),
      )
      if (!isCurrentAttempt(token)) return
      setResult(data)
      setPageState('result')
    } catch (error: unknown) {
      if (isAbortError(error) || !isCurrentAttempt(token)) return
      retainStructuredStartSafety(error, token)
      setError(
        error instanceof Error
          ? error.message
          : 'The source-bound triage workflow could not be started.',
      )
      setPageState('review')
    }
  }

  async function handleCompletedExtraction(
    extractionResult: ClinicalExtraction,
    token: ReferralAttemptToken,
    controller: AbortController,
    sourceLabel: string,
  ) {
    if (!isCurrentAttempt(token)) return
    const authoritativeOriginalText =
      typeof extractionResult.original_text === 'string'
        ? extractionResult.original_text
        : ''
    const coordinated = coordinateCompletedExtraction(extractionResult)
    setLongPacketProgress(null)
    setOriginalText(authoritativeOriginalText)
    setExtraction(extractionResult)
    setCoordinatedExtraction(coordinated)

    if (coordinated.decision.nextStep === 'triage') {
      try {
        await continueAfterSafetyNoticePaint({
          signal: controller.signal,
          isCurrentAttempt: () => isCurrentAttempt(token),
          commitNotice: () => {
            flushSync(() => {
              surfaceCoordinatedSafetyHold(
                coordinated.decision,
                token,
                sourceLabel,
              )
            })
          },
          startScoring: () =>
            runBoundTriage(
              extractionResult,
              token,
              controller,
              sourceLabel,
            ),
        })
      } catch (paintError: unknown) {
        if (isAbortError(paintError) || !isCurrentAttempt(token)) return
        setError(
          paintError instanceof Error
            ? paintError.message
            : 'The safety notice could not be displayed. Scoring remains blocked.',
        )
        setPageState('review')
      }
      return
    }
    if (coordinated.decision.humanReviewHold) {
      surfaceCoordinatedSafetyHold(
        coordinated.decision,
        token,
        sourceLabel,
      )
    } else {
      acceptTrustedRoutineScreen(token)
    }
    setPageState('review')
  }

  async function handleSubmit(
    referralText: string,
    metadata: ReferralSubmissionMetadata,
  ) {
    const { token, controller } = startReferralRequest(
      pasteSourceIdentity(referralText, metadata),
    )
    setOriginalText('')
    await extractPastedReferral(referralText, metadata, token, controller)
  }

  async function extractPastedReferral(
    text: string,
    metadata: ReferralSubmissionMetadata,
    token: ReferralAttemptToken,
    controller: AbortController,
  ) {
    setPageState('extracting')
    setError('')
    setResult(null)
    setLongPacketProgress(null)
    try {
      const extractionResult = await postExtractJSON<ClinicalExtraction>(
        {
          text,
          ...metadata,
        },
        controller.signal,
        {
          onStart: (start) =>
            surfaceExtractionIngressSafety(start, token, 'Pasted referral'),
          onProgress: (progress) => {
            if (isCurrentAttempt(token)) setLongPacketProgress(progress)
          },
          onSafety: (safety) =>
            surfacePolledSafety(safety, token, 'Pasted referral'),
        },
      )
      await handleCompletedExtraction(
        extractionResult,
        token,
        controller,
        'Pasted referral',
      )
    } catch (error: unknown) {
      if (isAbortError(error) || !isCurrentAttempt(token)) return
      retainStructuredStartSafety(error, token)
      setLongPacketProgress(null)
      setError(
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred during extraction.',
      )
      setPageState('input')
    }
  }

  async function handleSubmitFiles(
    files: File[],
    metadata: ReferralSubmissionMetadata,
  ) {
    const selection = selectSingleReferralFile(files)
    if (!selection.ok) {
      setError(selection.message)
      return
    }
    const { token, controller } = startReferralRequest(
      fileSourceIdentity(selection.file),
    )
    setOriginalText('')
    setPageState('extracting')
    setError('')
    setResult(null)
    setLongPacketProgress(null)

    try {
      const formData = new FormData()
      formData.append('file', selection.file)
      if (metadata.patient_age !== undefined) {
        formData.append('patient_age', String(metadata.patient_age))
      }
      if (metadata.patient_sex !== undefined) {
        formData.append('patient_sex', metadata.patient_sex)
      }
      const extractionResult = await postExtractFormData<ClinicalExtraction>(
        formData,
        controller.signal,
        {
          onStart: (start) =>
            surfaceExtractionIngressSafety(
              start,
              token,
              selection.file.name,
            ),
          onProgress: (progress) => {
            if (isCurrentAttempt(token)) setLongPacketProgress(progress)
          },
          onSafety: (safety) =>
            surfacePolledSafety(safety, token, selection.file.name),
        },
      )
      await handleCompletedExtraction(
        extractionResult,
        token,
        controller,
        selection.file.name,
      )
    } catch (error: unknown) {
      if (isAbortError(error) || !isCurrentAttempt(token)) return
      retainStructuredStartSafety(error, token)
      setLongPacketProgress(null)
      setError(
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred during extraction.',
      )
      setPageState('input')
    }
  }

  async function handleApproveExtraction() {
    if (
      !extraction ||
      coordinatedExtraction?.decision.approvalBlockedReason
    ) {
      return
    }
    const { token, controller } = continueReferralRequest()
    await runBoundTriage(
      extraction,
      token,
      controller,
      extraction.source_filename ?? 'Pasted referral',
    )
  }

  // Reset everything
  function handleTryAnother() {
    handleReferralLifecycle('clear')
  }

  // Go back from review to input
  function handleBackFromReview() {
    setExtraction(null)
    setCoordinatedExtraction(null)
    setLongPacketProgress(null)
    setPageState('input')
  }

  // Determine loading state for input panel
  const isInputLoading = pageState === 'extracting' || pageState === 'triaging'
  const loadingMessage = pageState === 'extracting'
    ? longPacketProgress
      ? formatLongPacketProgress(longPacketProgress)
      : 'Extracting clinical information...'
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
            Paste a referral note or upload one referral packet. The AI analyzes clinical features, scores five dimensions,
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

        {ingressSafetyNotice && (
          <ExtractionIngressSafetyAlert
            immediateReviewRequired={
              ingressSafetyNotice.immediateReviewRequired
            }
            safetyTriageSessionId={
              ingressSafetyNotice.safetyTriageSessionId
            }
            sourceLabel={ingressSafetyNotice.sourceLabel}
            safetyPathway={ingressSafetyNotice.safetyPathway}
            outpatientScoringBlocked={
              ingressSafetyNotice.outpatientScoringBlocked
            }
            humanReviewRequired={ingressSafetyNotice.humanReviewRequired}
            schedulingLocked={ingressSafetyNotice.schedulingLocked}
            holdReason={ingressSafetyNotice.holdReason}
            onStartNewReferral={handleStartNewReferral}
          />
        )}

        {/* Keep intake mounted through triage and extraction review so Back preserves the exact source and metadata. */}
        {(pageState === 'input' || pageState === 'extracting' || pageState === 'triaging' || pageState === 'review') && (
          <div style={{ display: pageState === 'triaging' || pageState === 'review' ? 'none' : undefined }}>
            <TriageInputPanel
              ref={triageInputPanelRef}
              onSubmit={handleSubmit}
              loading={isInputLoading}
              onSubmitFiles={handleSubmitFiles}
              inputMode={inputMode}
              onInputModeChange={setInputMode}
              loadingMessage={loadingMessage}
              onCancel={isInputLoading ? handleCancel : undefined}
              onReferralLifecycle={handleReferralLifecycle}
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
              approvalBlockedReason={coordinatedExtraction?.decision.approvalBlockedReason ?? undefined}
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
    <TriageHelpGuide />
    </PlatformShell>
  )
}
