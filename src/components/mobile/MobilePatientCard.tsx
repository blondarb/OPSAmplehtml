'use client'

import { useState } from 'react'

interface Patient {
  id: string
  name: string
  age: number
  gender: string
  mrn: string
  reason?: string
  time?: string
  type?: 'new' | 'follow-up'
  status?: 'scheduled' | 'in-progress' | 'completed'
}

interface MobilePatientCardProps {
  patient: Patient
  onClick: () => void
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
}

export default function MobilePatientCard({
  patient,
  onClick,
  onSwipeLeft,
  onSwipeRight,
}: MobilePatientCardProps) {
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)

  const minSwipeDistance = 50

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const current = e.targetTouches[0].clientX
    setTouchEnd(current)
    if (touchStart) {
      const diff = current - touchStart
      // Limit the swipe offset
      setSwipeOffset(Math.max(-100, Math.min(100, diff)))
    }
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) {
      setSwipeOffset(0)
      return
    }
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe && onSwipeLeft) {
      onSwipeLeft()
    } else if (isRightSwipe && onSwipeRight) {
      onSwipeRight()
    }

    setSwipeOffset(0)
    setTouchStart(null)
    setTouchEnd(null)
  }

  const statusColors = {
    'scheduled': { bg: '#DCFCE7', text: '#16A34A' },
    'in-progress': { bg: '#FEF3C7', text: '#D97706' },
    'completed': { bg: '#E5E7EB', text: '#6B7280' },
  }

  const typeColors = {
    'new': { bg: '#DBEAFE', text: '#2563EB' },
    'follow-up': { bg: '#F3E8FF', text: '#9333EA' },
  }

  const status = statusColors[patient.status || 'scheduled']
  const type = typeColors[patient.type || 'follow-up']

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '16px',
        marginBottom: '12px',
      }}
    >
      {/* Swipe action backgrounds */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
      }}>
        {/* Left action (swipe right to reveal) */}
        <div style={{
          width: '50%',
          background: '#10B981',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: '20px',
          color: 'white',
          fontWeight: 600,
          fontSize: '14px',
          gap: '8px',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          Check In
        </div>
        {/* Right action (swipe left to reveal) */}
        <div style={{
          width: '50%',
          background: '#EF4444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: '20px',
          color: 'white',
          fontWeight: 600,
          fontSize: '14px',
          gap: '8px',
        }}>
          Cancel
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
      </div>

      {/* Card content */}
      <div
        onClick={onClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          background: 'var(--bg-white)',
          padding: '16px',
          cursor: 'pointer',
          transform: `translateX(${swipeOffset}px)`,
          transition: swipeOffset === 0 ? 'transform 0.3s ease-out' : 'none',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Top row: Time and badges */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}>
          <span style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-muted)',
          }}>
            {patient.time || '9:00 AM'}
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{
              padding: '4px 8px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 600,
              background: type.bg,
              color: type.text,
            }}>
              {patient.type === 'new' ? 'New' : 'Follow-up'}
            </span>
            <span style={{
              padding: '4px 8px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 600,
              background: status.bg,
              color: status.text,
            }}>
              {patient.status === 'in-progress' ? 'In Progress' : patient.status === 'completed' ? 'Done' : 'Scheduled'}
            </span>
          </div>
        </div>

        {/* Patient name and details */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          {/* Avatar */}
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '18px',
            fontWeight: 600,
            flexShrink: 0,
          }}>
            {patient.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '2px',
            }}>
              {patient.name}
            </div>
            <div style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
            }}>
              {patient.age}yo {patient.gender} · MRN: {patient.mrn}
            </div>
            {patient.reason && (
              <div style={{
                fontSize: '13px',
                color: 'var(--primary)',
                fontWeight: 500,
                marginTop: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
                {patient.reason}
              </div>
            )}
          </div>

          {/* Chevron */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="2"
            style={{ flexShrink: 0 }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>
    </div>
  )
}
