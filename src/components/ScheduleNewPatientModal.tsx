'use client'

import { useState } from 'react'

interface ScheduleNewPatientModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const GENDERS = [
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
  { value: 'O', label: 'Other' },
]

const APPOINTMENT_TYPES = [
  { value: 'new-consult', label: 'New Consult' },
  { value: 'follow-up', label: 'Follow-up' },
  { value: '3-month-follow-up', label: '3 Month Follow-up' },
  { value: '6-month-follow-up', label: '6 Month Follow-up' },
  { value: '12-month-follow-up', label: '12 Month Follow-up' },
]

const DURATIONS = [
  { value: 15, label: '15 min' },
  { value: 20, label: '20 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '60 min' },
]

const HOSPITAL_SITES = [
  'Main Campus',
  'New Media',
  'CHH',
  'Outpatient Center',
]

const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
]

const REASON_OPTIONS = [
  'Headache / Migraine',
  'Seizure / Epilepsy',
  'Memory / Cognitive',
  'Movement / Tremor',
  'Parkinson\'s Disease',
  'Multiple Sclerosis',
  'Stroke / Cerebrovascular',
  'Neuropathy / Weakness',
  'Sleep Disorders',
  'General Neurology',
]

export default function ScheduleNewPatientModal({
  isOpen,
  onClose,
  onSuccess,
}: ScheduleNewPatientModalProps) {
  // Patient fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [gender, setGender] = useState('M')
  const [phone, setPhone] = useState('')
  const [referringPhysician, setReferringPhysician] = useState('')

  // Appointment fields
  const [appointmentDate, setAppointmentDate] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })
  const [appointmentTime, setAppointmentTime] = useState('09:00')
  const [appointmentType, setAppointmentType] = useState('new-consult')
  const [duration, setDuration] = useState(30)
  const [hospitalSite, setHospitalSite] = useState('Main Campus')
  const [reasonForVisit, setReasonForVisit] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async () => {
    // Validate required patient fields
    if (!firstName.trim() || !lastName.trim() || !dateOfBirth) {
      setErrorMessage('Please fill in patient first name, last name, and date of birth.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      // Step 1: Create patient
      const patientResponse = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          dateOfBirth,
          gender,
          phone: phone.trim() || undefined,
          referringPhysician: referringPhysician.trim() || undefined,
        }),
      })

      if (!patientResponse.ok) {
        const err = await patientResponse.json()
        throw new Error(err.error || 'Failed to create patient')
      }

      const { patient } = await patientResponse.json()

      // Step 2: Create appointment for the new patient
      const appointmentResponse = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: patient.id,
          appointmentDate,
          appointmentTime,
          appointmentType,
          durationMinutes: duration,
          hospitalSite,
          reasonForVisit: reasonForVisit || undefined,
        }),
      })

      if (!appointmentResponse.ok) {
        const err = await appointmentResponse.json()
        throw new Error(err.error || 'Failed to create appointment')
      }

      // Reset form
      setFirstName('')
      setLastName('')
      setDateOfBirth('')
      setGender('M')
      setPhone('')
      setReferringPhysician('')
      setReasonForVisit('')

      onSuccess()
      onClose()
    } catch (error) {
      console.error('Error scheduling new patient:', error)
      setErrorMessage(error instanceof Error ? error.message : 'An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    fontSize: '14px',
    background: 'var(--bg-white)',
    color: 'var(--text-primary)',
  }

  const labelStyle = {
    display: 'block' as const,
    fontSize: '13px',
    fontWeight: 500,
    marginBottom: '6px',
    color: 'var(--text-primary)',
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 1000,
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'var(--bg-white)',
        borderRadius: '16px',
        padding: '24px',
        width: '600px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        overflow: 'auto',
        zIndex: 1001,
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
        }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
              Schedule New Patient
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Create a patient record and schedule their appointment
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '8px',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div style={{
            padding: '12px 16px',
            background: '#FEE2E2',
            border: '1px solid #FCA5A5',
            borderRadius: '8px',
            color: '#B91C1C',
            fontSize: '13px',
            marginBottom: '20px',
          }}>
            {errorMessage}
          </div>
        )}

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Section: Patient Information */}
          <div style={{
            padding: '16px',
            background: 'var(--bg-gray)',
            borderRadius: '12px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Patient Information
              </span>
            </div>

            {/* Name Row */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>
                  First Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. John"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>
                  Last Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="e.g. Smith"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* DOB and Gender Row */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>
                  Date of Birth <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Gender</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {GENDERS.map(g => (
                    <button
                      key={g.value}
                      onClick={() => setGender(g.value)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: '8px',
                        border: `1px solid ${gender === g.value ? 'var(--primary)' : 'var(--border)'}`,
                        background: gender === g.value ? 'var(--primary)' : 'var(--bg-white)',
                        color: gender === g.value ? 'white' : 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 500,
                        transition: 'all 0.2s',
                      }}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Phone and Referring Physician Row */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Phone (optional)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Referring Physician (optional)</label>
                <input
                  type="text"
                  value={referringPhysician}
                  onChange={(e) => setReferringPhysician(e.target.value)}
                  placeholder="Dr. Smith"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Section: Appointment Details */}
          <div style={{
            padding: '16px',
            background: 'var(--bg-gray)',
            borderRadius: '12px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Appointment Details
              </span>
            </div>

            {/* Date and Time Row */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Date</label>
                <input
                  type="date"
                  value={appointmentDate}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Time</label>
                <select
                  value={appointmentTime}
                  onChange={(e) => setAppointmentTime(e.target.value)}
                  style={inputStyle}
                >
                  {TIME_SLOTS.map(time => (
                    <option key={time} value={time}>
                      {time.split(':')[0] === '12' ? '12:' + time.split(':')[1] + ' PM' :
                       parseInt(time.split(':')[0]) > 12
                         ? (parseInt(time.split(':')[0]) - 12) + ':' + time.split(':')[1] + ' PM'
                         : time + ' AM'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Type and Duration Row */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Appointment Type</label>
                <select
                  value={appointmentType}
                  onChange={(e) => setAppointmentType(e.target.value)}
                  style={inputStyle}
                >
                  {APPOINTMENT_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Duration</label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value))}
                  style={inputStyle}
                >
                  {DURATIONS.map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Location Row */}
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Location</label>
              <select
                value={hospitalSite}
                onChange={(e) => setHospitalSite(e.target.value)}
                style={inputStyle}
              >
                {HOSPITAL_SITES.map(site => (
                  <option key={site} value={site}>{site}</option>
                ))}
              </select>
            </div>

            {/* Reason for Visit */}
            <div>
              <label style={labelStyle}>Reason for Visit</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {REASON_OPTIONS.map(reason => (
                  <button
                    key={reason}
                    onClick={() => setReasonForVisit(reason)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '16px',
                      border: `1px solid ${reasonForVisit === reason ? 'var(--primary)' : 'var(--border)'}`,
                      background: reasonForVisit === reason ? 'var(--primary)' : 'var(--bg-white)',
                      color: reasonForVisit === reason ? 'white' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                      transition: 'all 0.2s',
                    }}
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={reasonForVisit}
                onChange={(e) => setReasonForVisit(e.target.value)}
                placeholder="Or type a custom reason..."
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end',
          marginTop: '24px',
          paddingTop: '16px',
          borderTop: '1px solid var(--border)',
        }}>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--bg-white)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--text-primary)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--primary)',
              color: 'white',
              cursor: isSubmitting ? 'wait' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {isSubmitting ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="32"/>
                </svg>
                Creating...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
                Create Patient & Schedule
              </>
            )}
          </button>
        </div>
      </div>
    </>
  )
}
