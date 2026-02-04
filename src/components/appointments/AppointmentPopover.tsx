'use client'

import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Appointment } from './appointmentUtils'
import { isFollowUpType, isNewConsultType } from './appointmentUtils'

interface AppointmentPopoverProps {
  appointment: Appointment
  anchorRect: DOMRect | null
  onMouseEnter: () => void
  onMouseLeave: () => void
}

export default function AppointmentPopover({
  appointment,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
}: AppointmentPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || !anchorRect) return null

  const isFollowUp = isFollowUpType(appointment.appointmentType)
  const isNewConsult = isNewConsultType(appointment.appointmentType)

  // No popover content for non-follow-up, non-new-consult
  if (!isFollowUp && !isNewConsult) return null
  // Follow-ups need a prior visit with AI summary to show
  if (isFollowUp && !appointment.priorVisit) return null

  // Calculate position - prefer right of anchor, flip to left if needed
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200
  const popoverWidth = isFollowUp ? 460 : 420
  let left = anchorRect.right + 8
  let top = anchorRect.top

  // Flip to left if overflowing right edge
  if (left + popoverWidth > viewportWidth - 20) {
    left = anchorRect.left - popoverWidth - 8
  }

  // Clamp to top of viewport
  if (top < 20) top = 20

  // Clamp to bottom of viewport
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800
  const maxHeight = isFollowUp ? 350 : 320
  if (top + maxHeight > viewportHeight - 20) {
    top = viewportHeight - maxHeight - 20
  }

  const content = isNewConsult ? (
    <NewConsultPopover appointment={appointment} />
  ) : (
    <FollowUpPopover appointment={appointment} />
  )

  return createPortal(
    <div
      ref={popoverRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 9999,
      }}
    >
      {content}
    </div>,
    document.body,
  )
}

// Referral Note popover for New Consults
function NewConsultPopover({ appointment }: { appointment: Appointment }) {
  return (
    <div
      style={{
        width: '420px',
        maxHeight: '320px',
        overflow: 'auto',
        background: 'var(--bg-white)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        padding: '20px 24px',
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
  )
}

// AI Visit Summary popover for Follow-ups
function FollowUpPopover({ appointment }: { appointment: Appointment }) {
  if (!appointment.priorVisit) return null

  return (
    <div
      style={{
        width: '460px',
        maxHeight: '350px',
        overflow: 'auto',
        background: 'var(--bg-white)',
        border: '1px solid #BFDBFE',
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        padding: '20px 24px',
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
  )
}

// Shared hook for hover popover management
export function useHoverPopover(enterDelay = 300, leaveDelay = 200) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const onEnter = (id: string, element: HTMLElement) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setHoveredId(id)
      setAnchorRect(element.getBoundingClientRect())
    }, enterDelay)
  }

  const onLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setHoveredId(null)
      setAnchorRect(null)
    }, leaveDelay)
  }

  const onPopoverEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }

  const onPopoverLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setHoveredId(null)
      setAnchorRect(null)
    }, leaveDelay)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return { hoveredId, anchorRect, onEnter, onLeave, onPopoverEnter, onPopoverLeave }
}
