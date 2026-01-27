'use client'

import { useState } from 'react'

interface ScheduleFollowupModalProps {
  isOpen: boolean
  onClose: () => void
  patient: {
    id: string
    firstName: string
    lastName: string
  }
  onSchedule: (appointment: {
    patientId: string
    appointmentDate: string
    appointmentTime: string
    appointmentType: string
    durationMinutes: number
    hospitalSite: string
    reasonForVisit?: string
    schedulingNotes?: string
  }) => Promise<void>
}

const FOLLOW_UP_TYPES: { value: string; label: string; defaultWeeks?: number; defaultDays?: number }[] = [
  { value: 'next-day', label: 'Next Day (Demo)', defaultDays: 1 },
  { value: 'follow-up', label: 'Follow-up', defaultWeeks: 4 },
  { value: '3-month-follow-up', label: '3 Month Follow-up', defaultWeeks: 12 },
  { value: '6-month-follow-up', label: '6 Month Follow-up', defaultWeeks: 26 },
  { value: '12-month-follow-up', label: '12 Month Follow-up', defaultWeeks: 52 },
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

export default function ScheduleFollowupModal({
  isOpen,
  onClose,
  patient,
  onSchedule,
}: ScheduleFollowupModalProps) {
  const [followUpType, setFollowUpType] = useState('next-day')
  const [appointmentDate, setAppointmentDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() + 1) // Default to tomorrow for demo
    return date.toISOString().split('T')[0]
  })
  const [appointmentTime, setAppointmentTime] = useState('09:00')
  const [duration, setDuration] = useState(30)
  const [hospitalSite, setHospitalSite] = useState('Main Campus')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Update date when follow-up type changes
  const handleTypeChange = (type: string) => {
    setFollowUpType(type)
    const selectedType = FOLLOW_UP_TYPES.find(t => t.value === type)
    if (selectedType) {
      const date = new Date()
      if (selectedType.defaultDays !== undefined) {
        date.setDate(date.getDate() + selectedType.defaultDays)
      } else {
        date.setDate(date.getDate() + ((selectedType.defaultWeeks || 0) * 7))
      }
      setAppointmentDate(date.toISOString().split('T')[0])
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onSchedule({
        patientId: patient.id,
        appointmentDate,
        appointmentTime,
        appointmentType: followUpType,
        durationMinutes: duration,
        hospitalSite,
        schedulingNotes: notes || undefined,
      })
      onClose()
    } catch (error) {
      console.error('Error scheduling follow-up:', error)
      alert('Failed to schedule follow-up. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

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
        width: '520px',
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
              Schedule Follow-up
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              {patient.firstName} {patient.lastName}
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

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Follow-up Type */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>
              Follow-up Type
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {FOLLOW_UP_TYPES.map(type => (
                <button
                  key={type.value}
                  onClick={() => handleTypeChange(type.value)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '20px',
                    border: `1px solid ${
                      followUpType === type.value
                        ? (type.value === 'next-day' ? '#F59E0B' : 'var(--primary)')
                        : (type.value === 'next-day' ? '#FCD34D' : 'var(--border)')
                    }`,
                    background: followUpType === type.value
                      ? (type.value === 'next-day' ? '#F59E0B' : 'var(--primary)')
                      : (type.value === 'next-day' ? '#FFFBEB' : 'var(--bg-white)'),
                    color: followUpType === type.value
                      ? 'white'
                      : (type.value === 'next-day' ? '#B45309' : 'var(--text-primary)'),
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                    transition: 'all 0.2s',
                  }}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date and Time Row */}
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>
                Date
              </label>
              <input
                type="date"
                value={appointmentDate}
                onChange={(e) => setAppointmentDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  fontSize: '14px',
                  background: 'var(--bg-white)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>
                Time
              </label>
              <select
                value={appointmentTime}
                onChange={(e) => setAppointmentTime(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  fontSize: '14px',
                  background: 'var(--bg-white)',
                  color: 'var(--text-primary)',
                }}
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

          {/* Duration and Location Row */}
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>
                Duration
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  fontSize: '14px',
                  background: 'var(--bg-white)',
                  color: 'var(--text-primary)',
                }}
              >
                {DURATIONS.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>
                Location
              </label>
              <select
                value={hospitalSite}
                onChange={(e) => setHospitalSite(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  fontSize: '14px',
                  background: 'var(--bg-white)',
                  color: 'var(--text-primary)',
                }}
              >
                {HOSPITAL_SITES.map(site => (
                  <option key={site} value={site}>{site}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>
              Scheduling Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special instructions for the follow-up visit..."
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '14px',
                resize: 'vertical',
                fontFamily: 'inherit',
                background: 'var(--bg-white)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Summary */}
          <div style={{
            padding: '16px',
            background: 'var(--bg-gray)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 500, fontSize: '14px' }}>
                {new Date(appointmentDate + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {appointmentTime.split(':')[0] === '12' ? '12:' + appointmentTime.split(':')[1] + ' PM' :
                 parseInt(appointmentTime.split(':')[0]) > 12
                   ? (parseInt(appointmentTime.split(':')[0]) - 12) + ':' + appointmentTime.split(':')[1] + ' PM'
                   : appointmentTime + ' AM'} - {duration} minutes at {hospitalSite}
              </div>
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
                Scheduling...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
                Schedule Follow-up
              </>
            )}
          </button>
        </div>
      </div>
    </>
  )
}
