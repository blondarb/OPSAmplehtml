'use client'

import { useState } from 'react'
import type { NeurologyConsult } from '@/lib/consult/types'
import EmbeddedHistorian from './EmbeddedHistorian'

interface HistorianStepPanelProps {
  consultId: string
  consult: NeurologyConsult | null
  onComplete: () => void
  onError: (msg: string) => void
}

export default function HistorianStepPanel({ consultId, consult, onComplete, onError }: HistorianStepPanelProps) {
  const [skipping, setSkipping] = useState(false)
  const [interviewStarted, setInterviewStarted] = useState(false)
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [inviteConflict, setInviteConflict] = useState(false)
  const [invitation, setInvitation] = useState<{
    url: string
    expiresAt: string
    patientName: string
  } | null>(null)

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

  async function handleCreateInvitation(replaceActive = false) {
    setCreatingInvite(true)
    setInviteCopied(false)
    try {
      const response = await fetch('/api/ai/historian/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultId, replaceActive }),
      })
      const data = await response.json().catch(() => ({}))
      if (response.status === 409) {
        setInviteConflict(true)
        return
      }
      if (!response.ok || !data?.invitation?.url) {
        throw new Error(data?.error || 'Failed to create patient link')
      }
      setInvitation({
        url: data.invitation.url,
        expiresAt: data.invitation.expiresAt,
        patientName: data.invitation.patientName || 'Patient',
      })
      setInviteConflict(false)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to create patient link')
    } finally {
      setCreatingInvite(false)
    }
  }

  async function handleCopyInvitation() {
    if (!invitation) return
    try {
      await navigator.clipboard.writeText(invitation.url)
      setInviteCopied(true)
    } catch {
      onError('Copy failed. Select the link text and copy it manually.')
    }
  }

  return (
    <div
      className="historian-step-panel"
      style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 12, padding: 24 }}
    >
      <h3 style={{ color: '#E2E8F0', fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
        Step 2: AI Historian Interview
      </h3>
      <p style={{
        color: '#94A3B8',
        fontSize: 13,
        margin: '0 0 16px',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
      }}>
        Send the patient a one-time link for a Nova voice interview. Comprehensive mode asks why they
        were referred first, age second, then covers the full neurologic history before producing a
        physician-only differential.
      </p>
      <style jsx>{`
        @media (max-width: 640px) {
          .historian-step-panel {
            padding: 16px !important;
          }
        }
      `}</style>

      {interviewStarted ? (
        <EmbeddedHistorian
          consultId={consultId}
          referralReason={consult?.triage_chief_complaint || ''}
          patientName={consult?.referral_text?.match(/(?:patient|name)[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/i)?.[1] || 'Patient'}
          onComplete={onComplete}
          onError={onError}
        />
      ) : (
        <>
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

          <div
            style={{
              background: 'linear-gradient(135deg, rgba(13,148,136,0.16), rgba(139,92,246,0.12))',
              border: '1px solid rgba(45,212,191,0.35)',
              borderRadius: 10,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div style={{ color: '#CCFBF1', fontSize: 14, fontWeight: 700, marginBottom: 5 }}>
              Comprehensive Nova interview
            </div>
            <p style={{ color: '#99F6E4', fontSize: 12, lineHeight: 1.55, margin: '0 0 12px' }}>
              The link expires in 48 hours and can be redeemed once. Diagnostic scoring is generated
              only after the interview and is shown only in the physician report.
            </p>

            {!invitation ? (
              <div style={{ display: 'grid', gap: 10, justifyItems: 'start' }}>
                <button
                  onClick={() => handleCreateInvitation(false)}
                  disabled={creatingInvite}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 8,
                    border: 'none',
                    background: creatingInvite ? '#475569' : '#0D9488',
                    color: '#FFFFFF',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: creatingInvite ? 'wait' : 'pointer',
                  }}
                >
                  {creatingInvite ? 'Creating secure link…' : 'Create One-Time Patient Link'}
                </button>
                {inviteConflict && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <span style={{ color: '#FDE68A', fontSize: 12, lineHeight: 1.5 }}>
                      A prior link is active. Replace it only if the patient abandoned that interview;
                      replacement immediately revokes the old browser grant.
                    </span>
                    <button
                      onClick={() => handleCreateInvitation(true)}
                      disabled={creatingInvite}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 7,
                        border: '1px solid #F59E0B',
                        background: 'transparent',
                        color: '#FDE68A',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: creatingInvite ? 'wait' : 'pointer',
                      }}
                    >
                      Revoke Old Link and Create New
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                <label style={{ color: '#CBD5E1', fontSize: 12, fontWeight: 600 }}>
                  Secure link for {invitation.patientName}
                </label>
                <input
                  readOnly
                  value={invitation.url}
                  onFocus={(event) => event.currentTarget.select()}
                  aria-label="One-time comprehensive historian link"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 12px',
                    borderRadius: 7,
                    border: '1px solid #475569',
                    background: '#0F172A',
                    color: '#E2E8F0',
                    fontSize: 12,
                  }}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={handleCopyInvitation}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 7,
                      border: 'none',
                      background: '#0D9488',
                      color: '#FFFFFF',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {inviteCopied ? 'Copied' : 'Copy Link'}
                  </button>
                </div>
                <span style={{ color: '#94A3B8', fontSize: 11 }}>
                  Expires {new Date(invitation.expiresAt).toLocaleString()}. Do not open this live
                  link yourself—opening it redeems the patient&apos;s one-time invitation.
                </span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => setInterviewStarted(true)}
              style={{
                padding: '10px 24px',
                borderRadius: 8,
                background: '#8B5CF6',
                color: '#FFFFFF',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
              }}
            >
              Run Focused Interview Here
            </button>
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
          </div>
        </>
      )}
    </div>
  )
}
