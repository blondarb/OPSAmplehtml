'use client'

/**
 * ClaraDecisionCard — one triage decision (confidence, rationale, red
 * flags, Gate 0 status, routing target) with a 👍/👎 + reason feedback form.
 *
 * Used from three places: ClaraVoiceTestView's post-call results section,
 * and the /rnd/clara/results review page (both live decisions and
 * previously-logged session turns). Feedback POSTs to
 * /api/ai/clara/feedback and becomes a `clara_test_feedback` row
 * (migrations/049) — a 👎 + corrected label is a labeled eval case for the
 * sevaro-voice-agent harness.
 */

import { useEffect, useState } from 'react'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { describeRoutingTarget, URGENCY_COLORS } from '@/lib/clara/routingDisplay'
import { CONSULT_TYPE_OPTIONS, TESTER_NAME_STORAGE_KEY, type ClaraDecisionSnapshot, type ClaraFeedbackRow } from '@/lib/clara/feedbackTypes'

interface ClaraDecisionCardProps {
  decision: ClaraDecisionSnapshot
  /** Narrated action label from the classify route's routing.label, if available (e.g. "would transfer now"). */
  routingActionLabel?: string | null
  /** Null when the parent test call hasn't finished logging yet — feedback is disabled until it has a session to attach to. */
  sessionId: string | null
  turnIndex: number | null
  existingFeedback?: ClaraFeedbackRow[]
  onSubmitted?: (row: ClaraFeedbackRow) => void
  /** Turn/decision label shown in the card header, e.g. "Turn 1" or a test label. */
  heading?: string
}

