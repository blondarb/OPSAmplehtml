'use client'

import { useState } from 'react'
import ScheduleColumn from './home/ScheduleColumn'
import NotificationFeed from './home/NotificationFeed'
import MorningBriefing from './command-center/MorningBriefing'

interface PhysicianHomeProps {
  onSelectPatient: (appointmentId: string) => void
  onScheduleNew: () => void
  onScheduleFollowup: () => void
}

export default function PhysicianHome({ onSelectPatient, onScheduleNew, onScheduleFollowup }: PhysicianHomeProps) {
  const [activeFilter, setActiveFilter] = useState('all')

  const today = new Date()
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const handleNotifAction = (notifId: string, action: string) => {
    // In production: call API to update notification status
    console.log(`Notification ${notifId}: ${action}`)
  }

  const handleNavigateToPatient = (notifId: string) => {
    // In production: look up patient from notification and navigate
    console.log(`Navigate to patient for notification ${notifId}`)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-white)' }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Clinical Cockpit
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            {dateStr}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '12px', fontWeight: 600, color: '#10B981',
            padding: '4px 10px', borderRadius: '20px',
            background: '#D1FAE5',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
            Online
          </span>
        </div>
      </div>

      {/* Three-column layout: Schedule | Morning Briefing | Notifications */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <ScheduleColumn
          onSelectPatient={onSelectPatient}
          onScheduleNew={onScheduleNew}
          onScheduleFollowup={onScheduleFollowup}
        />
        <div style={{
          flex: 1,
          borderLeft: '1px solid var(--border)',
          borderRight: '1px solid var(--border)',
          overflow: 'auto',
          padding: '16px',
          background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
        }}>
          <MorningBriefing viewMode="my_patients" timeRange="today" />
        </div>
        <NotificationFeed
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          onAction={handleNotifAction}
          onNavigateToPatient={handleNavigateToPatient}
        />
      </div>
    </div>
  )
}
