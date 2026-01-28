'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'

// Types for appointments from API
export interface AppointmentPatient {
  id: string
  mrn: string
  firstName: string
  lastName: string
  name: string
  dateOfBirth: string
  age: number | null
  gender: string
  phone: string
  email: string
  referringPhysician: string | null
  referralReason: string | null
}

export interface Appointment {
  id: string
  appointmentDate: string
  appointmentTime: string
  durationMinutes: number
  appointmentType: string
  status: string
  hospitalSite: string
  reasonForVisit: string | null
  schedulingNotes: string | null
  visitId: string | null
  priorVisitId: string | null
  patient: AppointmentPatient | null
  priorVisit: {
    id: string
    visitDate: string
    visitType: string
    aiSummary: string | null
  } | null
}

// Filter options
const HOSPITAL_SITES = ['All', 'Main Campus', 'New Media', 'CHH', 'Outpatient Center']
const STATUSES = ['All', 'Scheduled', 'Confirmed', 'In-Progress', 'Completed', 'Cancelled']
const APPOINTMENT_TYPES = ['All', 'new-consult', 'next-day', 'follow-up', '3-month-follow-up', '6-month-follow-up', '12-month-follow-up']

// Reason badge colors
const REASON_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'headache': { bg: '#F3E8FF', text: '#7C3AED', border: '#C4B5FD' },
  'migraine': { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD' },
  'weakness': { bg: '#D1FAE5', text: '#047857', border: '#6EE7B7' },
  'tremor': { bg: '#FEF3C7', text: '#B45309', border: '#FCD34D' },
  'seizure': { bg: '#FEE2E2', text: '#B91C1C', border: '#FCA5A5' },
  'memory': { bg: '#E0E7FF', text: '#4338CA', border: '#A5B4FC' },
  'parkinson': { bg: '#FEF3C7', text: '#B45309', border: '#FCD34D' },
  'default': { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB' },
}

// Format type for display
const formatType = (type: string): string => {
  switch (type) {
    case 'new-consult': return 'New Consult'
    case 'next-day': return 'Next Day'
    case 'follow-up': return 'Follow-up'
    case '3-month-follow-up': return '3 Month Follow-up'
    case '6-month-follow-up': return '6 Month Follow-up'
    case '12-month-follow-up': return '12 Month Follow-up'
    default: return type
  }
}

// Get color for reason
const getReasonColor = (reason: string | null) => {
  if (!reason) return REASON_COLORS.default
  const lowerReason = reason.toLowerCase()
  for (const [key, color] of Object.entries(REASON_COLORS)) {
    if (lowerReason.includes(key)) return color
  }
  return REASON_COLORS.default
}

// Extract short reason from full reason text
const getShortReason = (reason: string | null): string => {
  if (!reason) return 'General'
  const lowerReason = reason.toLowerCase()
  if (lowerReason.includes('headache') || lowerReason.includes('migraine')) return 'Headache'
  if (lowerReason.includes('parkinson')) return 'Parkinson\'s'
  if (lowerReason.includes('weakness')) return 'Weakness'
  if (lowerReason.includes('tremor')) return 'Tremor'
  if (lowerReason.includes('seizure')) return 'Seizure'
  if (lowerReason.includes('memory')) return 'Memory'
  // Return first few words if no match
  return reason.split(' ').slice(0, 3).join(' ')
}

interface PatientAppointmentsProps {
  onSelectPatient?: (appointment: Appointment) => void
  onScheduleNew?: () => void
  demoHint?: string | null
  onDismissHint?: () => void
  refreshKey?: number
}

export default function PatientAppointments({ onSelectPatient, onScheduleNew, demoHint, onDismissHint, refreshKey }: PatientAppointmentsProps) {
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [hospitalFilter, setHospitalFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleRowMouseEnter = (id: string) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => setHoveredRowId(id), 300)
  }

  const handleRowMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => setHoveredRowId(null), 200)
  }

  const handlePopoverEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
  }

  const handlePopoverLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => setHoveredRowId(null), 200)
  }

  // Fetch appointments from API
  const fetchAppointments = useCallback(async (date: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/appointments?date=${date}`)
      if (!response.ok) {
        throw new Error('Failed to fetch appointments')
      }
      const data = await response.json()
      setAppointments(data.appointments || [])
    } catch (err) {
      console.error('Error fetching appointments:', err)
      setError('Failed to load appointments')
      setAppointments([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on mount and when date changes or refreshKey changes
  useEffect(() => {
    fetchAppointments(selectedDate)
  }, [selectedDate, fetchAppointments, refreshKey])

  // Format date for display
  const formatDisplayDate = (dateStr: string): string => {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  // Format time for display
  const formatTime = (dateStr: string, timeStr: string): string => {
    const date = new Date(`${dateStr}T${timeStr}`)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  // Navigate date
  const navigateDate = (direction: 'prev' | 'next') => {
    const currentDate = new Date(selectedDate + 'T00:00:00')
    currentDate.setDate(currentDate.getDate() + (direction === 'next' ? 1 : -1))
    setSelectedDate(currentDate.toISOString().split('T')[0])
  }

  // Go to today
  const goToToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0])
  }

  // Filter and sort appointments
  const filteredAppointments = useMemo(() => {
    let result = [...appointments]

    if (hospitalFilter !== 'All') {
      result = result.filter(a => a.hospitalSite === hospitalFilter)
    }
    if (statusFilter !== 'All') {
      result = result.filter(a => a.status.toLowerCase() === statusFilter.toLowerCase())
    }
    if (typeFilter !== 'All') {
      result = result.filter(a => a.appointmentType === typeFilter)
    }

    // Sort by appointment time
    result.sort((a, b) => {
      const timeA = a.appointmentTime
      const timeB = b.appointmentTime
      return sortOrder === 'asc' ? timeA.localeCompare(timeB) : timeB.localeCompare(timeA)
    })

    return result
  }, [appointments, hospitalFilter, statusFilter, typeFilter, sortOrder])

  // Handle row click
  const handleRowClick = (appointment: Appointment) => {
    onSelectPatient?.(appointment)
  }

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
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
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

            <button
              onClick={goToToday}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                background: 'var(--bg-white)',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--text-primary)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {formatDisplayDate(selectedDate)}
            </button>

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
          data-tour="schedule-button"
          onClick={onScheduleNew}
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Schedule Appointment
        </button>
      </div>

      {/* Demo Hint Banner */}
      {demoHint && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          background: '#FFFBEB',
          border: '1px solid #FCD34D',
          borderRadius: '10px',
          marginBottom: '16px',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span style={{ flex: 1, fontSize: '13px', color: '#92400E', lineHeight: '1.5' }}>
            {demoHint}
          </span>
          {onDismissHint && (
            <button
              onClick={onDismissHint}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                color: '#B45309',
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>
      )}

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
            }}
          >
            {STATUSES.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>

        {/* Appointment Type Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Type</span>
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
            }}
          >
            {APPOINTMENT_TYPES.map(type => (
              <option key={type} value={type}>{type === 'All' ? 'All' : formatType(type)}</option>
            ))}
          </select>
        </div>

        {/* Refresh Button */}
        <button
          onClick={() => fetchAppointments(selectedDate)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg-white)',
            fontSize: '13px',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px',
          color: 'var(--text-muted)',
        }}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ animation: 'spin 1s linear infinite', marginRight: '12px' }}
          >
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          Loading appointments...
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div style={{
          padding: '24px',
          textAlign: 'center',
          color: 'var(--error)',
          background: '#FEE2E2',
          borderRadius: '8px',
        }}>
          {error}
          <button
            onClick={() => fetchAppointments(selectedDate)}
            style={{
              marginLeft: '12px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              background: 'var(--error)',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Appointments Table */}
      {!loading && !error && (
        <div data-tour="appointments-list" style={{
          border: '1px solid var(--border)',
          borderRadius: '12px',
          overflow: 'visible',
        }}>
          {/* Table Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '120px 120px 200px 140px 160px 140px 50px',
            gap: '16px',
            padding: '12px 16px',
            background: 'var(--bg-gray)',
            borderBottom: '1px solid var(--border)',
            borderRadius: '12px 12px 0 0',
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
              Time
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {sortOrder === 'asc' ? (
                  <polyline points="18 15 12 9 6 15" />
                ) : (
                  <polyline points="6 9 12 15 18 9" />
                )}
              </svg>
            </button>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Site
            </span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Patient
            </span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Reason
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
              <p style={{ fontSize: '12px' }}>
                {appointments.length === 0
                  ? 'No appointments scheduled for this date'
                  : 'Try adjusting your filters'}
              </p>
            </div>
          ) : (
            filteredAppointments.map((appointment, index) => {
              const reasonColor = getReasonColor(appointment.reasonForVisit)
              const shortReason = getShortReason(appointment.reasonForVisit)

              const isHovered = hoveredRowId === appointment.id
              const isFollowUp = appointment.appointmentType.includes('follow-up') || appointment.appointmentType === 'next-day'
              const isNewConsult = appointment.appointmentType === 'new-consult'

              return (
                <div
                  key={appointment.id}
                  onClick={() => handleRowClick(appointment)}
                  style={{
                    position: 'relative',
                    display: 'grid',
                    gridTemplateColumns: '120px 120px 200px 140px 160px 140px 50px',
                    gap: '16px',
                    padding: '16px',
                    borderBottom: index < filteredAppointments.length - 1 ? '1px solid var(--border)' : 'none',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                    background: isHovered ? 'var(--bg-gray)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-gray)'
                    handleRowMouseEnter(appointment.id)
                  }}
                  onMouseLeave={(e) => {
                    if (!isHovered) e.currentTarget.style.background = 'transparent'
                    handleRowMouseLeave()
                  }}
                >
                  {/* Time */}
                  <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {formatTime(appointment.appointmentDate, appointment.appointmentTime)}
                  </div>

                  {/* Hospital Site */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#10B981',
                    }} />
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                      {appointment.hospitalSite}
                    </span>
                  </div>

                  {/* Patient Details */}
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {appointment.patient?.name || 'Unknown Patient'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      MRN: {appointment.patient?.mrn}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Age: {appointment.patient?.age || 'N/A'} | {appointment.patient?.gender || 'N/A'}
                    </div>
                  </div>

                  {/* Reason for Visit */}
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
                      {shortReason}
                    </span>
                  </div>

                  {/* Status */}
                  <div>
                    {(appointment.status === 'confirmed' || appointment.status === 'scheduled') && (
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
                        {appointment.status === 'scheduled' ? 'Scheduled' : 'Confirmed'}
                      </span>
                    )}
                    {appointment.status === 'in-progress' && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: '#3B82F6',
                        fontSize: '13px',
                        fontWeight: 500,
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        In Progress
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
                    {formatType(appointment.appointmentType)}
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
                          onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); }}
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
                              handleRowClick(appointment)
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

                  {/* Hover Popovers */}
                  {isHovered && (
                    <>
                      {/* Quick Actions - Launch EPIC / PACS */}
                      <div
                        onMouseEnter={handlePopoverEnter}
                        onMouseLeave={handlePopoverLeave}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: 'absolute',
                          right: '60px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          display: 'flex',
                          gap: '6px',
                          zIndex: 10,
                        }}
                      >
                        <button
                          onClick={(e) => { e.stopPropagation() }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-white)',
                            color: 'var(--text-primary)',
                            fontSize: '12px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                            whiteSpace: 'nowrap',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-gray)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-white)'}
                        >
                          Launch EPIC
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation() }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-white)',
                            color: 'var(--text-primary)',
                            fontSize: '12px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                            whiteSpace: 'nowrap',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-gray)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-white)'}
                        >
                          Launch PACS
                        </button>
                      </div>

                      {/* Referral Note Preview - New Consults */}
                      {isNewConsult && (
                        <div
                          onMouseEnter={handlePopoverEnter}
                          onMouseLeave={handlePopoverLeave}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: 'absolute',
                            right: '60px',
                            top: '100%',
                            marginTop: '8px',
                            width: '420px',
                            maxHeight: '320px',
                            overflow: 'auto',
                            background: 'var(--bg-white)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                            padding: '20px 24px',
                            zIndex: 50,
                            fontFamily: '"Courier New", Courier, monospace',
                            cursor: 'default',
                          }}
                        >
                          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '14px', letterSpacing: '1px', marginBottom: '4px' }}>
                            REFERRAL NOTE
                          </div>
                          <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                            Neurology Consultation Request
                          </div>
                          <hr style={{ border: 'none', borderTop: '2px solid var(--primary)', marginBottom: '12px' }} />
                          <div style={{ fontSize: '12px', lineHeight: '1.8' }}>
                            <div><strong>DATE:</strong> {new Date(appointment.appointmentDate + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}</div>
                            <div style={{ marginTop: '8px' }}>
                              <strong>REFERRING PHYSICIAN:</strong><br />
                              {appointment.patient?.referringPhysician || 'Not specified'}{appointment.patient?.referringPhysician ? ', DO' : ''}
                              <br />
                              <span style={{ color: 'var(--text-muted)' }}>Family Medicine</span>
                            </div>
                            <div style={{ marginTop: '8px' }}>
                              <strong>CHIEF COMPLAINT:</strong><br />
                              {appointment.patient?.referralReason || appointment.reasonForVisit || 'Not specified'}
                            </div>
                            <div style={{ marginTop: '8px' }}>
                              <strong>CLINICAL HISTORY:</strong><br />
                              {appointment.patient?.referralReason
                                ? `Patient referred for evaluation of ${(appointment.patient.referralReason).toLowerCase()}. ${
                                    appointment.patient.age ? `${appointment.patient.age} y/o` : 'Patient'
                                  } ${appointment.patient.gender === 'F' ? 'female' : appointment.patient.gender === 'M' ? 'male' : 'patient'} presenting with ${
                                    appointment.reasonForVisit?.toLowerCase() || (appointment.patient.referralReason).toLowerCase()
                                  }. Please evaluate and advise on management.`
                                : 'Clinical history not available in referral.'}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* AI Visit Summary Preview - Follow-ups */}
                      {isFollowUp && appointment.priorVisit && (
                        <div
                          onMouseEnter={handlePopoverEnter}
                          onMouseLeave={handlePopoverLeave}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: 'absolute',
                            right: '60px',
                            top: '100%',
                            marginTop: '8px',
                            width: '460px',
                            maxHeight: '350px',
                            overflow: 'auto',
                            background: 'var(--bg-white)',
                            border: '1px solid #BFDBFE',
                            borderRadius: '12px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                            padding: '20px 24px',
                            zIndex: 50,
                            cursor: 'default',
                          }}
                        >
                          <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3B82F6' }} />
                            <span style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '0.5px' }}>AI-GENERATED VISIT SUMMARY</span>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3B82F6' }} />
                          </div>
                          <div style={{ textAlign: 'center', fontSize: '11px', color: '#3B82F6', fontWeight: 600, letterSpacing: '1px', marginBottom: '12px' }}>
                            PATIENT HISTORY OVERVIEW
                          </div>
                          <hr style={{ border: 'none', borderTop: '2px solid #3B82F6', marginBottom: '12px' }} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', padding: '8px 12px', background: '#F0F9FF', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              <strong>Last Visit:</strong> {new Date(appointment.priorVisit.visitDate.includes('T') ? appointment.priorVisit.visitDate : appointment.priorVisit.visitDate + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                            </span>
                            <span style={{
                              padding: '2px 8px',
                              background: '#DBEAFE',
                              color: '#1D4ED8',
                              borderRadius: '10px',
                              fontSize: '11px',
                              fontWeight: 600,
                            }}>
                              prior visit
                            </span>
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>&#9660;</span>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>CLINICAL SUMMARY:</span>
                            </div>
                            <div style={{
                              fontSize: '13px',
                              lineHeight: '1.6',
                              color: 'var(--text-secondary)',
                              padding: '8px 12px',
                              background: 'var(--bg-gray)',
                              borderRadius: '8px',
                              border: '1px solid var(--border)',
                            }}>
                              {appointment.priorVisit.aiSummary || 'No AI summary available for the prior visit.'}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Summary Footer */}
      {!loading && !error && (
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
            Showing {filteredAppointments.length} of {appointments.length} appointments
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              <span style={{ color: '#059669', fontWeight: 500 }}>
                {appointments.filter(a => a.status === 'confirmed' || a.status === 'scheduled').length}
              </span> scheduled
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              <span style={{ color: '#3B82F6', fontWeight: 500 }}>
                {appointments.filter(a => a.status === 'in-progress').length}
              </span> in progress
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              <span style={{ color: '#6B7280', fontWeight: 500 }}>
                {appointments.filter(a => a.status === 'completed').length}
              </span> completed
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
