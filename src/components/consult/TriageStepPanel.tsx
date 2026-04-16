'use client'

import { useState } from 'react'
import type { NeurologyConsult } from '@/lib/consult/types'
import type { SamplePersona } from '@/lib/consult/samplePersonas'
import SamplePatientSelector from './SamplePatientSelector'

interface TriageStepPanelProps {
  consult: NeurologyConsult | null
  onTriageComplete: (consultId: string, consult: NeurologyConsult) => void
  onError: (msg: string) => void
  selectedPersonaId: string | null
  onPersonaSelected: (persona: SamplePersona | null) => void
}

export default function TriageStepPanel({
  consult,
  onTriageComplete,
  onError,
  selectedPersonaId,
  onPersonaSelected,
}: TriageStepPanelProps) {
  const [referralText, setReferralText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function handleSelectPersona(persona: SamplePersona) {
    setReferralText(persona.referralText)
    onPersonaSelected(persona)
  }

  function handleReferralChange(value: string) {
    setReferralText(value)
    // If the user edits the referral, they've diverged from the canned persona.
    if (selectedPersonaId) onPersonaSelected(null)
  }

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

  const trimmedLength = referralText.trim().length
  const isTooShort = trimmedLength > 0 && trimmedLength < 50

  async function handleSubmit() {
    if (!referralText.trim()) return
    if (trimmedLength < 50) {
      onError(`Referral text must be at least 50 characters for meaningful triage (currently ${trimmedLength}). Please provide more clinical detail — e.g., age, symptoms, duration, and relevant history.`)
      return
    }
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
        const err = await triageRes.json().catch(() => ({}))
        const msg = err.error || 'Triage failed'
        throw new Error(triageRes.status === 400
          ? msg
          : `Triage error: ${msg}. Please check the referral text and try again.`)
      }

      const triageData = await triageRes.json()

      // Step 2: Create consult with triage results
      // Build a clinical summary from the triage response fields
      const reasons = triageData.clinical_reasons || []
      const workup = triageData.suggested_workup || []
      const summaryParts: string[] = []
      if (reasons.length) summaryParts.push('Clinical Reasons:\n' + reasons.map((r: string) => `• ${r}`).join('\n'))
      if (workup.length) summaryParts.push('Suggested Workup:\n' + workup.map((w: string) => `• ${w}`).join('\n'))
      if (triageData.subspecialty_rationale) summaryParts.push('Subspecialty Rationale:\n' + triageData.subspecialty_rationale)
      const triageSummary = summaryParts.join('\n\n')

      // Derive chief complaint from first clinical reason or referral text
      const chiefComplaint = reasons[0]?.slice(0, 200) || referralText.slice(0, 200)

      const consultRes = await fetch('/api/neuro-consults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referral_text: referralText,
          triage_data: {
            triage_session_id: triageData.session_id || '',
            triage_urgency: triageData.triage_tier || 'routine',
            triage_tier_display: triageData.triage_tier_display || (triageData.triage_tier || 'ROUTINE').toUpperCase(),
            triage_summary: triageSummary,
            triage_chief_complaint: chiefComplaint,
            triage_red_flags: triageData.red_flags || [],
            triage_subspecialty: triageData.subspecialty_recommendation || '',
          },
        }),
      })

      if (!consultRes.ok) {
        const err = await consultRes.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save the consult record. Please try again.')
      }

      const consultData = await consultRes.json()
      onTriageComplete(consultData.consult.id, consultData.consult)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'An unexpected error occurred. Please try again.')
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

      <SamplePatientSelector
        selectedId={selectedPersonaId}
        onSelect={handleSelectPersona}
        disabled={submitting}
      />

      <textarea
        value={referralText}
        onChange={(e) => handleReferralChange(e.target.value)}
        placeholder="Paste referral note here, or pick a sample patient above.&#10;&#10;Example: 42-year-old female with 3-month history of progressive bilateral hand tremor, worse at rest. No family history of movement disorders. Currently on no medications."
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

      {/* Character count hint */}
      {referralText.trim().length > 0 && (
        <p style={{
          fontSize: 12,
          margin: '6px 0 0',
          color: isTooShort ? '#F59E0B' : '#64748B',
        }}>
          {isTooShort
            ? `${trimmedLength}/50 characters minimum — add more clinical detail (age, symptoms, duration, history)`
            : `${trimmedLength} characters`}
        </p>
      )}

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
