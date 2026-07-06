'use client'

interface HistorianConsentDisclosureProps {
  onConfirm: () => void
  onCancel?: () => void
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
}: HistorianConsentDisclosureProps) {
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
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
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
          Before you begin
        </h2>
        <p
          id="historian-consent-body"
          style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.6, margin: '0 0 20px' }}
        >
          You&apos;ll be talking with an AI assistant — not a physician or nurse. It cannot
          diagnose you, give medical advice, or help in an emergency. If this is an emergency,
          call 911 now. Your conversation is recorded and transcribed so your care team can
          review it.
        </p>

        <button
          onClick={onConfirm}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '10px',
            background: '#0d9488',
            color: '#fff',
            border: 'none',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: 'pointer',
          }}
        >
          I understand — start the interview
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
          You can end the interview at any time.
        </p>
      </div>
    </div>
  )
}
