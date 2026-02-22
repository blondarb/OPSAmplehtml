'use client'

import { useState } from 'react'

interface Props {
  reason: string | null
  onAcknowledge: () => void
}

export default function EmergentAlert({ reason, onAcknowledge }: Props) {
  const [visible, setVisible] = useState(true)

  if (!visible) return null

  return (
    <>
      <style>{`
        @keyframes emergentPulse {
          0%, 100% { border-color: #DC2626; box-shadow: 0 0 20px rgba(220, 38, 38, 0.5); }
          50% { border-color: #991B1B; box-shadow: 0 0 40px rgba(220, 38, 38, 0.8); }
        }
        @keyframes emergentBg {
          0%, 100% { background: rgba(0, 0, 0, 0.92); }
          50% { background: rgba(30, 0, 0, 0.95); }
        }
      `}</style>
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        animation: 'emergentBg 2s ease-in-out infinite',
      }}>
        <div style={{
          maxWidth: '560px',
          width: '100%',
          padding: '40px',
          borderRadius: '16px',
          background: '#1E1E1E',
          border: '4px solid #DC2626',
          textAlign: 'center',
          animation: 'emergentPulse 2s ease-in-out infinite',
        }}>
          {/* Alert icon */}
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: '#DC2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          <h2 style={{
            color: '#DC2626',
            fontSize: '1.5rem',
            fontWeight: 800,
            letterSpacing: '0.05em',
            margin: '0 0 8px',
          }}>
            EMERGENT
          </h2>
          <p style={{
            color: '#fca5a5',
            fontSize: '1.1rem',
            fontWeight: 600,
            margin: '0 0 20px',
          }}>
            Redirect to ED Immediately
          </p>

          <div style={{
            padding: '16px',
            background: 'rgba(220, 38, 38, 0.1)',
            borderRadius: '8px',
            marginBottom: '20px',
          }}>
            <p style={{
              color: '#f1f5f9',
              fontSize: '0.9rem',
              lineHeight: 1.7,
              margin: 0,
            }}>
              This patient requires immediate emergency evaluation. <strong>Do NOT schedule outpatient.</strong> Contact the referring provider and/or patient to redirect to the nearest ED.
            </p>
          </div>

          {reason && (
            <p style={{
              color: '#fca5a5',
              fontSize: '0.85rem',
              margin: '0 0 24px',
              fontStyle: 'italic',
            }}>
              Reason: {reason}
            </p>
          )}

          <button
            onClick={() => { setVisible(false); onAcknowledge() }}
            style={{
              padding: '12px 32px',
              borderRadius: '8px',
              background: '#DC2626',
              color: '#fff',
              border: 'none',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Acknowledge & View Full Triage
          </button>
        </div>
      </div>
    </>
  )
}
