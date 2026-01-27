'use client'

import { useState, useMemo } from 'react'

// Types for appointments
export interface Appointment {
  id: string
  appointmentTime: Date
  hospitalSite: string
  siteStatus: 'online' | 'offline'
  patient: {
    name: string
    mrn: string
    age: number
  }
  reasonForConsult: string
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed'
  type: 'new-consult' | 'follow-up' | '3-month-follow-up' | '6-month-follow-up' | '12-month-follow-up'
}

// Sample appointments data
const SAMPLE_APPOINTMENTS: Appointment[] = [
  {
    id: '1',
    appointmentTime: new Date('2025-10-07T09:00:00'),
    hospitalSite: 'New Media',
    siteStatus: 'online',
    patient: { name: 'Sarah Johnson', mrn: '123456789', age: 40 },
    reasonForConsult: 'Migraine',
    status: 'confirmed',
    type: '3-month-follow-up',
  },
  {
    id: '2',
    appointmentTime: new Date('2025-10-07T10:30:00'),
    hospitalSite: 'CHH',
    siteStatus: 'online',
    patient: { name: 'Michael Chen', mrn: '987654321', age: 47 },
    reasonForConsult: 'Weakness',
    status: 'confirmed',
    type: 'new-consult',
  },
  {
    id: '3',
    appointmentTime: new Date('2025-10-07T11:15:00'),
    hospitalSite: 'New Media',
    siteStatus: 'online',
    patient: { name: 'Emily Rodriguez', mrn: '456789123', age: 32 },
    reasonForConsult: 'Tremors',
    status: 'pending',
    type: 'follow-up',
  },
  {
    id: '4',
    appointmentTime: new Date('2025-10-07T14:00:00'),
    hospitalSite: 'CHH',
    siteStatus: 'online',
    patient: { name: 'David Thompson', mrn: '789123456', age: 60 },
    reasonForConsult: 'Migraine',
    status: 'confirmed',
    type: 'new-consult',
  },
  {
    id: '5',
    appointmentTime: new Date('2025-10-07T15:30:00'),
    hospitalSite: 'New Media',
    siteStatus: 'online',
    patient: { name: 'Lisa Park', mrn: '321654987', age: 45 },
    reasonForConsult: 'Weakness',
    status: 'confirmed',
    type: 'follow-up',
  },
]

// Get unique values for filter dropdowns
const HOSPITAL_SITES = ['All', 'New Media', 'CHH', 'Main Campus', 'Outpatient Center']
const STATUSES = ['All', 'Confirmed', 'Pending', 'Cancelled', 'Completed']
const APPOINTMENT_TYPES = ['All', 'New Consult', 'Follow-up', '3 Month Follow-up', '6 Month Follow-up', '12 Month Follow-up']
const REASONS_FOR_CONSULT = ['All', 'Migraine', 'Weakness', 'Tremors', 'Seizure', 'Memory', 'Numbness', 'Dizziness', 'Headache']

// Reason badge colors
const REASON_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Migraine': { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD' },
  'Weakness': { bg: '#D1FAE5', text: '#047857', border: '#6EE7B7' },
  'Tremors': { bg: '#FEF3C7', text: '#B45309', border: '#FCD34D' },
  'Seizure': { bg: '#FEE2E2', text: '#B91C1C', border: '#FCA5A5' },
  'Memory': { bg: '#E0E7FF', text: '#4338CA', border: '#A5B4FC' },
  'Numbness': { bg: '#FCE7F3', text: '#BE185D', border: '#F9A8D4' },
  'Dizziness': { bg: '#CCFBF1', text: '#0F766E', border: '#5EEAD4' },
  'Headache': { bg: '#F3E8FF', text: '#7C3AED', border: '#C4B5FD' },
}

// Format type for display
const formatType = (type: Appointment['type']): string => {
  switch (type) {
    case 'new-consult': return 'New Consult'
    case 'follow-up': return 'Follow-up'
    case '3-month-follow-up': return '3 Month Follow-up'
    case '6-month-follow-up': return '6 Month Follow-up'
    case '12-month-follow-up': return '12 Month Follow-up'
    default: return type
  }
}

