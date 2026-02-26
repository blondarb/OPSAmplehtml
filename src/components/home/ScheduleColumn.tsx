'use client'

import { useState, useMemo } from 'react'
import { Calendar } from 'lucide-react'

interface ScheduleColumnProps {
  onSelectPatient: (appointmentId: string) => void
  onScheduleNew: () => void
  onScheduleFollowup: () => void
  onPrepPatient?: (appointmentId: string) => void
}

// Demo data for today's schedule
const DEMO_APPOINTMENTS = [
  { id: 'apt-1', time: '8:30 AM', name: 'Linda Martinez', type: 'Follow-up', reason: 'Parkinson\'s tremor assessment', prepStatus: 'done', incompletePrior: false },
  { id: 'apt-2', time: '9:00 AM', name: 'Robert Chen', type: 'New', reason: 'Headache evaluation', prepStatus: 'needs-review', incompletePrior: true },
  { id: 'apt-3', time: '9:30 AM', name: 'Sarah Kim', type: 'Follow-up', reason: 'MS follow-up', prepStatus: 'done', incompletePrior: false },
  { id: 'apt-4', time: '10:15 AM', name: 'James Wilson', type: 'Urgent', reason: 'Seizure breakthrough', prepStatus: 'none', incompletePrior: false },
  { id: 'apt-5', time: '11:00 AM', name: 'Maria Garcia', type: 'Follow-up', reason: 'Migraine management', prepStatus: 'done', incompletePrior: false },
  { id: 'apt-6', time: '1:30 PM', name: 'David Thompson', type: 'New', reason: 'Memory concerns', prepStatus: 'needs-review', incompletePrior: false },
  { id: 'apt-7', time: '2:15 PM', name: 'Helen Park', type: 'Follow-up', reason: 'Epilepsy med review', prepStatus: 'none', incompletePrior: true },
  { id: 'apt-8', time: '3:00 PM', name: 'Frank Russo', type: 'Follow-up', reason: 'Essential tremor', prepStatus: 'done', incompletePrior: false },
]

