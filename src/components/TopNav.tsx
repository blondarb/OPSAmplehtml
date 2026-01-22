'use client'

import { useState } from 'react'
import type { User } from '@supabase/supabase-js'

interface TopNavProps {
  user: User
  darkMode: boolean
  toggleDarkMode: () => void
  onSignOut: () => void
  openAiDrawer: (tab: string) => void
  openPhrasesDrawer: () => void
}

export default function TopNav({ user, darkMode, toggleDarkMode, onSignOut, openAiDrawer, openPhrasesDrawer }: TopNavProps) {
  const [aiMenuOpen, setAiMenuOpen] = useState(false)
  const [timer] = useState('00:00')

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
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
          <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>Sevaro</span>
        </div>

        {/* Search */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: 'var(--bg-gray)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '8px 12px',
          width: '280px',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ marginRight: '8px' }}>
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search patients..."
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              width: '100%',
              fontSize: '14px',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Queue Pills */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={{
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            border: 'none',
            background: 'var(--text-primary)',
            color: 'white',
          }}>
            In-Queue
          </button>
          <button style={{
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            border: '1px solid var(--border)',
            background: 'var(--bg-white)',
            color: 'var(--text-secondary)',
          }}>
            Completed
          </button>
        </div>
      </div>

      {/* Right Section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Timer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'var(--primary)',
          color: 'white',
          padding: '6px 12px',
          borderRadius: '6px',
          fontWeight: 500,
          fontSize: '13px',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          {timer}
        </div>

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
            top: '2px',
            right: '2px',
            width: '16px',
            height: '16px',
            background: 'var(--error)',
            color: 'white',
            fontSize: '10px',
            fontWeight: 600,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>2</span>
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

        {/* AI Tools */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setAiMenuOpen(!aiMenuOpen)}
            style={{
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              cursor: 'pointer',
              color: 'white',
              background: 'var(--primary)',
              border: 'none',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>

          {aiMenuOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '8px',
              width: '280px',
              background: 'var(--bg-white)',
              borderRadius: '12px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
              zIndex: 1000,
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '12px 16px',
                background: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                <span style={{ fontWeight: 600 }}>AI Tools</span>
              </div>
              {[
                { id: 'chart-prep', name: 'Chart Prep', desc: 'AI-generated visit summary', icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
                { id: 'document', name: 'Document Interaction', desc: 'Transcribe and document visit', icon: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z' },
                { id: 'ask-ai', name: 'Ask AI / Search VERA', desc: 'Query clinical guidelines', icon: 'M11 11m-8 0a8 8 0 1016 0a8 8 0 10-16 0 M21 21l-4.35-4.35' },
                { id: 'summarize', name: 'Summarize for Patient', desc: 'Plain-language explanation', icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 7m-4 0a4 4 0 108 0a4 4 0 10-8 0' },
                { id: 'handout', name: 'Create Patient Handout', desc: 'Generate take-home materials', icon: 'M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 01-8 0' },
                { id: 'dot-phrases', name: 'Dot Phrases', desc: 'Quick text expansion shortcuts', icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
              ].map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (item.id === 'dot-phrases') {
                      openPhrasesDrawer()
                    } else {
                      openAiDrawer(item.id)
                    }
                    setAiMenuOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'var(--bg-gray)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--primary)',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d={item.icon}/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '14px', color: 'var(--text-primary)' }}>{item.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* User Avatar */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={onSignOut}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'var(--primary)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              fontSize: '14px',
              border: 'none',
              cursor: 'pointer',
            }}
            title="Sign out"
          >
            {user.email?.charAt(0).toUpperCase() || 'U'}
          </button>
        </div>
      </div>
    </nav>
  )
}
