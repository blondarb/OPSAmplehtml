'use client'

import { useState, useCallback } from 'react'
import { getTenantClient } from '@/lib/tenant'
import MessageConversationalChat from './MessageConversationalChat'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { MessageSquare } from 'lucide-react'

export default function PatientMessages() {
  const [messageMode, setMessageMode] = useState<'form' | 'conversation'>('form')
  const [msgSubject, setMsgSubject] = useState('')
  const [msgBody, setMsgBody] = useState('')
  const [msgSent, setMsgSent] = useState(false)
  const [msgLoading, setMsgLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [patientName, setPatientName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [matchedPatientId, setMatchedPatientId] = useState<string | null>(null)
  const [matchedPatientName, setMatchedPatientName] = useState<string | null>(null)

  const tenant = getTenantClient()

  const lookupPatient = useCallback(async (name: string, dob: string) => {
    if (!name || name.trim().length < 3) {
      setMatchedPatientId(null)
      setMatchedPatientName(null)
      return
    }
    try {
      const params = new URLSearchParams({ name, tenant_id: tenant })
      if (dob) params.set('dob', dob)
      const res = await fetch(`/api/patient/lookup?${params}`)
      if (res.ok) {
        const data = await res.json()
        setMatchedPatientId(data.patient_id || null)
        setMatchedPatientName(data.patient_name || null)
      }
    } catch {
      // Silently fail - lookup is optional
    }
  }, [tenant])

  const handleMessageSend = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsgLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/patient/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_name: patientName || 'Demo Patient',
          subject: msgSubject,
          body: msgBody,
          tenant_id: tenant,
          patient_id: matchedPatientId,
        }),
      })
      if (!res.ok) throw new Error('Failed to send message')
      setMsgSent(true)
      setMsgSubject('')
      setMsgBody('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setMsgLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: '#94a3b8',
    fontSize: '0.75rem',
    fontWeight: 600,
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }

  return (
    <PlatformShell>
    <FeatureSubHeader
      title="Patient Messaging"
      icon={MessageSquare}
      accentColor="#0D9488"
      nextStep={{ label: 'Post-Visit Follow-Up', route: '/follow-up' }}
    />
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    }}>
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Demo instructions */}
        <div style={{
          background: 'rgba(13,148,136,0.08)',
          border: '1px solid rgba(13,148,136,0.2)',
          borderRadius: '10px',
          padding: '14px 16px',
          marginBottom: '20px',
        }}>
          <div style={{ fontWeight: 600, fontSize: '12px', color: '#5eead4', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            💡 How to demo this
          </div>
          <p style={{ color: '#94a3b8', fontSize: '12px', margin: '0 0 8px', lineHeight: 1.6 }}>
            This shows how a patient can send a message to their provider — manually or with AI help:
          </p>
          <div style={{ color: '#94a3b8', fontSize: '12px', lineHeight: 1.8 }}>
            <div><strong style={{ color: '#cbd5e1' }}>📝 Write Message</strong> — Traditional form where the patient types the subject and body.</div>
            <div><strong style={{ color: '#cbd5e1' }}>💬 Chat with AI</strong> — The AI asks what you need, then composes a clear, professional message for you to review and send.</div>
          </div>
          <p style={{ color: '#64748b', fontSize: '11px', margin: '8px 0 0', lineHeight: 1.5, fontStyle: 'italic' }}>
            Try &quot;Chat with AI&quot; — say you need a medication refill or have a question about a test result.
          </p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '8px',
            padding: '12px 16px',
            color: '#fca5a5',
            fontSize: '0.875rem',
            marginBottom: '24px',
          }}>
            {error}
          </div>
        )}

        {/* Mode toggle */}
        <div
          role="radiogroup"
          aria-label="Choose messaging method"
          style={{
            display: 'flex',
            gap: '4px',
            marginBottom: '24px',
            padding: '4px',
            background: '#1e293b',
            borderRadius: '10px',
            border: '1px solid #334155',
          }}
        >
          {([
            { mode: 'form' as const, label: '📝 Write Message' },
            { mode: 'conversation' as const, label: '💬 Chat with AI' },
          ]).map(({ mode, label }) => (
            <button
              key={mode}
              role="radio"
              aria-checked={messageMode === mode}
              tabIndex={messageMode === mode ? 0 : -1}
              onClick={() => setMessageMode(mode)}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '6px',
                background: messageMode === mode ? '#0D9488' : 'transparent',
                color: messageMode === mode ? 'white' : '#94a3b8',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                transition: 'all 0.2s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {messageMode === 'conversation' ? (
          <MessageConversationalChat
            onComplete={(data) => {
              setPatientName(data.patient_name || '')
              setDateOfBirth(data.date_of_birth || '')
              setMsgSubject(data.subject || '')
              setMsgBody(data.body || '')
              lookupPatient(data.patient_name || '', data.date_of_birth || '')
              setMessageMode('form')
            }}
            onCancel={() => setMessageMode('form')}
          />
        ) : msgSent ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(34,197,94,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 style={{ color: '#fff', margin: '0 0 8px' }}>Message Sent</h2>
            <p style={{ color: '#94a3b8' }}>Your provider&apos;s office will respond soon.</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '24px' }}>
              <a
                href="/"
                style={{
                  padding: '10px 24px', borderRadius: '8px',
                  background: '#0D9488', color: '#fff', border: 'none',
                  fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem',
                  textDecoration: 'none', display: 'inline-block',
                }}
              >
                ← Back to Home
              </a>
              <button
                onClick={() => { setMsgSent(false); setMsgSubject(''); setMsgBody('') }}
                style={{
                  padding: '10px 24px', borderRadius: '8px',
                  background: 'transparent', color: '#94a3b8', border: '1px solid #334155',
                  fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem',
                }}
              >
                Send Another Message
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleMessageSend}>
            <h2 style={{ color: '#fff', margin: '0 0 4px', fontSize: '1.25rem' }}>Send a Message</h2>
            <p style={{ color: '#94a3b8', margin: '0 0 24px', fontSize: '0.875rem' }}>
              Contact your provider&apos;s office.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Your Name *</label>
                <input
                  required
                  style={inputStyle}
                  value={patientName}
                  onChange={e => setPatientName(e.target.value)}
                  onBlur={() => lookupPatient(patientName, dateOfBirth)}
                  placeholder="Jane Doe"
                />
              </div>
              <div>
                <label style={labelStyle}>Date of Birth</label>
                <input
                  type="date"
                  style={inputStyle}
                  value={dateOfBirth}
                  onChange={e => {
                    setDateOfBirth(e.target.value)
                    lookupPatient(patientName, e.target.value)
                  }}
                />
              </div>
            </div>

            {matchedPatientId && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 12px', marginBottom: '16px',
                background: 'rgba(34,197,94,0.1)',
                border: '1px solid rgba(34,197,94,0.3)',
                borderRadius: '8px',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span style={{ fontSize: '0.8rem', color: '#22c55e', fontWeight: 500 }}>
                  Matched to patient record: {matchedPatientName || patientName}
                </span>
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Subject *</label>
              <input
                required
                style={inputStyle}
                value={msgSubject}
                onChange={e => setMsgSubject(e.target.value)}
                placeholder="Medication refill request"
              />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={labelStyle}>Message *</label>
              <textarea
                required
                rows={5}
                style={{ ...inputStyle, resize: 'vertical' }}
                value={msgBody}
                onChange={e => setMsgBody(e.target.value)}
                placeholder="What would you like to tell your doctor?"
              />
            </div>
            <button
              type="submit"
              disabled={msgLoading}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                background: msgLoading ? '#64748b' : '#0D9488',
                color: '#fff',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: msgLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {msgLoading ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        )}
      </div>
    </div>
    </PlatformShell>
  )
}