interface PatientAppointmentsProps {
  onSelectPatient?: (appointment: Appointment) => void
}

export default function PatientAppointments({ onSelectPatient }: PatientAppointmentsProps) {
  const [selectedDate, setSelectedDate] = useState(new Date('2025-10-07'))
  const [hospitalFilter, setHospitalFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')
  const [reasonFilter, setReasonFilter] = useState('All')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  // Format date for display
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  // Format time for display
  const formatTime = (date: Date): string => {
    const dateStr = date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
    return `${dateStr} ${timeStr}`
  }

  // Navigate date
  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1))
    setSelectedDate(newDate)
  }

  // Filter and sort appointments
  const filteredAppointments = useMemo(() => {
    let result = [...SAMPLE_APPOINTMENTS]

    if (hospitalFilter !== 'All') {
      result = result.filter(a => a.hospitalSite === hospitalFilter)
    }
    if (statusFilter !== 'All') {
      result = result.filter(a => a.status.toLowerCase() === statusFilter.toLowerCase())
    }
    if (typeFilter !== 'All') {
      result = result.filter(a => formatType(a.type) === typeFilter)
    }
    if (reasonFilter !== 'All') {
      result = result.filter(a => a.reasonForConsult === reasonFilter)
    }

    // Sort by appointment time
    result.sort((a, b) => {
      const diff = a.appointmentTime.getTime() - b.appointmentTime.getTime()
      return sortOrder === 'asc' ? diff : -diff
    })

    return result
  }, [hospitalFilter, statusFilter, typeFilter, reasonFilter, sortOrder])

  return (
    <div style={{
      flex: 1,
      background: 'var(--bg-white)',
      padding: '24px',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h1 style={{
            fontSize: '20px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0,
          }}>
            Patient Appointments
          </h1>

          {/* Date Navigation */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--bg-gray)',
            borderRadius: '8px',
            padding: '4px',
          }}>
            <button
              onClick={() => navigateDate('prev')}
              style={{
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              background: 'var(--bg-white)',
              borderRadius: '6px',
              border: '1px solid var(--border)',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                {formatDate(selectedDate)}
              </span>
            </div>

            <button
              onClick={() => navigateDate('next')}
              style={{
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>

        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            background: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Schedule Appointment
        </button>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '20px',
        flexWrap: 'wrap',
      }}>
        {/* Hospital Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Hospital</span>
          <select
            value={hospitalFilter}
            onChange={(e) => setHospitalFilter(e.target.value)}
            style={{
              padding: '6px 28px 6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-white)',
              fontSize: '13px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 8px center',
            }}
          >
            {HOSPITAL_SITES.map(site => (
              <option key={site} value={site}>{site}</option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '6px 28px 6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-white)',
              fontSize: '13px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 8px center',
            }}
          >
            {STATUSES.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>

        {/* Appointment Type Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Appointment Type</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{
              padding: '6px 28px 6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-white)',
              fontSize: '13px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 8px center',
            }}
          >
            {APPOINTMENT_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {/* Reason for Consult Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Reason for Consult</span>
          <select
            value={reasonFilter}
            onChange={(e) => setReasonFilter(e.target.value)}
            style={{
              padding: '6px 28px 6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-white)',
              fontSize: '13px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 8px center',
            }}
          >
            {REASONS_FOR_CONSULT.map(reason => (
              <option key={reason} value={reason}>{reason}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Appointments Table */}
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        {/* Table Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '180px 120px 200px 140px 160px 160px 50px',
          gap: '16px',
          padding: '12px 16px',
          background: 'var(--bg-gray)',
          borderBottom: '1px solid var(--border)',
        }}>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
            }}
          >
            Appointment Time
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {sortOrder === 'asc' ? (
                <polyline points="18 15 12 9 6 15" />
              ) : (
                <polyline points="6 9 12 15 18 9" />
              )}
            </svg>
          </button>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Hospital site
          </span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Patient details
          </span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Reason for Consult
          </span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Status
          </span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Type
          </span>
          <span></span>
        </div>

        {/* Table Body */}
        {filteredAppointments.length === 0 ? (
          <div style={{
            padding: '48px 16px',
            textAlign: 'center',
            color: 'var(--text-muted)',
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 16px' }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <p style={{ fontSize: '14px', marginBottom: '4px' }}>No appointments found</p>
            <p style={{ fontSize: '12px' }}>Try adjusting your filters or select a different date</p>
          </div>
        ) : (
          filteredAppointments.map((appointment, index) => {
            const reasonColor = REASON_COLORS[appointment.reasonForConsult] || { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB' }

            return (
              <div
                key={appointment.id}
                onClick={() => onSelectPatient?.(appointment)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '180px 120px 200px 140px 160px 160px 50px',
                  gap: '16px',
                  padding: '16px',
                  borderBottom: index < filteredAppointments.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-gray)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                {/* Appointment Time */}
                <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                  {formatTime(appointment.appointmentTime)}
                </div>

                {/* Hospital Site */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: appointment.siteStatus === 'online' ? '#10B981' : '#EF4444',
                  }} />
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                    {appointment.hospitalSite}
                  </span>
                </div>

                {/* Patient Details */}
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {appointment.patient.name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    MRN: {appointment.patient.mrn}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Age: {appointment.patient.age}
                  </div>
                </div>

                {/* Reason for Consult */}
                <div>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    background: reasonColor.bg,
                    color: reasonColor.text,
                    border: `1px solid ${reasonColor.border}`,
                    borderRadius: '16px',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                    </svg>
                    {appointment.reasonForConsult}
                  </span>
                </div>

                {/* Status */}
                <div>
                  {appointment.status === 'confirmed' && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: '#059669',
                      fontSize: '13px',
                      fontWeight: 500,
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Confirmed
                    </span>
                  )}
                  {appointment.status === 'pending' && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: '#D97706',
                      fontSize: '13px',
                      fontWeight: 500,
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      Pending Confirmation
                    </span>
                  )}
                  {appointment.status === 'cancelled' && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: '#DC2626',
                      fontSize: '13px',
                      fontWeight: 500,
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                      Cancelled
                    </span>
                  )}
                  {appointment.status === 'completed' && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: '#6B7280',
                      fontSize: '13px',
                      fontWeight: 500,
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      Completed
                    </span>
                  )}
                </div>

                {/* Type */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  {formatType(appointment.type)}
                </div>

                {/* Actions Menu */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuOpenId(menuOpenId === appointment.id ? null : appointment.id)
                    }}
                    style={{
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: 'none',
                      background: menuOpenId === appointment.id ? 'var(--bg-gray)' : 'transparent',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                    </svg>
                  </button>

                  {menuOpenId === appointment.id && (
                    <>
                      <div
                        onClick={() => setMenuOpenId(null)}
                        style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                      />
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '4px',
                        width: '180px',
                        background: 'var(--bg-white)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                        zIndex: 999,
                        overflow: 'hidden',
                      }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectPatient?.(appointment)
                            setMenuOpenId(null)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            width: '100%',
                            padding: '10px 12px',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: 'var(--text-primary)',
                            textAlign: 'left',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-gray)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                            <path d="M14 2v6h6" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                          </svg>
                          Open Chart
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuOpenId(null)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            width: '100%',
                            padding: '10px 12px',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: 'var(--text-primary)',
                            textAlign: 'left',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-gray)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                          Reschedule
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuOpenId(null)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            width: '100%',
                            padding: '10px 12px',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: '#DC2626',
                            textAlign: 'left',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#FEE2E2'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                          </svg>
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Summary Footer */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '16px',
        padding: '12px 16px',
        background: 'var(--bg-gray)',
        borderRadius: '8px',
      }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Showing {filteredAppointments.length} of {SAMPLE_APPOINTMENTS.length} appointments
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            <span style={{ color: '#059669', fontWeight: 500 }}>
              {SAMPLE_APPOINTMENTS.filter(a => a.status === 'confirmed').length}
            </span> confirmed
          </span>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            <span style={{ color: '#D97706', fontWeight: 500 }}>
              {SAMPLE_APPOINTMENTS.filter(a => a.status === 'pending').length}
            </span> pending
          </span>
        </div>
      </div>
    </div>
  )
}
