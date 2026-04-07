'use client'

import { useState, useEffect, useRef } from 'react'
import type { NeurologyConsult } from '@/lib/consult/types'

interface HistorianStepPanelProps {
  consultId: string
  consult: NeurologyConsult | null
  onComplete: () => void
  onError: (msg: string) => void
}

export default function HistorianStepPanel({ consultId, consult, onComplete, onError }: HistorianStepPanelProps) {
  const [skipping, setSkipping] = useState(false)
  const [polling, setPolling] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll consult status every 5s after historian tab opens
  useEffect(() => {
    if (!polling) return
    pollingRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/neuro-consults/${consultId}`)
        const data = await r.json()
        if (data.consult?.status === 'historian_complete' || data.consult?.historian_completed_at) {
          setPolling(false)
          onComplete()
        }
      } catch {
        // Silently retry on next interval
      }
    }, 5000)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [polling, consultId, onComplete])

  // If historian already complete, show summary
  if (consult?.historian_completed_at) {
    return (
      <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 12, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ color: '#22C55E', fontSize: 18 }}>✓</span>
          <h3 style={{ color: '#E2E8F0', fontSize: 16, fontWeight: 700, margin: 0 }}>AI Historian Complete</h3>
        </div>
        {consult.historian_summary && (
          <pre style={{ color: '#CBD5E1', fontSize: 13, whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
            {consult.historian_summary}
          </pre>
        )}
        {consult.historian_red_flags && consult.historian_red_flags.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <span style={{ color: '#EF4444', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>
              Red Flags Detected:
            </span>
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              {consult.historian_red_flags.map((rf, i) => (
                <li key={i} style={{ color: '#FCA5A5', fontSize: 13, marginBottom: 2 }}>
                  {rf.flag} ({rf.severity})
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          onClick={onComplete}
          style={{
            marginTop: 16,
            padding: '10px 24px',
            borderRadius: 8,
            border: 'none',
            background: '#0D9488',
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Continue to Patient Tools →
        </button>
      </div>
    )
  }

  // Mark historian as skipped / proceed
  async function handleSkip() {
    setSkipping(true)
    try {
      await fetch(`/api/neuro-consults/${consultId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'historian_complete' }),
      })
      onComplete()
    } catch {
      onError('Failed to skip historian step')
    } finally {
      setSkipping(false)
    }
  }

  const historianUrl = `/patient/historian?consult_id=${consultId}&referral_reason=${encodeURIComponent(consult?.triage_chief_complaint || '')}`

  return (
    <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 12, padding: 24 }}>
      <h3 style={{ color: '#E2E8F0', fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
        Step 2: AI Historian Interview
      </h3>
      <p style={{ color: '#94A3B8', fontSize: 13, margin: '0 0 16px' }}>
        The patient completes a voice interview with the AI Historian. The AI gathers HPI, medications,
        allergies, medical history, and review of systems using the OLDCARTS framework.
      </p>

      {/* Triage context card */}
      {consult && (
        <div
          style={{
            background: '#0F172A',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <span style={{ color: '#64748B', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            From Triage
          </span>
          <p style={{ color: '#CBD5E1', fontSize: 13, margin: '6px 0 0' }}>
            {consult.triage_chief_complaint || 'Neurological consultation'}
          </p>
          {consult.triage_red_flags && consult.triage_red_flags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {consult.triage_red_flags.map((flag, i) => (
                <span
                  key={i}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#EF4444',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {flag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <a
          href={historianUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setPolling(true)}
          style={{
            padding: '10px 24px',
            borderRadius: 8,
            background: '#8B5CF6',
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          Open Historian Interview ↗
        </a>
        <button
          onClick={handleSkip}
          disabled={skipping}
          style={{
            padding: '10px 24px',
            borderRadius: 8,
            border: '1px solid #475569',
            background: 'transparent',
            color: '#94A3B8',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {skipping ? 'Skipping…' : 'Skip for Now'}
        </button>
        <button
          onClick={onComplete}
          style={{
            padding: '10px 24px',
            borderRadius: 8,
            border: '1px solid #334155',
            background: 'transparent',
            color: '#0D9488',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            marginLeft: 'auto',
          }}
        >
          Already Complete → Continue
        </button>
      </div>

      {polling ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#8B5CF6', animation: 'pulse 1.5s infinite' }} />
          <p style={{ color: '#A78BFA', fontSize: 12, margin: 0 }}>
            Waiting for historian interview to complete… This page will auto-advance.
          </p>
        </div>
      ) : (
        <p style={{ color: '#64748B', fontSize: 12, marginTop: 12, fontStyle: 'italic' }}>
          The historian interview opens in a new tab. This page will auto-advance when complete.
        </p>
      )}
    </div>
  )
}
