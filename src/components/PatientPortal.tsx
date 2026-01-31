'use client'

import { useState, useEffect, useCallback } from 'react'
import { getTenantClient } from '@/lib/tenant'
import { DEMO_SCENARIOS, type PortalPatient } from '@/lib/historianTypes'

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

  // Historian tab state
  const [portalPatients, setPortalPatients] = useState<PortalPatient[]>([])
  const [patientsLoading, setPatientsLoading] = useState(false)
  const [showAddPatient, setShowAddPatient] = useState(false)
  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')
  const [newReferral, setNewReferral] = useState('')
  const [addingPatient, setAddingPatient] = useState(false)
  const [showDemoScenarios, setShowDemoScenarios] = useState(false)

  const tenant = getTenantClient()

  const fetchPatients = useCallback(async () => {
    setPatientsLoading(true)
    try {
      const res = await fetch(`/api/patient/patients?tenant_id=${tenant}`)
      if (res.ok) {
        const data = await res.json()
        setPortalPatients(data.patients || [])
      }
    } catch {
      // Silently fail - patients list is optional
    } finally {
      setPatientsLoading(false)
    }
  }, [tenant])

  // Load patients when historian tab is selected
  useEffect(() => {
    if (tab === 'historian') {
      fetchPatients()
    }
  }, [tab, fetchPatients])

  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddingPatient(true)
    setError(null)
    try {
      const res = await fetch('/api/patient/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: newFirstName,
          last_name: newLastName,
          referral_reason: newReferral || null,
          tenant_id: tenant,
        }),
      })
      if (!res.ok) throw new Error('Failed to register patient')
      setNewFirstName('')
      setNewLastName('')
      setNewReferral('')
      setShowAddPatient(false)
      fetchPatients()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAddingPatient(false)
    }
  }

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
              Select your name to begin your intake interview, or add yourself as a new patient.
            </p>

            {/* Patient list */}
            {patientsLoading ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: '0.875rem' }}>
                Loading patients...
              </div>
            ) : portalPatients.length > 0 ? (
              <div style={{ display: 'grid', gap: '10px', marginBottom: '16px' }}>
                {portalPatients.map(pt => (
                  <a
                    key={pt.id}
                    href={`/patient/historian?patient_id=${pt.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '14px 16px',
                      borderRadius: '12px',
                      border: '1px solid #334155',
                      background: '#1e293b',
                      textDecoration: 'none',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #0d9488, #14b8a6)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 700, fontSize: '1rem',
                      flexShrink: 0,
                    }}>
                      {pt.first_name.charAt(0)}{pt.last_name.charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.95rem' }}>
                        {pt.first_name} {pt.last_name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {pt.referral_reason && (
                          <span style={{ color: '#94a3b8', fontSize: '0.75rem', lineHeight: 1.3 }}>
                            {pt.referral_reason}
                          </span>
                        )}
                        {pt.mrn && (
                          <span style={{ color: '#64748b', fontSize: '0.7rem' }}>MRN: {pt.mrn}</span>
                        )}
                      </div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </a>
                ))}
              </div>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '24px',
                borderRadius: '12px',
                border: '1px dashed #334155',
                marginBottom: '16px',
                color: '#94a3b8',
                fontSize: '0.875rem',
              }}>
                No patients found. Add yourself below to get started.
              </div>
            )}

            {/* Add New Patient */}
            {showAddPatient ? (
              <form onSubmit={handleAddPatient} style={{
                padding: '16px 20px',
                borderRadius: '12px',
                border: '1px solid #334155',
                background: '#1e293b',
                marginBottom: '16px',
              }}>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem', marginBottom: '12px' }}>
                  Add New Patient
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={labelStyle}>First Name *</label>
                    <input
                      required
                      style={inputStyle}
                      value={newFirstName}
                      onChange={e => setNewFirstName(e.target.value)}
                      placeholder="Jane"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Last Name *</label>
                    <input
                      required
                      style={inputStyle}
                      value={newLastName}
                      onChange={e => setNewLastName(e.target.value)}
                      placeholder="Doe"
                    />
                  </div>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Referral Reason</label>
                  <input
                    style={inputStyle}
                    value={newReferral}
                    onChange={e => setNewReferral(e.target.value)}
                    placeholder="e.g., Chronic headaches, referred by PCP"
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="submit"
                    disabled={addingPatient}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      background: addingPatient ? '#64748b' : '#0d9488',
                      color: '#fff',
                      border: 'none',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      cursor: addingPatient ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {addingPatient ? 'Adding...' : 'Add Patient'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddPatient(false)}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      background: 'transparent',
                      color: '#94a3b8',
                      border: '1px solid #334155',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowAddPatient(true)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'transparent',
                  color: '#0d9488',
                  border: '1px dashed #0d9488',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  marginBottom: '16px',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add New Patient
              </button>
            )}

            {/* Demo Scenarios (collapsible) */}
            <div style={{ marginTop: '8px' }}>
              <button
                onClick={() => setShowDemoScenarios(!showDemoScenarios)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '8px 0',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: showDemoScenarios ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                Or try a demo scenario
              </button>

              {showDemoScenarios && (
                <div style={{ display: 'grid', gap: '10px', marginTop: '8px' }}>
                  {DEMO_SCENARIOS.map(scenario => (
                    <a
                      key={scenario.id}
                      href={`/patient/historian?scenario=${scenario.id}`}
                      style={{
                        display: 'block',
                        textAlign: 'left',
                        padding: '14px 16px',
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
                      <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>
                        {scenario.label}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.4 }}>
                        {scenario.description}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* How it works info */}
            <div style={{
              padding: '16px 20px',
              borderRadius: '12px',
              background: 'rgba(13,148,136,0.1)',
              border: '1px solid rgba(13,148,136,0.2)',
              marginTop: '16px',
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
                Select your name above to start a voice interview with the AI historian. It will ask you questions one at a time about your symptoms, medical history, and more, then generate a structured clinical summary for your neurologist.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
