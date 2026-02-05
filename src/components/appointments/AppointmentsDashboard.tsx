'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import type {
  Appointment,
  CalendarViewMode,
} from './appointmentUtils'
import {
  toDateString,
  getWeekRange,
  getMonthRange,
  formatDisplayDate,
  formatWeekRange,
  formatMonthHeader,
  filterAppointments,
  groupAppointmentsByDate,
  HOSPITAL_SITES,
  STATUSES,
  APPOINTMENT_TYPES,
  formatType,
} from './appointmentUtils'
import DayView from './DayView'
import WeekView from './WeekView'
import MonthView from './MonthView'

interface AppointmentsDashboardProps {
  onSelectPatient?: (appointment: Appointment) => void
  onScheduleNew?: () => void
  demoHint?: string | null
  onDismissHint?: () => void
  refreshKey?: number
}

export default function AppointmentsDashboard({
  onSelectPatient,
  onScheduleNew,
  demoHint,
  onDismissHint,
  refreshKey,
}: AppointmentsDashboardProps) {
  // View mode - persisted to localStorage
  const [viewMode, setViewMode] = useState<CalendarViewMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sevaro-calendar-view')
      if (saved === 'day' || saved === 'week' || saved === 'month') return saved
    }
    return 'day'
  })

  // Selected date - shared anchor for all views
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    return toDateString(today)
  })

  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [hospitalFilter, setHospitalFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')

  // Persist view mode
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sevaro-calendar-view', viewMode)
    }
  }, [viewMode])

  // Compute date range based on view mode
  const dateRange = useMemo(() => {
    const anchor = new Date(selectedDate + 'T00:00:00')

    if (viewMode === 'day') {
      return { startDate: selectedDate, endDate: selectedDate }
    }

    if (viewMode === 'week') {
      const { start, end } = getWeekRange(anchor)
      return { startDate: toDateString(start), endDate: toDateString(end) }
    }

    // Month
    const { start, end } = getMonthRange(anchor)
    return { startDate: toDateString(start), endDate: toDateString(end) }
  }, [selectedDate, viewMode])

  // Fetch appointments from API
  const fetchAppointments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let url: string
      if (dateRange.startDate === dateRange.endDate) {
        url = `/api/appointments?date=${dateRange.startDate}`
      } else {
        url = `/api/appointments?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`
      }

      const response = await fetch(url)
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
  }, [dateRange])

  // Fetch on mount and when date range or refreshKey changes
  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments, refreshKey])

  // Filter appointments
  const filteredAppointments = useMemo(() => {
    return filterAppointments(appointments, hospitalFilter, statusFilter, typeFilter)
  }, [appointments, hospitalFilter, statusFilter, typeFilter])

  // Group by date for week/month views
  const appointmentsByDate = useMemo(() => {
    return groupAppointmentsByDate(filteredAppointments)
  }, [filteredAppointments])

  // Date navigation
  const navigateDate = (direction: 'prev' | 'next') => {
    const currentDate = new Date(selectedDate + 'T00:00:00')

    if (viewMode === 'day') {
      currentDate.setDate(currentDate.getDate() + (direction === 'next' ? 1 : -1))
    } else if (viewMode === 'week') {
      currentDate.setDate(currentDate.getDate() + (direction === 'next' ? 7 : -7))
    } else {
      // Month
      currentDate.setMonth(currentDate.getMonth() + (direction === 'next' ? 1 : -1))
    }

    setSelectedDate(toDateString(currentDate))
  }

  const goToToday = () => {
    setSelectedDate(toDateString(new Date()))
  }

  // Date display based on view mode
  const dateDisplay = useMemo(() => {
    const anchor = new Date(selectedDate + 'T00:00:00')

    if (viewMode === 'day') {
      return formatDisplayDate(selectedDate)
    }

    if (viewMode === 'week') {
      const { start, end } = getWeekRange(anchor)
      return formatWeekRange(start, end)
    }

    return formatMonthHeader(anchor)
  }, [selectedDate, viewMode])

  // Handle select patient
  const handleSelectPatient = (appointment: Appointment) => {
    onSelectPatient?.(appointment)
  }

  // Drill-down: click a day in week/month view → switch to day view
  const handleDrillToDay = (dateStr: string) => {
    setSelectedDate(dateStr)
    setViewMode('day')
  }

  // Compute week/month data
  const weekData = useMemo(() => {
    const anchor = new Date(selectedDate + 'T00:00:00')
    return getWeekRange(anchor)
  }, [selectedDate])

  const monthData = useMemo(() => {
    const anchor = new Date(selectedDate + 'T00:00:00')
    return getMonthRange(anchor)
  }, [selectedDate])

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

          {/* View Switcher */}
          <div
            data-tour="view-toggle"
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-gray)',
              borderRadius: '8px',
              padding: '3px',
            }}
          >
            {(['day', 'week', 'month'] as CalendarViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '5px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: viewMode === mode ? 'var(--primary)' : 'transparent',
                  color: viewMode === mode ? 'white' : 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  textTransform: 'capitalize',
                }}
              >
                {mode}
              </button>
            ))}
          </div>

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
                whiteSpace: 'nowrap',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {dateDisplay}
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
        <FilterSelect
          label="Hospital"
          value={hospitalFilter}
          onChange={setHospitalFilter}
          options={HOSPITAL_SITES}
        />

        {/* Status Filter */}
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUSES}
        />

        {/* Appointment Type Filter */}
        <FilterSelect
          label="Type"
          value={typeFilter}
          onChange={setTypeFilter}
          options={APPOINTMENT_TYPES}
          formatOption={(opt) => opt === 'All' ? 'All' : formatType(opt)}
        />

        {/* Refresh Button */}
        <button
          onClick={fetchAppointments}
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
            onClick={fetchAppointments}
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

      {/* View Content */}
      {!loading && !error && (
        <>
          {viewMode === 'day' && (
            <DayView
              appointments={filteredAppointments}
              onSelectPatient={handleSelectPatient}
              onRefresh={fetchAppointments}
            />
          )}

          {viewMode === 'week' && (
            <WeekView
              days={weekData.days}
              appointmentsByDate={appointmentsByDate}
              onSelectPatient={handleSelectPatient}
              onDrillToDay={handleDrillToDay}
            />
          )}

          {viewMode === 'month' && (
            <MonthView
              weeks={monthData.weeks}
              currentMonth={new Date(selectedDate + 'T00:00:00').getMonth()}
              appointmentsByDate={appointmentsByDate}
              allAppointments={filteredAppointments}
              onSelectPatient={handleSelectPatient}
              onDrillToDay={handleDrillToDay}
            />
          )}
        </>
      )}

      {/* Summary Footer - Day view */}
      {!loading && !error && viewMode === 'day' && (
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

      {/* Summary Footer - Week view */}
      {!loading && !error && viewMode === 'week' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '12px',
          padding: '10px 16px',
          background: 'var(--bg-gray)',
          borderRadius: '8px',
          flexWrap: 'wrap',
          gap: '8px',
        }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {filteredAppointments.length} appointments this week
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              <span style={{ color: '#EF4444', fontWeight: 500 }}>
                {filteredAppointments.filter(a => a.appointmentType === 'new-consult').length}
              </span> new consults
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              <span style={{ color: '#0D9488', fontWeight: 500 }}>
                {filteredAppointments.filter(a => a.appointmentType.includes('follow-up') || a.appointmentType === 'next-day').length}
              </span> follow-ups
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// Filter select component
function FilterSelect({
  label,
  value,
  onChange,
  options,
  formatOption,
}: {
  label: string
  value: string
  onChange: (val: string) => void
  options: string[]
  formatOption?: (opt: string) => string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
        {options.map(opt => (
          <option key={opt} value={opt}>
            {formatOption ? formatOption(opt) : opt}
          </option>
        ))}
      </select>
    </div>
  )
}
