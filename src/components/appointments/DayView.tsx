'use client'

import { useState } from 'react'
import type { Appointment } from './appointmentUtils'
import {
  formatTime,
  formatType,
  getReasonColor,
  getShortReason,
  isFollowUpType,
  isNewConsultType,
} from './appointmentUtils'
import AppointmentPopover, { useHoverPopover } from './AppointmentPopover'

interface DayViewProps {
  appointments: Appointment[]
  onSelectPatient: (appointment: Appointment) => void
  onRefresh?: () => void
}

export default function DayView({ appointments, onSelectPatient, onRefresh }: DayViewProps) {
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const { hoveredId, anchorRect, onEnter, onLeave, onPopoverEnter, onPopoverLeave } = useHoverPopover()

  // Cancel / Reschedule modals
  const [cancelModal, setCancelModal] = useState<Appointment | null>(null)
  const [rescheduleModal, setRescheduleModal] = useState<Appointment | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const handleCancel = async () => {
    if (!cancelModal) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/appointments/${cancelModal.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to cancel')
      setCancelModal(null)
      onRefresh?.()
    } catch (e) {
      console.error('Cancel failed:', e)
      alert('Failed to cancel appointment')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReschedule = async () => {
    if (!rescheduleModal || !rescheduleDate || !rescheduleTime) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/appointments/${rescheduleModal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentDate: rescheduleDate, appointmentTime: rescheduleTime }),
      })
      if (!res.ok) throw new Error('Failed to reschedule')
      setRescheduleModal(null)
      setRescheduleDate('')
      setRescheduleTime('')
      onRefresh?.()
    } catch (e) {
      console.error('Reschedule failed:', e)
      alert('Failed to reschedule appointment')
    } finally {
      setActionLoading(false)
    }
  }

  // Sort appointments
  const sortedAppointments = [...appointments].sort((a, b) => {
    return sortOrder === 'asc'
      ? a.appointmentTime.localeCompare(b.appointmentTime)
      : b.appointmentTime.localeCompare(a.appointmentTime)
  })

  const hoveredAppointment = hoveredId ? sortedAppointments.find(a => a.id === hoveredId) : null

  return (
    <>
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
        {sortedAppointments.length === 0 ? (
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
            <p style={{ fontSize: '12px' }}>No appointments scheduled for this date</p>
          </div>
        ) : (
          sortedAppointments.map((appointment, index) => {
            const reasonColor = getReasonColor(appointment.reasonForVisit)
            const shortReason = getShortReason(appointment.reasonForVisit)
            const isHovered = hoveredId === appointment.id

            return (
              <div
                key={appointment.id}
                onClick={() => onSelectPatient(appointment)}
                style={{
                  position: 'relative',
                  display: 'grid',
                  gridTemplateColumns: '120px 120px 200px 140px 160px 140px 50px',
                  gap: '16px',
                  padding: '16px',
                  borderBottom: index < sortedAppointments.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                  background: isHovered ? 'var(--bg-gray)' : 'transparent',
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

                {/* Reason for Visit - hover triggers popover */}
                <div
                  onMouseEnter={(e) => onEnter(appointment.id, e.currentTarget)}
                  onMouseLeave={onLeave}
                  style={{ display: 'inline-block' }}
                >
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
                  <StatusBadge status={appointment.status} />
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
                        onClick={(e) => { e.stopPropagation(); setMenuOpenId(null) }}
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
                        <MenuButton
                          label="Open Chart"
                          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>}
                          onClick={() => { onSelectPatient(appointment); setMenuOpenId(null) }}
                        />
                        <MenuButton
                          label="Reschedule"
                          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /></svg>}
                          onClick={() => {
                            setRescheduleModal(appointment)
                            setRescheduleDate(appointment.appointmentDate)
                            setRescheduleTime(appointment.appointmentTime)
                            setMenuOpenId(null)
                          }}
                        />
                        <MenuButton
                          label="Cancel"
                          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>}
                          onClick={() => { setCancelModal(appointment); setMenuOpenId(null) }}
                          danger
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Quick Actions - Launch EPIC / PACS (shown on row hover) */}
                {isHovered && (
                  <div
                    onMouseEnter={onPopoverEnter}
                    onMouseLeave={onPopoverLeave}
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
                    <QuickActionButton label="Launch EPIC" />
                    <QuickActionButton label="Launch PACS" />
                  </div>
                )}
              </div>
            )
          })
        )}
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

      {/* Cancel Confirmation Modal */}
      {cancelModal && (
        <>
          <div onClick={() => setCancelModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--bg-white)', borderRadius: '12px', padding: '24px', width: '380px', maxWidth: '90vw',
            zIndex: 2001, boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Cancel Appointment?
            </h3>
            <p style={{ margin: '0 0 4px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <strong>{cancelModal.patient?.firstName} {cancelModal.patient?.lastName}</strong>
            </p>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
              {formatTime(cancelModal.appointmentDate, cancelModal.appointmentTime)} &middot; {formatType(cancelModal.appointmentType)}
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setCancelModal(null)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-white)', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}
              >
                Keep
              </button>
              <button
                onClick={handleCancel}
                disabled={actionLoading}
                style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#DC2626', color: 'white', fontSize: '13px', fontWeight: 600, cursor: actionLoading ? 'wait' : 'pointer', opacity: actionLoading ? 0.7 : 1 }}
              >
                {actionLoading ? 'Cancelling...' : 'Cancel Appointment'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Reschedule Modal */}
      {rescheduleModal && (
        <>
          <div onClick={() => { setRescheduleModal(null); setRescheduleDate(''); setRescheduleTime('') }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--bg-white)', borderRadius: '12px', padding: '24px', width: '380px', maxWidth: '90vw',
            zIndex: 2001, boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Reschedule Appointment
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <strong>{rescheduleModal.patient?.firstName} {rescheduleModal.patient?.lastName}</strong> &middot; {formatType(rescheduleModal.appointmentType)}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Date</label>
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-white)', color: 'var(--text-primary)', fontSize: '13px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Time</label>
                <input
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-white)', color: 'var(--text-primary)', fontSize: '13px' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setRescheduleModal(null); setRescheduleDate(''); setRescheduleTime('') }}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-white)', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleReschedule}
                disabled={actionLoading || !rescheduleDate || !rescheduleTime}
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600,
                  background: rescheduleDate && rescheduleTime && !actionLoading ? 'var(--primary)' : 'var(--bg-gray)',
                  color: rescheduleDate && rescheduleTime && !actionLoading ? 'white' : 'var(--text-muted)',
                  cursor: actionLoading ? 'wait' : 'pointer',
                }}
              >
                {actionLoading ? 'Saving...' : 'Reschedule'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    confirmed: {
      color: '#059669',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>,
      label: 'Confirmed',
    },
    scheduled: {
      color: '#059669',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>,
      label: 'Scheduled',
    },
    'in-progress': {
      color: '#3B82F6',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
      label: 'In Progress',
    },
    completed: {
      color: '#6B7280',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
      label: 'Completed',
    },
    cancelled: {
      color: '#DC2626',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>,
      label: 'Cancelled',
    },
  }

  const config = configs[status] || configs.scheduled
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      color: config.color,
      fontSize: '13px',
      fontWeight: 500,
    }}>
      {config.icon}
      {config.label}
    </span>
  )
}

// Menu button helper
function MenuButton({ label, icon, onClick, danger }: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
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
        color: danger ? '#DC2626' : 'var(--text-primary)',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = danger ? '#FEE2E2' : 'var(--bg-gray)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      {icon}
      {label}
    </button>
  )
}

// Quick action button helper
function QuickActionButton({ label }: { label: string }) {
  return (
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
      {label}
    </button>
  )
}
