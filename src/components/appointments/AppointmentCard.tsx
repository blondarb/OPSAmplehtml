'use client'

import { useRef } from 'react'
import type { Appointment } from './appointmentUtils'
import {
  formatShortTime,
  getReasonColor,
  getShortReason,
  formatType,
  TYPE_BORDER_COLORS,
} from './appointmentUtils'

interface AppointmentCardProps {
  appointment: Appointment
  onClick: (appointment: Appointment) => void
  onMouseEnter: (id: string, element: HTMLElement) => void
  onMouseLeave: () => void
  isHovered: boolean
  compact?: boolean // For month view mini lines
}

export default function AppointmentCard({
  appointment,
  onClick,
  onMouseEnter,
  onMouseLeave,
  isHovered,
  compact = false,
}: AppointmentCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const reasonColor = getReasonColor(appointment.reasonForVisit)
  const shortReason = getShortReason(appointment.reasonForVisit)
  const borderColor = TYPE_BORDER_COLORS[appointment.appointmentType] || '#D1D5DB'
  const timeStr = formatShortTime(appointment.appointmentTime)

  // Status indicator
  const getStatusIndicator = () => {
    switch (appointment.status) {
      case 'confirmed':
      case 'scheduled':
        return { color: '#059669', icon: '✓', label: appointment.status === 'scheduled' ? 'Sched' : 'Conf' }
      case 'in-progress':
        return { color: '#3B82F6', icon: '●', label: 'In Prog' }
      case 'completed':
        return { color: '#6B7280', icon: '✓', label: 'Done' }
      case 'cancelled':
        return { color: '#DC2626', icon: '✕', label: 'Cancel' }
      default:
        return { color: '#6B7280', icon: '', label: appointment.status }
    }
  }

  const status = getStatusIndicator()

  // Compact mode for month view mini lines
  if (compact) {
    return (
      <div
        ref={cardRef}
        onClick={(e) => { e.stopPropagation(); onClick(appointment) }}
        onMouseEnter={() => cardRef.current && onMouseEnter(appointment.id, cardRef.current)}
        onMouseLeave={onMouseLeave}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 4px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '11px',
          lineHeight: '1.3',
          background: isHovered ? 'var(--bg-gray)' : 'transparent',
          transition: 'background 0.1s ease',
        }}
      >
        <span style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: borderColor,
          flexShrink: 0,
        }} />
        <span style={{ color: 'var(--text-muted)', fontWeight: 500, flexShrink: 0 }}>
          {timeStr}
        </span>
        <span style={{
          color: 'var(--text-primary)',
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {appointment.patient?.lastName || 'Unknown'}
        </span>
      </div>
    )
  }

  // Full card for week view
  return (
    <div
      ref={cardRef}
      onClick={() => onClick(appointment)}
      onMouseEnter={() => cardRef.current && onMouseEnter(appointment.id, cardRef.current)}
      onMouseLeave={onMouseLeave}
      style={{
        background: isHovered ? 'var(--bg-gray)' : 'var(--bg-white)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: '8px',
        padding: '8px 10px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        boxShadow: isHovered ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
      }}
    >
      {/* Time */}
      <div style={{
        fontSize: '13px',
        fontWeight: 600,
        color: 'var(--text-primary)',
        marginBottom: '2px',
      }}>
        {timeStr}
      </div>

      {/* Patient Name */}
      <div style={{
        fontSize: '13px',
        fontWeight: 500,
        color: 'var(--text-primary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        marginBottom: '4px',
      }}>
        {appointment.patient?.lastName || 'Unknown'}, {appointment.patient?.firstName?.charAt(0) || '?'}
      </div>

      {/* Reason badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
        <span style={{
          display: 'inline-block',
          padding: '1px 6px',
          background: reasonColor.bg,
          color: reasonColor.text,
          border: `1px solid ${reasonColor.border}`,
          borderRadius: '10px',
          fontSize: '10px',
          fontWeight: 500,
          lineHeight: '1.4',
        }}>
          {shortReason}
        </span>
      </div>

      {/* Status + Type row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '11px',
      }}>
        <span style={{ color: status.color, fontWeight: 500 }}>
          {status.icon} {status.label}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
          {formatType(appointment.appointmentType)}
        </span>
      </div>
    </div>
  )
}
