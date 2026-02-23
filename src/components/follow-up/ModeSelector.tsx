'use client'

import type { FollowUpMethod } from '@/lib/follow-up/types'

interface ModeSelectorProps {
  mode: FollowUpMethod
  onModeChange: (mode: FollowUpMethod) => void
  disabled: boolean
}

export default function ModeSelector({ mode, onModeChange, disabled }: ModeSelectorProps) {
  return (
    <div style={{
      display: 'inline-flex',
      borderRadius: '20px',
      border: '1px solid #334155',
      overflow: 'hidden',
      opacity: disabled ? 0.6 : 1,
    }}>
      {/* SMS button */}
      <button
        onClick={() => !disabled && onModeChange('sms')}
        disabled={disabled}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 16px',
          border: 'none',
          borderRadius: '20px 0 0 20px',
          background: mode === 'sms' ? '#16A34A' : 'transparent',
          color: mode === 'sms' ? 'white' : '#94a3b8',
          fontSize: '13px',
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'background 0.15s ease, color 0.15s ease',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        SMS
      </button>

      {/* Voice button */}
      <button
        onClick={() => !disabled && onModeChange('voice')}
        disabled={disabled}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 16px',
          border: 'none',
          borderLeft: '1px solid #334155',
          borderRadius: '0 20px 20px 0',
          background: mode === 'voice' ? '#16A34A' : 'transparent',
          color: mode === 'voice' ? 'white' : '#94a3b8',
          fontSize: '13px',
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'background 0.15s ease, color 0.15s ease',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
          <path d="M19 10v2a7 7 0 01-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
        Voice
      </button>
    </div>
  )
}
