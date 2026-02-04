'use client'

import { useMemo } from 'react'
import type { Appointment, AppointmentsByDate } from './appointmentUtils'
import {
  toDateString,
  isToday,
  getLoadLevel,
  LOAD_LEVEL_COLORS,
} from './appointmentUtils'
import AppointmentCard from './AppointmentCard'
import AppointmentPopover, { useHoverPopover } from './AppointmentPopover'

interface MonthViewProps {
  weeks: Date[][]
  currentMonth: number // 0-indexed month number of the selected month
  appointmentsByDate: AppointmentsByDate
  allAppointments: Appointment[] // For stats
  onSelectPatient: (appointment: Appointment) => void
  onDrillToDay: (dateStr: string) => void
}

const MAX_VISIBLE_LINES = 4

export default function MonthView({
  weeks,
  currentMonth,
  appointmentsByDate,
  allAppointments,
  onSelectPatient,
  onDrillToDay,
}: MonthViewProps) {
  const { hoveredId, anchorRect, onEnter, onLeave, onPopoverEnter, onPopoverLeave } = useHoverPopover()

  // Find the hovered appointment across all days
  const hoveredAppointment = hoveredId
    ? Object.values(appointmentsByDate).flat().find(a => a.id === hoveredId)
    : null

  // Summary stats
  const stats = useMemo(() => {
    const total = allAppointments.length
    const newConsults = allAppointments.filter(a => a.appointmentType === 'new-consult').length
    const followUps = total - newConsults
    const completed = allAppointments.filter(a => a.status === 'completed').length
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

    // Find busiest day
    let busiestDate = ''
    let busiestCount = 0
    for (const [date, appts] of Object.entries(appointmentsByDate)) {
      if (appts.length > busiestCount) {
        busiestCount = appts.length
        busiestDate = date
      }
    }
    const busiestFormatted = busiestDate
      ? new Date(busiestDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      : 'N/A'

    return { total, newConsults, followUps, completed, completionRate, busiestFormatted, busiestCount }
  }, [allAppointments, appointmentsByDate])

  return (
    <>
      {/* Day-of-week headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '0',
        marginBottom: '0',
      }}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
          <div key={day} style={{
            padding: '8px 10px',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            textAlign: 'center',
            letterSpacing: '0.5px',
          }}>
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div style={{
        display: 'grid',
        gridTemplateRows: `repeat(${weeks.length}, 1fr)`,
        gap: '0',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        {weeks.map((week, weekIndex) => (
          <div
            key={weekIndex}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '0',
              borderBottom: weekIndex < weeks.length - 1 ? '1px solid var(--border)' : 'none',
            }}
          >
            {week.map((day, dayIndex) => {
              const dateStr = toDateString(day)
              const dayAppointments = appointmentsByDate[dateStr] || []
              const count = dayAppointments.length
              const isCurrentMonth = day.getMonth() === currentMonth
              const today = isToday(day)
              const loadLevel = getLoadLevel(count)
              const loadColors = LOAD_LEVEL_COLORS[loadLevel]
              const visibleAppts = dayAppointments.slice(0, MAX_VISIBLE_LINES)
              const overflow = dayAppointments.length - MAX_VISIBLE_LINES

              return (
                <div
                  key={dateStr}
                  style={{
                    minHeight: '110px',
                    padding: '4px 6px',
                    borderRight: dayIndex < 6 ? '1px solid var(--border)' : 'none',
                    background: !isCurrentMonth
                      ? 'rgba(0,0,0,0.02)'
                      : count > 0 && loadLevel === 'heavy'
                        ? 'rgba(254, 243, 199, 0.3)'
                        : 'var(--bg-white)',
                    position: 'relative',
                  }}
                >
                  {/* Date number */}
                  <div
                    onClick={() => onDrillToDay(dateStr)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: today ? '26px' : 'auto',
                      height: today ? '26px' : 'auto',
                      borderRadius: today ? '50%' : '0',
                      background: today ? 'var(--primary)' : 'transparent',
                      color: today
                        ? 'white'
                        : isCurrentMonth
                          ? 'var(--text-primary)'
                          : 'var(--text-muted)',
                      fontSize: '13px',
                      fontWeight: isCurrentMonth ? 600 : 400,
                      padding: today ? '0' : '2px',
                    }}>
                      {day.getDate()}
                    </span>
                    {count > 0 && !today && (
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        color: loadColors.text,
                        background: loadColors.bg || 'transparent',
                        padding: '1px 5px',
                        borderRadius: '8px',
                      }}>
                        {count}
                      </span>
                    )}
                    {today && count > 0 && (
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        color: 'var(--primary)',
                        background: 'rgba(13, 148, 136, 0.1)',
                        padding: '1px 5px',
                        borderRadius: '8px',
                      }}>
                        {count}
                      </span>
                    )}
                  </div>

                  {/* Mini appointment lines */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    {visibleAppts.map(appointment => (
                      <AppointmentCard
                        key={appointment.id}
                        appointment={appointment}
                        onClick={onSelectPatient}
                        onMouseEnter={onEnter}
                        onMouseLeave={onLeave}
                        isHovered={hoveredId === appointment.id}
                        compact
                      />
                    ))}
                    {overflow > 0 && (
                      <div
                        onClick={(e) => { e.stopPropagation(); onDrillToDay(dateStr) }}
                        style={{
                          fontSize: '10px',
                          color: 'var(--primary)',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: '2px 4px',
                          borderRadius: '4px',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(13, 148, 136, 0.08)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        +{overflow} more
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Summary Stats Bar */}
      {allAppointments.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          marginTop: '12px',
          padding: '10px 16px',
          background: 'var(--bg-gray)',
          borderRadius: '8px',
          flexWrap: 'wrap',
        }}>
          <StatItem label="Total" value={`${stats.total} appts`} />
          <StatItem
            label="New"
            value={`${stats.newConsults} (${stats.total > 0 ? Math.round((stats.newConsults / stats.total) * 100) : 0}%)`}
            valueColor="#EF4444"
          />
          <StatItem
            label="Follow-up"
            value={`${stats.followUps} (${stats.total > 0 ? Math.round((stats.followUps / stats.total) * 100) : 0}%)`}
            valueColor="#0D9488"
          />
          <StatItem
            label="Completed"
            value={`${stats.completionRate}%`}
            valueColor="#059669"
          />
          <StatItem
            label="Busiest"
            value={`${stats.busiestFormatted} (${stats.busiestCount})`}
            valueColor="#B45309"
          />
        </div>
      )}

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

// Stat item for the summary bar
function StatItem({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
      {label}: <span style={{ fontWeight: 600, color: valueColor || 'var(--text-primary)' }}>{value}</span>
    </span>
  )
}
