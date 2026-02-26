'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bell, X } from 'lucide-react'
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
  const [drawerOpen, setDrawerOpen] = useState(false)

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawerOpen) {
        closeDrawer()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [drawerOpen, closeDrawer])

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

  // Badge shows count of critical + high priority notifications
  const notificationCount = 4 // Matches critical/high items in demo data

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
          {/* Notification bell */}
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            style={{
              position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '36px', height: '36px', borderRadius: '8px',
              background: drawerOpen ? '#F0FDFA' : 'transparent',
              border: drawerOpen ? '1px solid #99F6E4' : '1px solid transparent',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
            aria-label="Toggle notifications"
          >
            <Bell size={18} color={drawerOpen ? '#0D9488' : '#6B7280'} />
            {notificationCount > 0 && (
              <span style={{
                position: 'absolute', top: '4px', right: '4px',
                minWidth: '16px', height: '16px', borderRadius: '8px',
                background: '#EF4444', color: 'white',
                fontSize: '10px', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px',
                lineHeight: 1,
              }}>
                {notificationCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Two-column layout: Schedule | Morning Briefing + Notification Drawer overlay */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <ScheduleColumn
          onSelectPatient={onSelectPatient}
          onScheduleNew={onScheduleNew}
          onScheduleFollowup={onScheduleFollowup}
          onPrepPatient={(id) => onSelectPatient(id)}
        />
        <div style={{
          flex: 1,
          borderLeft: '1px solid var(--border)',
          overflow: 'auto',
          padding: '16px',
          background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
        }}>
          <MorningBriefing viewMode="my_patients" timeRange="today" />
        </div>

        {/* Backdrop overlay */}
        {drawerOpen && (
          <button
            onClick={closeDrawer}
            aria-label="Close notifications panel"
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.15)',
              zIndex: 10,
              border: 'none', cursor: 'default',
            }}
          />
        )}

        {/* Notification drawer */}
        <div
          aria-hidden={!drawerOpen}
          style={{
            position: 'absolute', top: 0, right: 0, bottom: 0,
            width: '380px',
            transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 300ms ease',
            background: 'var(--bg-white)',
            borderLeft: '1px solid var(--border)',
            boxShadow: drawerOpen ? '-4px 0 16px rgba(0,0,0,0.08)' : 'none',
            zIndex: 11,
            display: 'flex', flexDirection: 'column',
          }}
        >
          {/* Drawer header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Notifications
            </span>
            <button
              onClick={closeDrawer}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '28px', height: '28px', borderRadius: '6px',
                background: 'transparent', border: 'none', cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              aria-label="Close notifications"
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-gray)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <X size={16} color="var(--text-muted)" />
            </button>
          </div>
          {/* Drawer content */}
          <NotificationFeed
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            onAction={handleNotifAction}
            onNavigateToPatient={handleNavigateToPatient}
          />
        </div>
      </div>
    </div>
  )
}
