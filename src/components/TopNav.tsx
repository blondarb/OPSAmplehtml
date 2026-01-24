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
}

export default function TopNav({ user, darkMode, toggleDarkMode, onSignOut, openAiDrawer, onOpenSettings }: TopNavProps) {
  const [aiMenuOpen, setAiMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [activeQueue, setActiveQueue] = useState('rounding')
  const [timer, setTimer] = useState({ hours: 0, minutes: 0, seconds: 0 })

  // Timer effect
  useEffect(() => {
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
  }, [])

  const formatTime = () => {
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${pad(timer.hours)}:${pad(timer.minutes)}:${pad(timer.seconds)}`
  }

  const queues = [
    { id: 'acute', label: 'Acute Care', count: 0 },
    { id: 'rounding', label: 'Rounding', count: 0 },
    { id: 'eeg', label: 'EEG', count: 0 },
  ]

  return (
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
        {/* Logo - Links to original prototype wireframe */}
        <a
          href="/prototype.html"
          target="_blank"
          rel="noopener noreferrer"
          title="View original prototype wireframe"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
        >
          <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="20" fill="#0D9488"/>
            <path d="M20 8c-2.5 0-4.5 1-5.5 2.5C13.5 12 13 14 13 16c0 2.5 1 4.5 2.5 6 1 1 1.5 2.5 1.5 4v2h6v-2c0-1.5.5-3 1.5-4 1.5-1.5 2.5-3.5 2.5-6 0-2-.5-4-1.5-5.5C24.5 9 22.5 8 20 8z" fill="white"/>
            <path d="M17 30h6v2h-6v-2z" fill="white"/>
            <circle cx="20" cy="16" r="2" fill="#0D9488"/>
            <path d="M16 14c0-1 .5-2 1.5-2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M24 14c0-1-.5-2-1.5-2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </a>

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
        {/* Timer with MD2 badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            background: 'var(--primary)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 600,
          }}>MD2</span>
          <span style={{
            fontFamily: 'monospace',
            fontSize: '14px',
            color: 'var(--text-primary)',
            fontWeight: 500,
          }}>{formatTime()}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>

        {/* What's New */}
        <button style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '6px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          fontSize: '13px',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#F59E0B" stroke="#F59E0B" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          What&apos;s New
        </button>

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

        {/* Lock Icon */}
        <button style={{
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
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        </button>

        {/* Notification */}
        <button style={{
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
          position: 'relative',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
          <span style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            width: '8px',
            height: '8px',
            background: 'var(--error)',
            borderRadius: '50%',
          }}/>
        </button>

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
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
          {aiMenuOpen && (
            <div className="ai-launcher-menu show">
              <div className="ai-launcher-menu-header">
                <h4>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
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
  )
}
