'use client'

import { useId, useState } from 'react'

interface HistorianConsentDisclosureProps {
  onConfirm: () => void
  onCancel?: () => void
  /**
   * When true (the patient-facing /patient/historian surface), the gate also
   * requires full name + date of birth before the interview can begin
   * (SAFE-1/SAFE-2 identity confirmation). The typed identity is an
   * attestation gate only: it lives in this component's state and is never
   * sent to the voice model, the transcript, or the database — neither voice
   * engine is under a Sevaro BAA, so no new data path may carry it out of the
   * browser.
   */
  requireIdentity?: boolean
  /**
   * 'modal' (default) — the original dark overlay, used by the clinician-side
   * /consult EmbeddedHistorian. 'page' — renders the same gate inline as a
   * full step of the patient flow, styled by the nn design system (the caller
   * must render it inside a `.nn` scope). Same fields, same strings, same
   * gating logic in both presentations.
   */
  presentation?: 'modal' | 'page'
}

/**
 * Pre-interview consent/disclosure gate for the AI Historian.
 *
 * Approved by Steve Arbogast, DO (2026-07-06): "patient consent needs to be
 * built in" — all patients today are artificial/synthetic, but this ships
 * ahead of any real-patient use. UI gate only; no schema changes. The caller
 * MUST NOT invoke startSession() until onConfirm fires — see NeurologicHistorian
 * and EmbeddedHistorian, which hold the Realtime session start behind a
 * `consentAcknowledged` boolean gated on this component's confirm action.
 */
