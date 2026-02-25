'use client'

import { useState } from 'react'

interface ScheduleColumnProps {
  onSelectPatient: (appointmentId: string) => void
  onScheduleNew: () => void
  onScheduleFollowup: () => void
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

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

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

export default function ScheduleColumn({ onSelectPatient, onScheduleNew, onScheduleFollowup }: ScheduleColumnProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const today = new Date()
  const todayDayIndex = Math.min(today.getDay() - 1, 4) // Mon=0..Fri=4

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      borderRight: '1px solid var(--border)', background: 'var(--bg-white)',
      minWidth: '260px', maxWidth: '320px', width: '280px',
    }}>
      {/* Week strip */}
      <div style={{
        display: 'flex', gap: '4px', padding: '12px 16px 8px',
        borderBottom: '1px solid var(--border)',
      }}>
        {WEEKDAYS.map((day, i) => (
          <div key={day} style={{
            flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: '8px',
            fontSize: '12px', fontWeight: 600,
            background: i === todayDayIndex ? '#0D9488' : 'transparent',
            color: i === todayDayIndex ? 'white' : 'var(--text-muted)',
            cursor: 'pointer', transition: 'all 0.2s',
          }}>
            <div>{day}</div>
            <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px' }}>
              {today.getDate() - todayDayIndex + i}
            </div>
          </div>
        ))}
      </div>

      {/* Today label */}
      <div style={{ padding: '12px 16px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Today &middot; {DEMO_APPOINTMENTS.length} patients
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
            }}
          >
            {/* Top row: time + name + prep dot */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', minWidth: '60px' }}>
                {apt.time}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                {apt.name}
              </span>
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
