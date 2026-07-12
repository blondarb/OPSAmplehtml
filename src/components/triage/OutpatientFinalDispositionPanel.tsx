'use client'

import { type FormEvent, useRef, useState } from 'react'

import {
  OUTPATIENT_REVIEW_NOTE_MAX_LENGTH,
  buildOutpatientFinalizationCommand,
  finalizedDispositionMatchesResult,
  getOrCreateOutpatientDispositionKey,
  isEligibleForOutpatientFinalization,
  outpatientFinalDispositionFingerprint,
  submitOutpatientFinalization,
  type FinalizedOutpatientDispositionView,
} from '@/lib/triage/outpatientFinalDispositionClient'
import type { TriageResult } from '@/lib/triage/types'

interface Props {
  result: TriageResult
  finalized?: FinalizedOutpatientDispositionView | null
  onFinalized?: (disposition: FinalizedOutpatientDispositionView) => void
}

function label(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export default function OutpatientFinalDispositionPanel({
  result,
  finalized = null,
  onFinalized,
}: Props) {
  const [reviewNote, setReviewNote] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [completed, setCompleted] =
    useState<FinalizedOutpatientDispositionView | null>(null)
  const requestKeys = useRef(new Map<string, string>())

  const activeFinalized =
    finalized && finalizedDispositionMatchesResult(result, finalized)
      ? finalized
      : completed && finalizedDispositionMatchesResult(result, completed)
        ? completed
        : null
  const eligible = isEligibleForOutpatientFinalization(result)

  if (!eligible && !activeFinalized) return null

  if (activeFinalized) {
    return (
      <section
        aria-label="Outpatient final disposition"
        style={{
          marginBottom: '16px',
          padding: '16px',
          borderRadius: '8px',
          border: '2px solid #16a34a',
          background: 'rgba(20, 83, 45, 0.2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <h3 style={{ margin: 0, color: '#dcfce7', fontSize: '0.95rem' }}>
            Outpatient disposition finalized
          </h3>
          <span
            style={{ color: '#86efac', fontSize: '0.75rem', fontWeight: 700 }}
          >
            LOCK RELEASED
          </span>
        </div>
        <p
          aria-live="polite"
          style={{ color: '#bbf7d0', fontSize: '0.8rem', lineHeight: 1.5 }}
        >
          Decision ready: {label(activeFinalized.carePathway)} ·{' '}
          {label(activeFinalized.triageTier)}. Confirmed by{' '}
          {activeFinalized.reviewedBy}.
        </p>
      </section>
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const command = buildOutpatientFinalizationCommand(result, reviewNote)
    if (!confirmed || !command) {
      setError(
        'Disposition was not finalized. Scheduling remains locked until the bounded review note and explicit confirmation are complete.',
      )
      return
    }

    const accepted = window.confirm(
      `Confirm ${label(command.carePathway)} at ${label(command.triageTier)} and release the scheduling lock?`,
    )
    if (!accepted) return

    const fingerprint = outpatientFinalDispositionFingerprint(command)
    const idempotencyKey = getOrCreateOutpatientDispositionKey(
      requestKeys.current,
      fingerprint,
    )
    setSubmitting(true)
    setError('')
    try {
      const disposition = await submitOutpatientFinalization(
        command,
        idempotencyKey,
      )
      requestKeys.current.delete(fingerprint)
      setCompleted(disposition)
      onFinalized?.(disposition)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Disposition was not finalized. Scheduling remains locked; refresh and retry after resolving any open safety work.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const normalizedNote = reviewNote.trim()
  const canSubmit =
    confirmed &&
    normalizedNote.length > 0 &&
    normalizedNote.length <= OUTPATIENT_REVIEW_NOTE_MAX_LENGTH &&
    !submitting

  return (
    <section
      aria-label="Outpatient final disposition"
      style={{
        marginBottom: '16px',
        padding: '16px',
        borderRadius: '8px',
        border: '2px solid #d97706',
        background: 'rgba(120, 53, 15, 0.16)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <h3 style={{ margin: 0, color: '#fef3c7', fontSize: '0.95rem' }}>
          Finalize outpatient disposition
        </h3>
        <span style={{ color: '#fca5a5', fontSize: '0.75rem', fontWeight: 700 }}>
          SCHEDULING LOCKED
        </span>
      </div>

      <p style={{ color: '#fde68a', fontSize: '0.78rem', lineHeight: 1.5 }}>
        Confirm the current recommendation only after reviewing the complete
        referral and safety evidence. The server will recheck coverage, data
        quality, unresolved critical questions, emergency actions, and the
        unchanged disposition before releasing the lock.
      </p>

      <div
        style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '12px',
        }}
      >
        <span
          style={{
            color: '#e2e8f0',
            background: '#0f172a',
            border: '1px solid #475569',
            borderRadius: '999px',
            padding: '4px 8px',
            fontSize: '0.72rem',
          }}
        >
          Pathway: {label(result.care_pathway ?? 'undetermined')}
        </span>
        <span
          style={{
            color: '#e2e8f0',
            background: '#0f172a',
            border: '1px solid #475569',
            borderRadius: '999px',
            padding: '4px 8px',
            fontSize: '0.72rem',
          }}
        >
          Tier: {label(result.triage_tier)}
        </span>
      </div>

      <form onSubmit={(event) => void submit(event)}>
        <label
          htmlFor={`outpatient-review-note-${result.session_id}`}
          style={{ color: '#f8fafc', fontSize: '0.78rem', fontWeight: 700 }}
        >
          Clinical review note
        </label>
        <textarea
          id={`outpatient-review-note-${result.session_id}`}
          aria-describedby={`outpatient-review-count-${result.session_id}`}
          value={reviewNote}
          maxLength={OUTPATIENT_REVIEW_NOTE_MAX_LENGTH}
          disabled={submitting}
          required
          onChange={(event) => setReviewNote(event.target.value)}
          placeholder="Document the evidence reviewed and why this exact outpatient disposition is appropriate."
          style={{
            display: 'block',
            width: '100%',
            minHeight: '88px',
            boxSizing: 'border-box',
            marginTop: '6px',
            padding: '10px',
            borderRadius: '6px',
            border: '1px solid #64748b',
            background: '#0f172a',
            color: '#f8fafc',
            fontSize: '0.8rem',
          }}
        />
        <div
          id={`outpatient-review-count-${result.session_id}`}
          style={{
            color: '#94a3b8',
            fontSize: '0.7rem',
            textAlign: 'right',
            marginTop: '4px',
          }}
        >
          {reviewNote.length} / {OUTPATIENT_REVIEW_NOTE_MAX_LENGTH}
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            color: '#e2e8f0',
            fontSize: '0.78rem',
            lineHeight: 1.5,
            marginTop: '10px',
          }}
        >
          <input
            type="checkbox"
            checked={confirmed}
            disabled={submitting}
            required
            onChange={(event) => setConfirmed(event.target.checked)}
            style={{ marginTop: '3px' }}
          />
          <span>
            I reviewed the complete referral evidence, safety findings, data
            quality, and coverage, and I confirm this exact pathway and tier.
          </span>
        </label>

        {error && (
          <div
            role="alert"
            style={{ color: '#fecaca', fontSize: '0.78rem', marginTop: '10px' }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            marginTop: '12px',
            padding: '9px 14px',
            borderRadius: '6px',
            border: '1px solid #f59e0b',
            background: canSubmit ? '#b45309' : '#475569',
            color: '#fff',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontSize: '0.78rem',
            fontWeight: 700,
          }}
        >
          {submitting
            ? 'Verifying and finalizing…'
            : 'Confirm disposition and release scheduling lock'}
        </button>
      </form>
    </section>
  )
}
