'use client'

import { useState } from 'react'
import { getTenantClient } from '@/lib/tenant'
import { DEMO_SCENARIOS } from '@/lib/historianTypes'

type Tab = 'intake' | 'messages' | 'historian'

interface IntakeForm {
  patient_name: string
  date_of_birth: string
  email: string
  phone: string
  chief_complaint: string
  current_medications: string
  allergies: string
  medical_history: string
  family_history: string
  notes: string
}

const EMPTY_INTAKE: IntakeForm = {
  patient_name: '',
  date_of_birth: '',
  email: '',
  phone: '',
  chief_complaint: '',
  current_medications: '',
  allergies: '',
  medical_history: '',
  family_history: '',
  notes: '',
}

export default function PatientPortal() {
  const [tab, setTab] = useState<Tab>('intake')
  const [intake, setIntake] = useState<IntakeForm>(EMPTY_INTAKE)
  const [intakeSubmitted, setIntakeSubmitted] = useState(false)
  const [intakeLoading, setIntakeLoading] = useState(false)

  const [msgSubject, setMsgSubject] = useState('')
  const [msgBody, setMsgBody] = useState('')
  const [msgSent, setMsgSent] = useState(false)
  const [msgLoading, setMsgLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tenant = getTenantClient()

  const handleIntakeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIntakeLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/patient/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...intake, tenant_id: tenant }),
      })
      if (!res.ok) throw new Error('Failed to submit intake form')
      setIntakeSubmitted(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIntakeLoading(false)
    }
  }

  const handleMessageSend = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsgLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/patient/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_name: intake.patient_name || 'Demo Patient',
          subject: msgSubject,
          body: msgBody,
          tenant_id: tenant,
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
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid #1e293b',
        background: '#0f172a',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #8B5CF6, #A78BFA)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: '1.125rem' }}>Sevaro Patient Portal</span>
        </div>
        <a href="/" style={{ color: '#94a3b8', fontSize: '0.875rem', textDecoration: 'none' }}>
          Back to Home
        </a>
      </header>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #334155', padding: '0 24px' }}>
        {(['intake', 'messages', 'historian'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(null) }}
            style={{
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              borderBottom: tab === t ? '2px solid #8B5CF6' : '2px solid transparent',
              color: tab === t ? '#fff' : '#94a3b8',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            {t === 'intake' ? 'Intake Form' : t === 'messages' ? 'Messages' : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2" />
                </svg>
                AI Historian
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '32px 24px' }}>
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

        {/* ======= INTAKE TAB ======= */}
        {tab === 'intake' && (
          intakeSubmitted ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'rgba(34,197,94,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <h2 style={{ color: '#fff', margin: '0 0 8px' }}>Intake Form Submitted</h2>
              <p style={{ color: '#94a3b8' }}>Your provider will review this before your appointment.</p>
              <button
                onClick={() => { setIntakeSubmitted(false); setIntake(EMPTY_INTAKE) }}
                style={{
                  marginTop: '24px', padding: '10px 24px', borderRadius: '8px',
                  background: '#8B5CF6', color: '#fff', border: 'none',
                  fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem',
                }}
              >
                Submit Another
              </button>
            </div>
          ) : (
            <form onSubmit={handleIntakeSubmit}>
              <h2 style={{ color: '#fff', margin: '0 0 4px', fontSize: '1.25rem' }}>Patient Intake Form</h2>
              <p style={{ color: '#94a3b8', margin: '0 0 24px', fontSize: '0.875rem' }}>
                Please complete this form before your appointment.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={labelStyle}>Full Name *</label>
                  <input
                    required
                    style={inputStyle}
                    value={intake.patient_name}
                    onChange={e => setIntake({ ...intake, patient_name: e.target.value })}
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Date of Birth</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={intake.date_of_birth}
                    onChange={e => setIntake({ ...intake, date_of_birth: e.target.value })}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input
                    type="email"
                    style={inputStyle}
                    value={intake.email}
                    onChange={e => setIntake({ ...intake, email: e.target.value })}
                    placeholder="jane@example.com"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input
                    style={inputStyle}
                    value={intake.phone}
                    onChange={e => setIntake({ ...intake, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Chief Complaint / Reason for Visit *</label>
                <textarea
                  required
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  value={intake.chief_complaint}
                  onChange={e => setIntake({ ...intake, chief_complaint: e.target.value })}
                  placeholder="Describe your symptoms or reason for this visit..."
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Current Medications</label>
                <textarea
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  value={intake.current_medications}
                  onChange={e => setIntake({ ...intake, current_medications: e.target.value })}
                  placeholder="List current medications and dosages..."
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Allergies</label>
                <input
                  style={inputStyle}
                  value={intake.allergies}
                  onChange={e => setIntake({ ...intake, allergies: e.target.value })}
                  placeholder="NKDA, or list allergies..."
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Past Medical History</label>
                <textarea
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  value={intake.medical_history}
                  onChange={e => setIntake({ ...intake, medical_history: e.target.value })}
                  placeholder="Prior diagnoses, surgeries, hospitalizations..."
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Family History</label>
                <textarea
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  value={intake.family_history}
                  onChange={e => setIntake({ ...intake, family_history: e.target.value })}
                  placeholder="Relevant family medical history..."
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={labelStyle}>Additional Notes</label>
                <textarea
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  value={intake.notes}
                  onChange={e => setIntake({ ...intake, notes: e.target.value })}
                  placeholder="Anything else you want your provider to know..."
                />
              </div>

              <button
                type="submit"
                disabled={intakeLoading}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  background: intakeLoading ? '#64748b' : '#8B5CF6',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: intakeLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {intakeLoading ? 'Submitting...' : 'Submit Intake Form'}
              </button>
            </form>
          )
        )}

        {/* ======= MESSAGES TAB ======= */}
        {tab === 'messages' && (
          <div>
            <h2 style={{ color: '#fff', margin: '0 0 4px', fontSize: '1.25rem' }}>Send a Message</h2>
            <p style={{ color: '#94a3b8', margin: '0 0 24px', fontSize: '0.875rem' }}>
              Contact your provider&apos;s office.
            </p>

            {msgSent && (
              <div style={{
                background: 'rgba(34,197,94,0.15)',
                border: '1px solid rgba(34,197,94,0.3)',
                borderRadius: '8px',
                padding: '12px 16px',
                color: '#86efac',
                fontSize: '0.875rem',
                marginBottom: '24px',
              }}>
                Message sent successfully.
              </div>
            )}

            <form onSubmit={handleMessageSend}>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Your Name *</label>
                <input
                  required
                  style={inputStyle}
                  value={intake.patient_name}
                  onChange={e => setIntake({ ...intake, patient_name: e.target.value })}
                  placeholder="Jane Doe"
                />
              </div>
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
                  placeholder="Type your message here..."
                />
              </div>
              <button
                type="submit"
                disabled={msgLoading}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  background: msgLoading ? '#64748b' : '#8B5CF6',
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
          </div>
        )}

        {/* ======= AI HISTORIAN TAB ======= */}
        {tab === 'historian' && (
          <div>
            <h2 style={{ color: '#fff', margin: '0 0 4px', fontSize: '1.25rem' }}>AI Neurologic Historian</h2>
            <p style={{ color: '#94a3b8', margin: '0 0 24px', fontSize: '0.875rem' }}>
              Complete your intake interview by speaking with our AI historian. It will ask you about your symptoms, medical history, and more.
            </p>

            <div style={{ display: 'grid', gap: '12px', marginBottom: '24px' }}>
              {DEMO_SCENARIOS.map(scenario => (
                <a
                  key={scenario.id}
                  href={`/patient/historian?scenario=${scenario.id}`}
                  style={{
                    display: 'block',
                    textAlign: 'left',
                    padding: '16px 20px',
                    borderRadius: '12px',
                    border: '1px solid #334155',
                    background: '#1e293b',
                    textDecoration: 'none',
                    transition: 'border-color 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: scenario.session_type === 'new_patient' ? 'rgba(139,92,246,0.2)' : 'rgba(13,148,136,0.2)',
                      color: scenario.session_type === 'new_patient' ? '#a78bfa' : '#5eead4',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}>
                      {scenario.session_type === 'new_patient' ? 'New' : 'Follow-up'}
                    </span>
                  </div>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.95rem', marginBottom: '4px' }}>
                    {scenario.label}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.4 }}>
                    {scenario.description}
                  </div>
                </a>
              ))}
            </div>

            <div style={{
              padding: '16px 20px',
              borderRadius: '12px',
              background: 'rgba(13,148,136,0.1)',
              border: '1px solid rgba(13,148,136,0.2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span style={{ color: '#5eead4', fontWeight: 600, fontSize: '0.8rem' }}>How it works</span>
              </div>
              <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: 0, lineHeight: 1.5 }}>
                Select a scenario and speak with the AI historian using your microphone. It will ask you questions one at a time and generate a structured clinical summary for your neurologist.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
