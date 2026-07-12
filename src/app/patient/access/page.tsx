import type { Metadata } from 'next'

import {
  PATIENT_ACCESS_EXCHANGE_SCRIPT,
} from '@/lib/patientAccess/exchangePage'

export const metadata: Metadata = {
  title: 'Secure patient access | Sevaro Ambulatory',
  robots: { index: false, follow: false },
}

export default function PatientAccessExchangePage() {
  return (
    <>
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#0f172a',
          color: '#e2e8f0',
        }}
      >
        <section
          aria-live="polite"
          style={{
            width: '100%',
            maxWidth: '480px',
            border: '1px solid #334155',
            borderRadius: '16px',
            background: '#111c31',
            padding: '32px',
            textAlign: 'center',
          }}
        >
          <h1 style={{ margin: '0 0 12px', fontSize: '1.35rem' }}>
            Securing your access
          </h1>
          <p
            id="patient-access-status"
            style={{ margin: 0, color: '#94a3b8', lineHeight: 1.6 }}
          >
            Please wait while we verify your one-time link.
          </p>
          <button
            id="patient-access-clear-session"
            type="button"
            hidden
            style={{
              marginTop: '20px',
              border: '1px solid #475569',
              borderRadius: '8px',
              background: '#1e293b',
              color: '#e2e8f0',
              padding: '10px 14px',
              cursor: 'pointer',
            }}
          >
            Clear patient access on this browser
          </button>
        </section>
      </main>
      <script
        id="patient-access-fragment-exchange"
        dangerouslySetInnerHTML={{ __html: PATIENT_ACCESS_EXCHANGE_SCRIPT }}
      />
    </>
  )
}