export default function ClaraDecisionCard({
  decision,
  routingActionLabel,
  sessionId,
  turnIndex,
  existingFeedback = [],
  onSubmitted,
  heading,
}: ClaraDecisionCardProps) {
  const [formOpen, setFormOpen] = useState(existingFeedback.length === 0)
  const [verdict, setVerdict] = useState<'up' | 'down' | null>(null)
  const [reason, setReason] = useState('')
  const [correctedType, setCorrectedType] = useState('')
  const [testerName, setTesterName] = useState('Steve')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(TESTER_NAME_STORAGE_KEY)
      if (stored) setTesterName(stored)
    } catch {
      // localStorage unavailable — non-fatal, defaults to "Steve"
    }
  }, [])

  const routingTarget = describeRoutingTarget(decision.consultType, decision.statLevel)

  const submit = async () => {
    if (!verdict || !sessionId) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/ai/clara/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          turnIndex,
          consultType: decision.consultType,
          urgencyLevel: decision.urgencyLevel,
          statLevel: decision.statLevel,
          confidence: decision.confidence,
          rationale: decision.rationale,
          redFlags: decision.redFlags,
          gate0Fired: decision.gate0Fired,
          routingTarget,
          verdict,
          reason: reason.trim() || null,
          correctedConsultType: verdict === 'down' ? correctedType || null : null,
          createdBy: testerName.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSubmitError(data?.error || `HTTP ${res.status}`)
        setSubmitting(false)
        return
      }
      try {
        window.localStorage.setItem(TESTER_NAME_STORAGE_KEY, testerName.trim() || 'Steve')
      } catch {
        // non-fatal
      }
      setSubmitting(false)
      setFormOpen(false)
      setConfirming(false)
      setVerdict(null)
      setReason('')
      setCorrectedType('')
      if (data.feedback) onSubmitted?.(data.feedback)
    } catch (err) {
      setSubmitting(false)
      setSubmitError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: decision.gate0Fired ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        padding: 14,
        fontSize: 13,
      }}
    >
      {heading && <div style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.4 }}>{heading}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <span
          style={{
            background: URGENCY_COLORS[decision.urgencyLevel || ''] || '#64748b',
            color: 'white',
            fontWeight: 700,
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 6,
            textTransform: 'uppercase',
          }}
        >
          {decision.urgencyLevel || 'unknown'}
        </span>
        <span style={{ fontWeight: 700 }}>{decision.consultType}</span>
        {typeof decision.statLevel === 'number' && <span style={{ color: '#94a3b8' }}>STAT {decision.statLevel}</span>}
        {typeof decision.confidence === 'number' && <span style={{ color: '#94a3b8' }}>confidence {Math.round(decision.confidence * 100)}%</span>}
        {decision.gate0Fired && (
          <span style={{ color: '#fca5a5', fontWeight: 700 }}>GATE 0</span>
        )}
      </div>

      <div style={{ color: '#cbd5e1', marginBottom: 6 }}>
        <strong style={{ color: '#94a3b8' }}>Why: </strong>
        {decision.rationale || '—'}
      </div>

      <div style={{ color: '#a78bfa', fontWeight: 600, marginBottom: 4 }}>Routes to: {routingTarget}</div>
      {routingActionLabel && <div style={{ color: '#94a3b8', marginBottom: 4 }}>{routingActionLabel}</div>}

      {decision.redFlags?.length > 0 && (
        <div style={{ color: '#fca5a5', marginBottom: 4 }}>Red flags: {decision.redFlags.join(', ')}</div>
      )}

      {/* ── Feedback ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {existingFeedback.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: formOpen ? 10 : 0 }}>
            {existingFeedback.map((fb) => (
              <div key={fb.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12, color: '#cbd5e1' }}>
                {fb.verdict === 'up' ? <ThumbsUp size={14} color="#22c55e" /> : <ThumbsDown size={14} color="#ef4444" />}
                <div>
                  <span style={{ color: '#94a3b8' }}>{fb.created_by || 'reviewer'}</span>
                  {fb.reason && <span> — {fb.reason}</span>}
                  {fb.corrected_consult_type && (
                    <span style={{ color: '#fde68a' }}> (correct: {fb.corrected_consult_type})</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!formOpen ? (
          <button
            onClick={() => setFormOpen(true)}
            style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: 12, cursor: 'pointer', padding: 0 }}
          >
            + Add feedback
          </button>
        ) : !sessionId ? (
          <div style={{ color: '#64748b', fontSize: 12 }}>Feedback available once the call finishes logging.</div>
        ) : confirming ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ color: '#fde68a' }}>
              Submit {verdict === 'up' ? '👍' : '👎'} feedback{verdict === 'down' && correctedType ? ` (corrected: ${correctedType})` : ''}?
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={submit}
                disabled={submitting}
                style={{ background: '#8B5CF6', color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}
              >
                {submitting ? 'Submitting…' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={submitting}
                style={{ background: 'rgba(255,255,255,0.08)', color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
            {submitError && <div style={{ color: '#fca5a5', fontSize: 12 }}>{submitError}</div>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setVerdict('up')}
                aria-label="Thumbs up"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  border: verdict === 'up' ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.15)',
                  background: verdict === 'up' ? 'rgba(34,197,94,0.15)' : 'transparent',
                  color: verdict === 'up' ? '#4ade80' : '#cbd5e1',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                <ThumbsUp size={14} /> Good call
              </button>
              <button
                onClick={() => setVerdict('down')}
                aria-label="Thumbs down"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  border: verdict === 'down' ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.15)',
                  background: verdict === 'down' ? 'rgba(239,68,68,0.15)' : 'transparent',
                  color: verdict === 'down' ? '#fca5a5' : '#cbd5e1',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                <ThumbsDown size={14} /> Wrong call
              </button>
            </div>

            {verdict && (
              <>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={verdict === 'down' ? 'Why was this wrong? (required for a corrected label to be useful)' : 'Anything worth noting? (optional)'}
                  rows={2}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 8,
                    color: 'white',
                    padding: '8px 10px',
                    fontSize: 12,
                    resize: 'vertical',
                  }}
                />

                {verdict === 'down' && (
                  <select
                    value={correctedType}
                    onChange={(e) => setCorrectedType(e.target.value)}
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 8,
                      color: 'white',
                      padding: '6px 10px',
                      fontSize: 12,
                    }}
                  >
                    <option value="">Correct answer (optional)…</option>
                    {CONSULT_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                )}

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label style={{ color: '#64748b', fontSize: 11 }}>Tester:</label>
                  <input
                    value={testerName}
                    onChange={(e) => setTesterName(e.target.value)}
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 6,
                      color: 'white',
                      padding: '4px 8px',
                      fontSize: 11,
                      width: 100,
                    }}
                  />
                  <button
                    onClick={() => setConfirming(true)}
                    style={{ marginLeft: 'auto', background: '#8B5CF6', color: 'white', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}
                  >
                    Submit
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
