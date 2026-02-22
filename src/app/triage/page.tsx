'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TriageResult } from '@/lib/triage/types'
import TriageInputPanel from '@/components/triage/TriageInputPanel'
import TriageOutputPanel from '@/components/triage/TriageOutputPanel'
import DisclaimerBanner from '@/components/triage/DisclaimerBanner'

export default function TriagePage() {
  const [result, setResult] = useState<TriageResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(
    referralText: string,
    metadata: { patient_age?: number; patient_sex?: string; referring_provider_type?: string }
  ) {
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const res = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referral_text: referralText, ...metadata }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'The triage system is temporarily unavailable. Please triage this patient manually and contact support.')
      }

      const data: TriageResult = await res.json()
      setResult(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleTryAnother() {
    setResult(null)
    setError('')
  }

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
            Paste a referral note below. The AI analyzes clinical features, scores five dimensions,
            and the application calculates a triage tier deterministically. All scoring is transparent and auditable.
          </p>
        </div>

        {/* Input or Output */}
        {result ? (
          <TriageOutputPanel result={result} onTryAnother={handleTryAnother} />
        ) : (
          <>
            <TriageInputPanel onSubmit={handleSubmit} loading={loading} />

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

            {/* Disclaimer on input side too */}
            <DisclaimerBanner />
          </>
        )}
      </div>
    </div>
  )
}
