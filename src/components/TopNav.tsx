'use client'

import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'

interface TopNavProps {
  user: User
  darkMode: boolean
  toggleDarkMode: () => void
  onSignOut: () => void
  openAiDrawer: (tab: string) => void
  onOpenSettings: () => void
  onOpenIdeas: () => void
}

// Sample notifications data
const SAMPLE_NOTIFICATIONS = [
  { id: '1', type: 'alert', title: 'Critical Lab Result', message: 'John Smith - Sodium 128 mEq/L (critical low)', time: '5 min ago', read: false },
  { id: '2', type: 'message', title: 'New Message', message: 'Dr. Jones: Can you review the EEG for Room 302?', time: '15 min ago', read: false },
  { id: '3', type: 'task', title: 'Task Complete', message: 'Chart prep finished for Sarah Johnson', time: '1 hour ago', read: true },
  { id: '4', type: 'system', title: 'System Update', message: 'New NIHSS scale scoring available', time: '2 hours ago', read: true },
]

// Sample what's new items
const WHATS_NEW_ITEMS = [
  { version: '1.4.0', date: 'Jan 24, 2026', title: 'Comprehensive Note Generation', description: 'New Consult vs Follow-up layouts, note length preferences, and one-click copy to EHR.' },
  { version: '1.3.0', date: 'Jan 23, 2026', title: 'Smart Recommendations', description: 'AI-powered treatment recommendations based on diagnosis selection.' },
  { version: '1.2.0', date: 'Jan 22, 2026', title: 'Extended Clinical Scales', description: 'Added NIHSS, Modified Ashworth, ABCD2, DHI, and more scales.' },
  { version: '1.1.0', date: 'Jan 20, 2026', title: 'Voice & AI Drawer Split', description: 'Separate drawers for voice dictation and AI assistance features.' },
]

// Billing codes for timer
const BILLING_CODES = [
  { code: 'MD2', label: 'MD2 - Subsequent Hospital Care (20-35 min)', color: '#0D9488' },
  { code: 'MD3', label: 'MD3 - Subsequent Hospital Care (35+ min)', color: '#7C3AED' },
  { code: '99213', label: '99213 - Office Visit (15-29 min)', color: '#3B82F6' },
  { code: '99214', label: '99214 - Office Visit (30-44 min)', color: '#F59E0B' },
  { code: '99215', label: '99215 - Office Visit (45+ min)', color: '#EF4444' },
]