function getTypeBadgeStyle(type: string) {
  switch (type) {
    case 'New': return { background: '#CCFBF1', color: '#0D9488', border: '1px solid #99F6E4' }
    case 'Follow-up': return { background: '#DBEAFE', color: '#2563EB', border: '1px solid #BFDBFE' }
    case 'Urgent': return { background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }
    default: return { background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' }
  }
}

function getPrepDotColor(status: string) {
  switch (status) {
    case 'done': return '#10B981'
    case 'needs-review': return '#F59E0B'
    case 'none': return '#EF4444'
    default: return '#9CA3AF'
  }
}

function getPrepLabel(status: string) {
  switch (status) {
    case 'done': return 'Chart prep complete'
    case 'needs-review': return 'Historian done, needs review'
    case 'none': return 'No prep yet'
    default: return ''
  }
}

/** Get Monday of the week containing a given date */
function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay() // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day // if Sunday, go back 6; else go to Monday
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

/** Format as "Feb 17" */
function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Days in a given month (1-indexed) */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** What day-of-week does the 1st of a month fall on? 0=Sun..6=Sat */
function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export default function ScheduleColumn({ onSelectPatient, onScheduleNew, onScheduleFollowup, onPrepPatient }: ScheduleColumnProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [showMonthGrid, setShowMonthGrid] = useState(false)

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  // Calendar month state (initialized to current month)
  const [displayMonth, setDisplayMonth] = useState(today.getMonth())
  const [displayYear, setDisplayYear] = useState(today.getFullYear())

  // Compute the Monday of the displayed week
  const currentMonday = useMemo(() => getMonday(today), [today])
  const displayMonday = useMemo(() => {
    const d = new Date(currentMonday)
    d.setDate(d.getDate() + weekOffset * 7)
    return d
  }, [currentMonday, weekOffset])

  // Build weekDays array (Mon-Fri)
  const weekDays = useMemo(() => Array.from({ length: 5 }, (_, i) => {
    const d = new Date(displayMonday)
    d.setDate(d.getDate() + i)
    return {
      label: DAY_LABELS[i],
      dateNum: d.getDate(),
      isToday: d.getTime() === today.getTime(),
      fullDate: d,
    }
  }), [displayMonday, today])

  // Week range label
  const isCurrentWeek = weekOffset === 0
  const weekFriday = new Date(displayMonday)
  weekFriday.setDate(weekFriday.getDate() + 4)

  const weekLabel = isCurrentWeek
    ? `Today \u00B7 ${DEMO_APPOINTMENTS.length} patients`
    : `${shortDate(displayMonday)} week \u00B7 ${DEMO_APPOINTMENTS.length} patients`

  const weekSublabel = isCurrentWeek
    ? today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : `${shortDate(displayMonday)} \u2013 ${shortDate(weekFriday)}`

  // --- Mini-month helpers ---
  const calendarCells = useMemo(() => {
    const totalDays = daysInMonth(displayYear, displayMonth)
    const startDay = firstDayOfMonth(displayYear, displayMonth) // 0=Sun
    const cells: (number | null)[] = []
    for (let i = 0; i < startDay; i++) cells.push(null)
    for (let d = 1; d <= totalDays; d++) cells.push(d)
    return cells
  }, [displayYear, displayMonth])

  function prevMonth() {
    setDisplayMonth(m => {
      if (m === 0) { setDisplayYear(y => y - 1); return 11 }
      return m - 1
    })
  }
  function nextMonth() {
    setDisplayMonth(m => {
      if (m === 11) { setDisplayYear(y => y + 1); return 0 }
      return m + 1
    })
  }

  /** Click a day in the month grid: jump to that day's week */
  function handleDayClick(dayNum: number) {
    const clicked = new Date(displayYear, displayMonth, dayNum)
    const clickedMonday = getMonday(clicked)
    const diffMs = clickedMonday.getTime() - currentMonday.getTime()
    const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000))
    setWeekOffset(diffWeeks)
    setShowMonthGrid(false)
  }

  function isTodayCell(dayNum: number): boolean {
    return displayYear === today.getFullYear()
      && displayMonth === today.getMonth()
      && dayNum === today.getDate()
  }

  /** Is a given day a weekday (Mon-Fri)? Used to show teal dot. */
  function isWeekday(dayNum: number): boolean {
    const d = new Date(displayYear, displayMonth, dayNum).getDay()
    return d >= 1 && d <= 5
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      borderRight: '1px solid var(--border)', background: 'var(--bg-white)',
      minWidth: '260px', maxWidth: '320px', width: '280px',
    }}>
      {/* Week strip with navigation arrows */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '2px', padding: '12px 8px 8px',
        borderBottom: '1px solid var(--border)',
      }}>
        {/* Prev week arrow */}
        <button
          onClick={() => setWeekOffset(w => w - 1)}
          aria-label="Previous week"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#9CA3AF', flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* Day cells */}
        <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
          {weekDays.map((day) => (
            <div key={day.label + day.dateNum} style={{
              flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: '8px',
              fontSize: '12px', fontWeight: 600,
              background: day.isToday ? '#0D9488' : 'transparent',
              color: day.isToday ? 'white' : 'var(--text-muted)',
              transition: 'all 0.2s',
            }}>
              <div>{day.label}</div>
              <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px' }}>
                {day.dateNum}
              </div>
            </div>
          ))}
        </div>

        {/* Next week arrow */}
        <button
          onClick={() => setWeekOffset(w => w + 1)}
          aria-label="Next week"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#9CA3AF', flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Today pill (only when not on current week) */}
      {!isCurrentWeek && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 0' }}>
          <button
            onClick={() => setWeekOffset(0)}
            style={{
              background: 'transparent', border: '1px solid #0D9488',
              color: '#0D9488', fontSize: '11px', fontWeight: 600,
              padding: '3px 14px', borderRadius: '12px', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            Today
          </button>
        </div>
      )}

      {/* Month view toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 0' }}>
        <button
          onClick={() => {
            setShowMonthGrid(v => !v)
            // Reset calendar to current month when opening
            if (!showMonthGrid) {
              setDisplayMonth(today.getMonth())
              setDisplayYear(today.getFullYear())
            }
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            background: showMonthGrid ? '#F0FDFA' : 'transparent',
            border: showMonthGrid ? '1px solid #99F6E4' : '1px solid transparent',
            color: showMonthGrid ? '#0D9488' : '#9CA3AF',
            fontSize: '11px', fontWeight: 600,
            padding: '4px 10px', borderRadius: '6px', cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <Calendar size={13} />
          {showMonthGrid ? 'Hide calendar' : 'Month view'}
        </button>
      </div>

      {/* Mini-month calendar grid */}
      {showMonthGrid && (
        <div style={{ padding: '8px 12px 4px' }}>
          {/* Month header with nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <button onClick={prevMonth} aria-label="Previous month" style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
              color: '#9CA3AF', display: 'flex', alignItems: 'center',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {MONTH_NAMES[displayMonth]} {displayYear}
            </span>
            <button onClick={nextMonth} aria-label="Next month" style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
              color: '#9CA3AF', display: 'flex', alignItems: 'center',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Weekday headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center' }}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <div key={d} style={{ fontSize: '10px', fontWeight: 600, color: '#9CA3AF', padding: '2px 0' }}>{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center' }}>
            {calendarCells.map((cell, idx) => (
              <div key={idx} style={{ padding: '1px' }}>
                {cell !== null ? (
                  <button
                    onClick={() => handleDayClick(cell)}
                    style={{
                      width: '28px', height: '28px', borderRadius: '50%',
                      border: 'none', cursor: 'pointer',
                      fontSize: '11px', fontWeight: isTodayCell(cell) ? 700 : 500,
                      background: isTodayCell(cell) ? '#0D9488' : 'transparent',
                      color: isTodayCell(cell) ? 'white' : 'var(--text-primary)',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      position: 'relative',
                      transition: 'background 0.1s',
                    }}
                  >
                    {cell}
                    {/* Teal dot for weekdays (Mon-Fri) indicating appointments */}
                    {isWeekday(cell) && !isTodayCell(cell) && (
                      <span style={{
                        position: 'absolute', bottom: '2px',
                        width: '3px', height: '3px', borderRadius: '50%',
                        background: '#0D9488',
                      }} />
                    )}
                  </button>
                ) : (
                  <span style={{ width: '28px', height: '28px', display: 'inline-block' }} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Week label */}
      <div style={{ padding: '8px 16px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
          {weekLabel}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {weekSublabel}
        </span>
      </div>

      {/* Appointment list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
        {DEMO_APPOINTMENTS.map((apt) => (
          <button
            key={apt.id}
            onClick={() => onSelectPatient(apt.id)}
            onMouseEnter={() => setHoveredId(apt.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              width: '100%', textAlign: 'left', border: 'none',
              display: 'flex', flexDirection: 'column', gap: '4px',
              padding: '10px 12px', borderRadius: '10px', marginBottom: '4px',
              background: hoveredId === apt.id ? 'var(--bg-gray)' : 'transparent',
              cursor: 'pointer', transition: 'background 0.15s',
              position: 'relative',
            }}
          >
            {/* Top row: time + name + (prep button on hover) + prep dot */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', minWidth: '60px' }}>
                {apt.time}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                {apt.name}
              </span>
              {/* Quick Prep button: visible on hover when prep is not done */}
              {apt.prepStatus !== 'done' && hoveredId === apt.id && onPrepPatient && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onPrepPatient(apt.id) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onPrepPatient(apt.id) } }}
                  style={{
                    fontSize: '10px', fontWeight: 700,
                    padding: '2px 8px', borderRadius: '6px',
                    background: '#F0FDFA', color: '#0D9488',
                    border: '1px solid #99F6E4',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    transition: 'all 0.1s', flexShrink: 0,
                  }}
                >
                  Prep
                </span>
              )}
              <span title={getPrepLabel(apt.prepStatus)} style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: getPrepDotColor(apt.prepStatus), flexShrink: 0,
              }} />
            </div>

            {/* Bottom row: type badge + reason + incomplete warning */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '68px' }}>
              <span style={{
                fontSize: '10px', fontWeight: 600, padding: '1px 6px',
                borderRadius: '4px', whiteSpace: 'nowrap',
                ...getTypeBadgeStyle(apt.type),
              }}>
                {apt.type}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {apt.reason}
              </span>
              {apt.incompletePrior && (
                <span title="Incomplete prior documentation" style={{ color: '#F59E0B', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
        <button onClick={onScheduleFollowup} style={{
          flex: 1, padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
          background: 'var(--bg-gray)', border: '1px solid var(--border)',
          color: 'var(--text-primary)', cursor: 'pointer', transition: 'all 0.2s',
        }}>
          + Follow-up
        </button>
        <button onClick={onScheduleNew} style={{
          flex: 1, padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
          background: '#0D9488', border: 'none',
          color: 'white', cursor: 'pointer', transition: 'all 0.2s',
        }}>
          + New Patient
        </button>
      </div>
    </div>
  )
}
