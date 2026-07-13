import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(
  resolve(process.cwd(), 'src/app/triage/page.tsx'),
  'utf8',
)
const inputSource = readFileSync(
  resolve(process.cwd(), 'src/components/triage/TriageInputPanel.tsx'),
  'utf8',
)
const typesSource = readFileSync(
  resolve(process.cwd(), 'src/lib/triage/types.ts'),
  'utf8',
)
const outputSource = readFileSync(
  resolve(process.cwd(), 'src/components/triage/TriageOutputPanel.tsx'),
  'utf8',
)

function scope(start: string, end: string): string {
  const startIndex = pageSource.indexOf(start)
  const endIndex = pageSource.indexOf(end, startIndex + start.length)
  expect(startIndex).toBeGreaterThan(-1)
  expect(endIndex).toBeGreaterThan(startIndex)
  return pageSource.slice(startIndex, endIndex)
}

describe('triage page single-referral contract', () => {
  it('does not route uploaded referrals into a reduced batch result', () => {
    expect(pageSource).not.toContain("setPageState('batch')")
    expect(pageSource).not.toContain('<BatchResultsPanel')
    expect(pageSource).not.toContain('BatchItem')
    expect(pageSource).not.toContain('batchItems')
    expect(typesSource).not.toMatch(/\|\s*'batch'\s*\/\/ Batch mode/)
  })

  it('does not expose an unverified post-triage patient binding control', () => {
    expect(outputSource).not.toContain("import PatientSelector from './PatientSelector'")
    expect(outputSource).not.toContain('<PatientSelector')
  })

  it('does not let short pasted referrals bypass source-bound extraction', () => {
    const submitScope = scope(
      'async function handleSubmit(',
      'async function extractPastedReferral(',
    )

    expect(submitScope).toContain('extractPastedReferral(')
    expect(submitScope).not.toContain('postTriage')
    expect(submitScope).not.toContain('SHORT_NOTE_THRESHOLD')
    expect(pageSource).toContain('postExtractJSON')
    expect(pageSource).not.toContain(
      'Phase 1 flow: short paste text — triage directly',
    )
  })

  it('converges paste and file extraction through one coordinated transition', () => {
    const transitionScope = scope(
      'async function handleCompletedExtraction(',
      'async function extractPastedReferral(',
    )

    expect(pageSource.match(/coordinateCompletedExtraction\(/g)).toHaveLength(1)
    expect(transitionScope).toContain('coordinateCompletedExtraction(')
    expect(transitionScope).toContain('setCoordinatedExtraction(')
    expect(transitionScope).toContain('surfaceCoordinatedSafetyHold(')
    expect(transitionScope).toContain('runBoundTriage(')
    expect(transitionScope.indexOf('surfaceCoordinatedSafetyHold(')).toBeLessThan(
      transitionScope.indexOf('runBoundTriage('),
    )
    expect(pageSource.match(/handleCompletedExtraction\(/g)).toHaveLength(3)
  })

  it('uses only the completed server-bound original text for extraction review', () => {
    const transitionScope = scope(
      'async function handleCompletedExtraction(',
      'async function handleSubmit(',
    )
    const pasteSubmitScope = scope(
      'async function handleSubmit(',
      'async function extractPastedReferral(',
    )
    const uploadScope = scope(
      'async function handleSubmitFiles(',
      'async function handleApproveExtraction(',
    )

    expect(typesSource).toContain('original_text?: string')
    expect(transitionScope).toContain(
      "typeof extractionResult.original_text === 'string'",
    )
    expect(transitionScope).toContain(
      'setOriginalText(authoritativeOriginalText)',
    )
    expect(pasteSubmitScope).not.toContain('setOriginalText(referralText)')
    expect(uploadScope).not.toContain('selection.file.text(')
    expect(uploadScope).not.toContain('parseUploadedFile(')
  })

  it('uses a synchronous commit and an abort-aware paint barrier before immediate scoring', () => {
    const transitionScope = scope(
      'async function handleCompletedExtraction(',
      'async function handleSubmit(',
    )

    expect(pageSource).toContain("from 'react-dom'")
    expect(transitionScope).toContain('continueAfterSafetyNoticePaint({')
    expect(transitionScope).toContain('flushSync(() =>')
    expect(transitionScope).toContain(
      'isCurrentAttempt: () => isCurrentAttempt(token)',
    )
    expect(transitionScope).toContain('startScoring: () =>')
  })

  it('preserves safety on ordinary replacement and creates a cancel fallback', () => {
    const lifecycleScope = scope(
      'function handleReferralLifecycle(',
      '// Cancel in-flight AI requests',
    )
    const cancelScope = scope(
      'function handleCancel()',
      'function surfaceCoordinatedSafetyHold(',
    )

    expect(lifecycleScope).toContain("if (event === 'clear')")
    expect(lifecycleScope).toContain(
      'preserveSafetyNoticeOnSourceReplacement(',
    )
    expect(cancelScope).toContain('preserveSafetyNoticeOnCancel(')
    expect(cancelScope).toContain('createManualFallback')
    expect(pageSource).toContain('acceptTrustedRoutineSafetyScreen(')
    expect(pageSource).toContain('acceptSafetyHold(')
  })

  it('keeps referral inputs mounted through review and wires an explicit governed new-referral boundary', () => {
    const inputRenderScope = scope(
      "{(pageState === 'input'",
      '{/* Review state */}',
    )
    const startNewScope = scope(
      'function handleStartNewReferral()',
      '// Cancel in-flight AI requests',
    )

    expect(inputRenderScope).toContain("pageState === 'review'")
    expect(inputRenderScope).toContain('ref={triageInputPanelRef}')
    expect(inputRenderScope).toContain(
      "pageState === 'triaging' || pageState === 'review'",
    )
    expect(pageSource).toContain(
      'onStartNewReferral={handleStartNewReferral}',
    )
    expect(startNewScope).toContain("handleReferralLifecycle('clear')")
    expect(startNewScope).toContain(
      'triageInputPanelRef.current?.clearVisibleReferralInput()',
    )
    expect(startNewScope.indexOf("handleReferralLifecycle('clear')")).toBeLessThan(
      startNewScope.indexOf(
        'triageInputPanelRef.current?.clearVisibleReferralInput()',
      ),
    )
  })

  it('keeps governed start safety on a locked review notice without authorizing scoring before extraction completes', () => {
    const startSafetyScope = scope(
      'function surfaceExtractionIngressSafety(',
      'function surfacePolledSafety(',
    )

    expect(startSafetyScope).toContain('humanReviewRequired: true')
    expect(startSafetyScope).toContain('schedulingLocked: true')
    expect(startSafetyScope).not.toContain('runBoundTriage(')
    expect(startSafetyScope).not.toContain("setPageState('triaging')")
    expect(startSafetyScope).not.toContain('postTriage')
  })

  it('sends only the coordinator-built bound request to triage transport', () => {
    const triageScope = scope(
      'async function runBoundTriage(',
      'async function handleCompletedExtraction(',
    )

    expect(triageScope).toContain('triageBoundExtraction(')
    expect(triageScope).toContain('(request) =>')
    expect(triageScope).toContain('postTriage<TriageResult>(')
    for (const forbidden of [
      'referral_text',
      'extracted_summary',
      'patient_age',
      'patient_sex',
      'source_filename',
      'note_type_detected',
      'extraction_confidence',
    ]) {
      expect(triageScope).not.toContain(forbidden)
    }
    expect(pageSource).not.toContain('referral_text:')
    expect(pageSource).not.toContain('extracted_summary:')
  })

  it('validates one upload and binds age and sex before FormData extraction', () => {
    const uploadScope = scope(
      'async function handleSubmitFiles(',
      'async function handleApproveExtraction(',
    )

    expect(uploadScope).toContain('selectSingleReferralFile(files)')
    expect(uploadScope).toContain("formData.append('file', selection.file)")
    expect(uploadScope).toContain("formData.append('patient_age'")
    expect(uploadScope).toContain("formData.append('patient_sex'")
    expect(uploadScope).toContain('postExtractFormData<ClinicalExtraction>')
    expect(uploadScope).toContain('handleCompletedExtraction(')
  })

  it('sends invalid demographics only to extraction safety screening, never directly to scoring', () => {
    expect(inputSource).toContain('setMetadataError(validation.message)')
    expect(inputSource).toContain(
      'onSubmit(textInput.submissionText, validation.metadata)',
    )
    expect(inputSource).toContain(
      'onSubmitFiles(uploadedFiles, validation.metadata)',
    )
    expect(pageSource).toContain('postExtractJSON<ClinicalExtraction>')
    expect(pageSource).toContain('postExtractFormData<ClinicalExtraction>')
    expect(pageSource).not.toContain('referral_text:')
    expect(pageSource).not.toContain('patient_age: request')
    expect(pageSource).not.toContain('patient_sex: request')
  })

  it('keeps approval source-bound and retains structured safety failures', () => {
    const approvalScope = scope(
      'async function handleApproveExtraction()',
      '// Reset everything',
    )

    expect(approvalScope).toContain('runBoundTriage(')
    expect(approvalScope).not.toContain('postTriage')
    expect(pageSource).toContain('retainedSafetyHoldFromError(error)')
    expect(pageSource).toContain(
      'approvalBlockedReason={coordinatedExtraction?.decision.approvalBlockedReason ?? undefined}',
    )
  })

  it('removes ungoverned referring-provider input from both modes', () => {
    expect(inputSource).not.toContain('referring_provider_type')
    expect(inputSource).not.toContain('providerType')
    expect(inputSource).not.toContain('handleProviderTypeChange')
    expect(inputSource).not.toContain('>Referring Provider<')
    expect(inputSource).toContain(
      'Referring-provider type is unavailable until a reviewed provenance schema can persist and verify its source.',
    )
  })
})
