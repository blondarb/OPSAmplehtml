'use client'

import type { Appointment, AppointmentsByDate } from './appointmentUtils'
import {
  toDateString,
  isToday,
  getLoadLevel,
  LOAD_LEVEL_COLORS,
} from './appointmentUtils'
import AppointmentCard from './AppointmentCard'
import AppointmentPopover, { useHoverPopover } from './AppointmentPopover'

interface WeekViewProps {
  days: Date[]
  appointmentsByDate: AppointmentsByDate
  onSelectPatient: (appointment: Appointment) => void
  onDrillToDay: (dateStr: string) => void
}

export default function WeekView({
  days,
  appointmentsByDate,
  onSelectPatient,
  onDrillToDay,
}: WeekViewProps) {
  const { hoveredId, anchorRect, onEnter, onLeave, onPopoverEnter, onPopoverLeave } = useHoverPopover()

  // Find the hovered appointment across all days
  const hoveredAppointment = hoveredId
    ? Object.values(appointmentsByDate).flat().find(a => a.id === hoveredId)
    : null

  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '1px',
        background: 'var(--border)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        {days.map((day) => {
          const dateStr = toDateString(day)
          const dayAppointments = appointmentsByDate[dateStr] || []
          const count = dayAppointments.length
          const loadLevel = getLoadLevel(count)
          const loadColors = LOAD_LEVEL_COLORS[loadLevel]
          const today = isToday(day)
          const dayName = day.toLocaleDateString('en-US', { weekday: 'short' })
          const dayNum = day.getDate()
          const monthShort = day.toLocaleDateString('en-US', { month: 'short' })

          return (
            <div
              key={dateStr}
              style={{
                background: 'var(--bg-white)',
                minHeight: '280px',
                display: 'flex',
                flexDirection: 'column',
                borderLeft: today ? '3px solid var(--primary)' : 'none',
              }}
            >
              {/* Column Header */}
              <div
                onClick={() => onDrillToDay(dateStr)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 10px 8px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background: today ? 'rgba(13, 148, 136, 0.04)' : 'transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: today ? 'var(--primary)' : 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>
                    {dayName}
                  </span>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: today ? 'var(--primary)' : 'var(--text-primary)',
                  }}>
                    {monthShort} {dayNum}
                  </span>
                </div>
                {/* Count badge with load indicator */}
                {count > 0 && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '22px',
                    height: '22px',
                    padding: '0 6px',
                    borderRadius: '11px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: loadColors.bg || 'var(--bg-gray)',
                    color: loadColors.text,
                    border: loadLevel === 'normal' ? '1px solid var(--border)' : 'none',
                  }}>
                    {count}
                  </span>
                )}
              </div>

              {/* Cards */}
              <div style={{
                flex: 1,
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                overflowY: 'auto',
              }}>
                {dayAppointments.length === 0 ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 1,
                    color: 'var(--text-muted)',
                    fontSize: '12px',
                    opacity: 0.5,
                  }}>
                    No appointments
                  </div>
                ) : (
                  dayAppointments.map(appointment => (
                    <AppointmentCard
                      key={appointment.id}
                      appointment={appointment}
                      onClick={onSelectPatient}
                      onMouseEnter={onEnter}
                      onMouseLeave={onLeave}
                      isHovered={hoveredId === appointment.id}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Popover portal */}
      {hoveredAppointment && anchorRect && (
        <AppointmentPopover
          appointment={hoveredAppointment}
          anchorRect={anchorRect}
          onMouseEnter={onPopoverEnter}
          onMouseLeave={onPopoverLeave}
        />
      )}
    </>
  )
}
