'use client'

import { useState } from 'react'
import type { NeurologyConsult } from '@/lib/consult/types'

interface TriageStepPanelProps {
  consult: NeurologyConsult | null
  onTriageComplete: (consultId: string, consult: NeurologyConsult) => void
  onError: (msg: string) => void
}

export default function TriageStepPanel({ consult, onTriageComplete, onError }: TriageStepPanelProps) {
  const [referralText, setReferralText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // If consult already has triage, show summary
  if (consult && consult.triage_completed_at) {
    return (
      <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 12, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ color: '#22C55E', fontSize: 18 }}>✓</span>
          <h3 style={{ color: '#E2E8F0', fontSize: 16, fontWeight: 700, margin: 0 }}>Triage Complete</h3>
          {consult.triage_tier_display && (
            <span
              style={{
                padding: '3px 10px',
                borderRadius: 6,
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#F59E0B',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              {consult.triage_tier_display}
            </span>
          )}
        </div>
        {consult.triage_chief_complaint && (
          <p style={{ color: '#CBD5E1', fontSize: 14, margin: '0 0 8px' }}>
            <strong style={{ color: '#94A3B8' }}>Chief Complaint:</strong> {consult.triage_chief_complaint}
          </p>
        )}
        {consult.triage_subspecialty && (
          <p style={{ color: '#CBD5E1', fontSize: 14, margin: '0 0 8px' }}>
            <strong style={{ color: '#94A3B8' }}>Subspecialty:</strong> {consult.triage_subspecialty}
          </p>
        )}
        {consult.triage_summary && (
          <pre style={{ color: '#94A3B8', fontSize: 13, margin: '12px 0 0', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
            {consult.triage_summary}
          </pre>
        )}
      </div>
    )
  }

  async function handleSubmit() {
    if (!referralText.trim()) return
    setSubmitting(true)
    onError('')

    try {
      // Step 1: Run triage
      const triageRes = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referral_text: referralText }),
      })

      if (!triageRes.ok) {
        const err = await triageRes.json().catch(() => ({ error: 'Triage failed' }))
        throw new Error(err.error || 'Triage failed')
      }

      const triageData = await triageRes.json()

      // Step 2: Create consult with triage results
      const result = triageData.result || {}
      const consultRes = await fetch('/api/neuro-consults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referral_text: referralText,
          triage_data: {
            triage_session_id: triageData.session_id || '',
            triage_urgency: result.overall_tier || result.triage_tier || 'routine',
            triage_tier_display: (result.overall_tier || result.triage_tier || 'ROUTINE').toUpperCase(),
            triage_summary: result.clinical_summary || '',
            triage_chief_complaint: result.chief_complaint || referralText.slice(0, 200),
            triage_red_flags: result.red_flags || [],
            triage_subspecialty: result.recommended_subspecialty || '',
          },
        }),
      })

      if (!consultRes.ok) {
        const err = await consultRes.json().catch(() => ({ error: 'Failed to create consult' }))
        throw new Error(err.error || 'Failed to create consult')
      }

      const consultData = await consultRes.json()
      onTriageComplete(consultData.consult.id, consultData.consult)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 12, padding: 24 }}>
      <h3 style={{ color: '#E2E8F0', fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
        Step 1: Referral Triage
      </h3>
      <p style={{ color: '#94A3B8', fontSize: 13, margin: '0 0 16px' }}>
        Paste the referral note or chief complaint. The AI will score urgency, identify red flags, and recommend a subspecialty.
      </p>

      <textarea
        value={referralText}
        onChange={(e) => setReferralText(e.target.value)}
        placeholder="Paste referral note here…&#10;&#10;Example: 42-year-old female with 3-month history of progressive bilateral hand tremor, worse at rest. No family history of movement disorders. Currently on no medications."
        disabled={submitting}
        style={{
          width: '100%',
          minHeight: 160,
          padding: 14,
          borderRadius: 8,
          border: '1px solid #475569',
          background: '#0F172A',
          color: '#E2E8F0',
          fontSize: 14,
          lineHeight: 1.6,
          resize: 'vertical',
          fontFamily: 'inherit',
          outline: 'none',
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button
          onClick={handleSubmit}
          disabled={submitting || !referralText.trim()}
          style={{
            padding: '10px 24px',
            borderRadius: 8,
            border: 'none',
            background: submitting ? '#475569' : '#0D9488',
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: 600,
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: !referralText.trim() ? 0.5 : 1,
          }}
        >
          {submitting ? 'Running Triage…' : 'Run Triage & Create Consult'}
        </button>
      </div>
    </div>
  )
}