export default function TopNav({ user, darkMode, toggleDarkMode, onSignOut, openAiDrawer, onOpenSettings, onOpenIdeas }: TopNavProps) {
  const [aiMenuOpen, setAiMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [activeQueue, setActiveQueue] = useState('outpatient')
  const [timer, setTimer] = useState({ hours: 0, minutes: 0, seconds: 0 })

  // New state for TopNav elements
  const [timerMenuOpen, setTimerMenuOpen] = useState(false)
  const [timerRunning, setTimerRunning] = useState(true)
  const [selectedBillingCode, setSelectedBillingCode] = useState(BILLING_CODES[0])
  const [lockScreenOpen, setLockScreenOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState(SAMPLE_NOTIFICATIONS)
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)

  // Timer effect
  useEffect(() => {
    if (!timerRunning) return

    const interval = setInterval(() => {
      setTimer(prev => {
        let { hours, minutes, seconds } = prev
        seconds++
        if (seconds >= 60) {
          seconds = 0
          minutes++
        }
        if (minutes >= 60) {
          minutes = 0
          hours++
        }
        return { hours, minutes, seconds }
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [timerRunning])

  const formatTime = () => {
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${pad(timer.hours)}:${pad(timer.minutes)}:${pad(timer.seconds)}`
  }

  const resetTimer = () => {
    setTimer({ hours: 0, minutes: 0, seconds: 0 })
  }

  const toggleTimer = () => {
    setTimerRunning(!timerRunning)
  }

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const unreadCount = notifications.filter(n => !n.read).length

  const queues = [
    { id: 'acute', label: 'Acute Care', count: 0 },
    { id: 'rounding', label: 'Rounding', count: 0 },
    { id: 'eeg', label: 'EEG', count: 0 },
    { id: 'outpatient', label: 'Outpatient', count: 1 },
  ]

  // Close all dropdowns when clicking outside
  const closeAllDropdowns = () => {
    setTimerMenuOpen(false)
    setNotificationsOpen(false)
    setWhatsNewOpen(false)
    setAiMenuOpen(false)
    setUserMenuOpen(false)
  }

  return (
    <>
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        background: 'var(--bg-white)',
        borderBottom: '1px solid var(--border)',
        gap: '16px',
      }}>
        {/* Left Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Logo - Opens Ideas/Getting Started drawer */}
          <button
            onClick={onOpenIdeas}
            title="Getting Started - Workflows, Tour, Features"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
          >
            <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="20" fill="#0D9488"/>
              <path d="M20 8c-2.5 0-4.5 1-5.5 2.5C13.5 12 13 14 13 16c0 2.5 1 4.5 2.5 6 1 1 1.5 2.5 1.5 4v2h6v-2c0-1.5.5-3 1.5-4 1.5-1.5 2.5-3.5 2.5-6 0-2-.5-4-1.5-5.5C24.5 9 22.5 8 20 8z" fill="white"/>
              <path d="M17 30h6v2h-6v-2z" fill="white"/>
              <circle cx="20" cy="16" r="2" fill="#0D9488"/>
              <path d="M16 14c0-1 .5-2 1.5-2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M24 14c0-1-.5-2-1.5-2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>

          {/* Search */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-gray)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '8px 12px',
            width: '260px',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ marginRight: '8px', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search for patient name or MRN"
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                width: '100%',
                fontSize: '13px',
                color: 'var(--text-primary)',
              }}
            />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ marginLeft: '8px', flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>

          {/* Queue Pills */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {queues.map(queue => (
              <button
                key={queue.id}
                onClick={() => setActiveQueue(queue.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: activeQueue === queue.id ? 'none' : '1px solid var(--border)',
                  background: activeQueue === queue.id ? 'var(--text-primary)' : 'var(--bg-white)',
                  color: activeQueue === queue.id ? 'white' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {queue.label}
                <span style={{
                  fontSize: '12px',
                  color: activeQueue === queue.id ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)',
                }}>{queue.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Timer with MD2 badge - NOW WITH DROPDOWN */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { closeAllDropdowns(); setTimerMenuOpen(!timerMenuOpen); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: timerMenuOpen ? 'var(--bg-gray)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <span style={{
                background: selectedBillingCode.color,
                color: 'white',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
              }}>{selectedBillingCode.code}</span>
              <span style={{
                fontFamily: 'monospace',
                fontSize: '14px',
                color: timerRunning ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: 500,
              }}>{formatTime()}</span>
              {!timerRunning && (
                <span style={{ fontSize: '10px', color: '#F59E0B', fontWeight: 600 }}>PAUSED</span>
              )}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {/* Timer Dropdown */}
            {timerMenuOpen && (
              <>
                <div onClick={() => setTimerMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '8px',
                  width: '280px',
                  background: 'var(--bg-white)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                  zIndex: 999,
                  overflow: 'hidden',
                }}>
                  {/* Timer Display */}
                  <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '32px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {formatTime()}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {timerRunning ? 'Timer Running' : 'Timer Paused'}
                    </div>
                  </div>

                  {/* Timer Controls */}
                  <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <button
                      onClick={toggleTimer}
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: '6px',
                        border: 'none',
                        background: timerRunning ? '#FEF3C7' : '#D1FAE5',
                        color: timerRunning ? '#D97706' : '#059669',
                        fontWeight: 600,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      {timerRunning ? (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="4" width="4" height="16" rx="1" />
                            <rect x="14" y="4" width="4" height="16" rx="1" />
                          </svg>
                          Pause
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                          Resume
                        </>
                      )}
                    </button>
                    <button
                      onClick={resetTimer}
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'white',
                        color: 'var(--text-secondary)',
                        fontWeight: 500,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
                      </svg>
                      Reset
                    </button>
                  </div>

                  {/* Billing Code Selection */}
                  <div style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
                      Billing Code
                    </div>
                    {BILLING_CODES.map(code => (
                      <button
                        key={code.code}
                        onClick={() => setSelectedBillingCode(code)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          width: '100%',
                          padding: '8px 10px',
                          marginBottom: '4px',
                          borderRadius: '6px',
                          border: selectedBillingCode.code === code.code ? `2px solid ${code.color}` : '1px solid var(--border)',
                          background: selectedBillingCode.code === code.code ? `${code.color}10` : 'white',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: code.color,
                          color: 'white',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}>{code.code}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1 }}>
                          {code.label.split(' - ')[1]}
                        </span>
                        {selectedBillingCode.code === code.code && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={code.color} strokeWidth="2">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* What's New - NOW WITH PANEL */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { closeAllDropdowns(); setWhatsNewOpen(!whatsNewOpen); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: whatsNewOpen ? 'var(--bg-gray)' : 'transparent',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                fontSize: '13px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#F59E0B">
                <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/>
              </svg>
              What&apos;s New
            </button>

            {/* What's New Panel */}
            {whatsNewOpen && (
              <>
                <div onClick={() => setWhatsNewOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '8px',
                  width: '360px',
                  background: 'var(--bg-white)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                  zIndex: 999,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '16px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#F59E0B">
                      <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/>
                    </svg>
                    <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>What&apos;s New</span>
                  </div>
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {WHATS_NEW_ITEMS.map((item, index) => (
                      <div
                        key={index}
                        style={{
                          padding: '16px',
                          borderBottom: index < WHATS_NEW_ITEMS.length - 1 ? '1px solid var(--border)' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: '#D1FAE5',
                            color: '#059669',
                            fontSize: '11px',
                            fontWeight: 600,
                          }}>v{item.version}</span>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.date}</span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          {item.description}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* PHI Toggle */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '16px',
            background: 'var(--bg-gray)',
            border: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>PHI</span>
          </div>

          {/* Lock Icon - NOW WITH ACTION */}
          <button
            onClick={() => setLockScreenOpen(true)}
            title="Lock Screen"
            style={{
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              background: 'transparent',
              border: 'none',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </button>

          {/* Notification - NOW WITH DROPDOWN */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { closeAllDropdowns(); setNotificationsOpen(!notificationsOpen); }}
              style={{
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                background: notificationsOpen ? 'var(--bg-gray)' : 'transparent',
                border: 'none',
                position: 'relative',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  minWidth: '16px',
                  height: '16px',
                  background: 'var(--error)',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '10px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                }}>{unreadCount}</span>
              )}
            </button>

            {/* Notifications Panel */}
            {notificationsOpen && (
              <>
                <div onClick={() => setNotificationsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '8px',
                  width: '380px',
                  background: 'var(--bg-white)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                  zIndex: 999,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '16px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2">
                        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
                      </svg>
                      <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>Notifications</span>
                      {unreadCount > 0 && (
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '10px',
                          background: 'var(--error)',
                          color: 'white',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}>{unreadCount} new</span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        style={{
                          fontSize: '12px',
                          color: 'var(--primary)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontWeight: 500,
                        }}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {notifications.map(notification => (
                      <div
                        key={notification.id}
                        onClick={() => markNotificationRead(notification.id)}
                        style={{
                          padding: '14px 16px',
                          borderBottom: '1px solid var(--border)',
                          background: notification.read ? 'transparent' : 'rgba(13, 148, 136, 0.05)',
                          cursor: 'pointer',
                          display: 'flex',
                          gap: '12px',
                        }}
                      >
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          background: notification.type === 'alert' ? '#FEE2E2' :
                                     notification.type === 'message' ? '#DBEAFE' :
                                     notification.type === 'task' ? '#D1FAE5' : '#F3F4F6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {notification.type === 'alert' && (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
                              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                          )}
                          {notification.type === 'message' && (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2">
                              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                            </svg>
                          )}
                          {notification.type === 'task' && (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2">
                              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                            </svg>
                          )}
                          {notification.type === 'system' && (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2">
                              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                            </svg>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <span style={{
                              fontWeight: 600,
                              fontSize: '13px',
                              color: 'var(--text-primary)',
                            }}>{notification.title}</span>
                            {!notification.read && (
                              <span style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: 'var(--primary)',
                              }} />
                            )}
                          </div>
                          <div style={{
                            fontSize: '13px',
                            color: 'var(--text-secondary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>{notification.message}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {notification.time}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Dark Mode */}
          <button
            onClick={toggleDarkMode}
            style={{
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              background: 'transparent',
              border: 'none',
            }}
          >
            {darkMode ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
              </svg>
            )}
          </button>

          {/* AI Launcher */}
          <div className="ai-launcher-container">
            <button
              onClick={() => setAiMenuOpen(!aiMenuOpen)}
              className="ai-launcher-btn"
              title="AI Tools"
              style={{
                background: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
                border: 'none',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
              }}
            >
              {/* 4-pointed sparkle icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/>
                <circle cx="19" cy="5" r="1.5" fill="white" opacity="0.8"/>
                <circle cx="5" cy="19" r="1" fill="white" opacity="0.6"/>
              </svg>
            </button>
            {aiMenuOpen && (
              <div className="ai-launcher-menu show">
                <div className="ai-launcher-menu-header">
                  <h4>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#F59E0B">
                      <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/>
                    </svg>
                    AI Tools
                  </h4>
                </div>
                <div className="ai-launcher-menu-item" onClick={() => { openAiDrawer('chart-prep'); setAiMenuOpen(false); }}>
                  <div className="ai-launcher-menu-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>
                    </svg>
                  </div>
                  <div className="ai-launcher-menu-text">
                    <h5>Chart Prep</h5>
                    <p>AI-generated visit summary</p>
                  </div>
                </div>
                <div className="ai-launcher-menu-item" onClick={() => { openAiDrawer('document'); setAiMenuOpen(false); }}>
                  <div className="ai-launcher-menu-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </div>
                  <div className="ai-launcher-menu-text">
                    <h5>Document</h5>
                    <p>Transcribe and document visit</p>
                  </div>
                </div>
                <div className="ai-launcher-menu-item" onClick={() => { openAiDrawer('ask'); setAiMenuOpen(false); }}>
                  <div className="ai-launcher-menu-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                    </svg>
                  </div>
                  <div className="ai-launcher-menu-text">
                    <h5>Ask AI</h5>
                    <p>Query clinical guidelines</p>
                  </div>
                </div>
                <div className="ai-launcher-menu-item" onClick={() => { openAiDrawer('summary'); setAiMenuOpen(false); }}>
                  <div className="ai-launcher-menu-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                  <div className="ai-launcher-menu-text">
                    <h5>Patient Summary</h5>
                    <p>Plain-language explanation</p>
                  </div>
                </div>
                <div className="ai-launcher-menu-item" onClick={() => { openAiDrawer('handout'); setAiMenuOpen(false); }}>
                  <div className="ai-launcher-menu-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 01-8 0"/>
                    </svg>
                  </div>
                  <div className="ai-launcher-menu-text">
                    <h5>Patient Handout</h5>
                    <p>Generate take-home materials</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* User Avatar with dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer',
              }}
              title="User menu"
            >
              {user.email?.charAt(0).toUpperCase() || 'U'}
            </button>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ position: 'absolute', bottom: '-2px', right: '-4px' }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>

            {/* User Menu Dropdown */}
            {userMenuOpen && (
              <>
                <div
                  onClick={() => setUserMenuOpen(false)}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 998,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '8px',
                    width: '220px',
                    background: 'var(--bg-white)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    zIndex: 999,
                    overflow: 'hidden',
                  }}
                >
                  {/* User Info */}
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {user.email?.split('@')[0] || 'User'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {user.email}
                    </div>
                  </div>

                  {/* Menu Items */}
                  <div style={{ padding: '6px' }}>
                    <button
                      onClick={() => {
                        setUserMenuOpen(false)
                        onOpenSettings()
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        width: '100%',
                        padding: '10px 12px',
                        background: 'none',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-gray)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                      </svg>
                      Settings
                    </button>

                    <div style={{ height: '1px', background: 'var(--border)', margin: '6px 0' }} />

                    <button
                      onClick={() => {
                        setUserMenuOpen(false)
                        onSignOut()
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        width: '100%',
                        padding: '10px 12px',
                        background: 'none',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        color: 'var(--error)',
                        fontSize: '13px',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-gray)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                      </svg>
                      Sign Out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Lock Screen Modal */}
      {lockScreenOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }}>
          <div style={{
            textAlign: 'center',
            color: 'white',
          }}>
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" style={{ marginBottom: '24px' }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            <h2 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>Screen Locked</h2>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', marginBottom: '32px' }}>
              PHI protection enabled. Click unlock to continue.
            </p>
            <button
              onClick={() => setLockScreenOpen(false)}
              style={{
                padding: '14px 48px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--primary)',
                color: 'white',
                fontSize: '16px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                margin: '0 auto',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              Unlock Screen
            </button>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '24px' }}>
              Session will timeout after 15 minutes of inactivity
            </p>
          </div>
        </div>
      )}
    </>
  )
}