export default function HistorianConsentDisclosure({
  onConfirm,
  onCancel,
  requireIdentity = false,
  presentation = 'modal',
}: HistorianConsentDisclosureProps) {
  const [agreed, setAgreed] = useState(false)
  const [fullName, setFullName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const nameId = useId()
  const dobId = useId()
  const consentId = useId()

  const identityComplete =
    !requireIdentity || (fullName.trim().length > 1 && dateOfBirth.length > 0)
  const canContinue = agreed && identityComplete

  if (presentation === 'page') {
    return (
      <div>
        <h2 className="nn-hist-title">Before we begin</h2>
        <p className="nn-lede">
          This interview is conducted by an automated AI assistant — not a physician or
          nurse. Your voice is recorded and transcribed. What you share becomes a draft
          summary that your clinician reviews before your visit. It is not a diagnosis,
          and the assistant will not give you medical advice.
        </p>

        <div className="nn-flag" role="note" aria-label="This is not for emergencies">
          <h4>This is not for emergencies</h4>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.55 }}>
            If you have sudden weakness or numbness, trouble speaking, a seizure, or the
            worst headache of your life — stop now and call 911 or go to the nearest
            emergency department.
          </p>
        </div>

        <div className="nn-card">
          <label
            htmlFor={consentId}
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
              fontSize: '1rem',
              lineHeight: 1.5,
              cursor: 'pointer',
              color: 'var(--nn-ink)',
            }}
          >
            <input
              id={consentId}
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{
                width: 22,
                height: 22,
                flexShrink: 0,
                marginTop: '1px',
                accentColor: 'var(--nn-accent)',
              }}
            />
            <span>
              I understand an AI assistant will ask me questions, my voice will be recorded
              and transcribed, and a clinician will review my answers before my visit. This
              is not a diagnosis.
            </span>
          </label>
        </div>

        {requireIdentity && (
          <div style={{ margin: '0 0 16px' }}>
            <div style={{ margin: '0 0 14px' }}>
              <label htmlFor={nameId} className="nn-label">Your full name</label>
              <input
                id={nameId}
                type="text"
                autoComplete="off"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="First and last name"
                className="nn-input"
              />
            </div>
            <div>
              <label htmlFor={dobId} className="nn-label">Date of birth</label>
              <input
                id={dobId}
                type="date"
                autoComplete="off"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="nn-input"
              />
            </div>
            <p className="nn-hint" style={{ margin: '8px 0 0' }}>
              Used only to confirm who is completing this interview. It is not saved and is
              not shared with the AI assistant.
            </p>
          </div>
        )}

        <button
          onClick={onConfirm}
          disabled={!canContinue}
          aria-disabled={!canContinue}
          className="nn-btn nn-btn--block"
        >
          Begin interview
        </button>

        {onCancel && (
          <button
            onClick={onCancel}
            className="nn-btn--quiet nn-btn--block"
            style={{ width: '100%', marginTop: 8, padding: '12px' }}
          >
            Cancel
          </button>
        )}

        <p style={{ color: 'var(--nn-ink-3)', fontSize: 'var(--nn-fs-sm)', textAlign: 'center', margin: '16px 0 0' }}>
          You can pause or end the interview at any time.
        </p>
      </div>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="historian-consent-title"
      aria-describedby="historian-consent-body"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2, 6, 23, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        zIndex: 1000,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          maxHeight: '90vh',
          overflowY: 'auto',
          borderRadius: '16px',
          border: '1px solid #334155',
          background: '#1e293b',
          padding: '28px 24px 24px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <h2
          id="historian-consent-title"
          style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 700, margin: '0 0 12px' }}
        >
          Before we begin
        </h2>
        <p
          id="historian-consent-body"
          style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.6, margin: '0 0 16px' }}
        >
          This interview is conducted by an automated AI assistant — not a physician or
          nurse. Your voice is recorded and transcribed. What you share becomes a draft
          summary that your clinician reviews before your visit. It is not a diagnosis,
          and the assistant will not give you medical advice.
        </p>

        {/* Emergency redirect — must be visible before any interview can start */}
        <div
          role="note"
          aria-label="This is not for emergencies"
          style={{
            border: '1px solid rgba(239, 68, 68, 0.5)',
            background: 'rgba(239, 68, 68, 0.12)',
            borderRadius: '10px',
            padding: '14px 16px',
            margin: '0 0 16px',
          }}
        >
          <p style={{
            color: '#fca5a5',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            margin: '0 0 6px',
          }}>
            This is not for emergencies
          </p>
          <p style={{ color: '#fecaca', fontSize: '0.875rem', lineHeight: 1.55, margin: 0 }}>
            If you have sudden weakness or numbness, trouble speaking, a seizure, or the
            worst headache of your life — stop now and call 911 or go to the nearest
            emergency department.
          </p>
        </div>

        {/* Explicit consent — never pre-checked */}
        <div
          style={{
            border: '1px solid #334155',
            background: '#0f172a',
            borderRadius: '10px',
            padding: '14px 16px',
            margin: '0 0 16px',
          }}
        >
          <label
            htmlFor={consentId}
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
              color: '#e2e8f0',
              fontSize: '0.875rem',
              lineHeight: 1.55,
              cursor: 'pointer',
            }}
          >
            <input
              id={consentId}
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{
                width: 20,
                height: 20,
                flexShrink: 0,
                marginTop: '1px',
                accentColor: '#0d9488',
              }}
            />
            <span>
              I understand an AI assistant will ask me questions, my voice will be recorded
              and transcribed, and a clinician will review my answers before my visit. This
              is not a diagnosis.
            </span>
          </label>
        </div>

        {/* Identity confirmation — required before any clinical question is asked */}
        {requireIdentity && (
          <div style={{ margin: '0 0 16px' }}>
            <div style={{ margin: '0 0 12px' }}>
              <label
                htmlFor={nameId}
                style={{
                  display: 'block',
                  color: '#cbd5e1',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginBottom: '5px',
                }}
              >
                Your full name
              </label>
              <input
                id={nameId}
                type="text"
                autoComplete="off"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="First and last name"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #475569',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  fontSize: '1rem',
                }}
              />
            </div>
            <div>
              <label
                htmlFor={dobId}
                style={{
                  display: 'block',
                  color: '#cbd5e1',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginBottom: '5px',
                }}
              >
                Date of birth
              </label>
              <input
                id={dobId}
                type="date"
                autoComplete="off"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #475569',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  fontSize: '1rem',
                }}
              />
            </div>
            <p style={{ color: '#64748b', fontSize: '0.72rem', lineHeight: 1.5, margin: '8px 0 0' }}>
              Used only to confirm who is completing this interview. It is not saved and is
              not shared with the AI assistant.
            </p>
          </div>
        )}

        <button
          onClick={onConfirm}
          disabled={!canContinue}
          aria-disabled={!canContinue}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '10px',
            background: canContinue ? '#0d9488' : '#334155',
            color: canContinue ? '#fff' : '#64748b',
            border: 'none',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: canContinue ? 'pointer' : 'not-allowed',
          }}
        >
          Begin interview
        </button>

        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              width: '100%',
              padding: '10px',
              marginTop: '8px',
              borderRadius: '10px',
              background: 'transparent',
              color: '#94a3b8',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        )}

        <p style={{ color: '#64748b', fontSize: '0.75rem', textAlign: 'center', margin: '16px 0 0' }}>
          You can pause or end the interview at any time.
        </p>
      </div>
    </div>
  )
}
