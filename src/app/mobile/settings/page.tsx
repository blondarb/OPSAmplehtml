'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import MobileLayout from '@/components/mobile/MobileLayout'

interface SettingToggle {
  id: string
  label: string
  description: string
  enabled: boolean
}

export default function MobileSettingsPage() {
  const router = useRouter()

  const [settings, setSettings] = useState<SettingToggle[]>([
    {
      id: 'auto-save',
      label: 'Auto-save drafts',
      description: 'Automatically save your work as you type',
      enabled: true,
    },
    {
      id: 'ai-cleanup',
      label: 'AI transcription cleanup',
      description: 'Clean up grammar and fix medical terms',
      enabled: true,
    },
    {
      id: 'haptic-feedback',
      label: 'Haptic feedback',
      description: 'Vibrate on important actions',
      enabled: true,
    },
    {
      id: 'dark-mode',
      label: 'Dark mode',
      description: 'Use dark theme for the interface',
      enabled: false,
    },
    {
      id: 'large-text',
      label: 'Large text',
      description: 'Increase text size for readability',
      enabled: false,
    },
  ])

  const toggleSetting = (id: string) => {
    setSettings(prev => prev.map(s =>
      s.id === id ? { ...s, enabled: !s.enabled } : s
    ))
    if ('vibrate' in navigator) {
      navigator.vibrate(30)
    }
  }

  return (
    <MobileLayout activeTab="settings">
      <div style={{ padding: '16px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}>
            Settings
          </h1>
          <p style={{
            fontSize: '14px',
            color: 'var(--text-muted)',
            marginTop: '4px',
          }}>
            Customize your mobile experience
          </p>
        </div>

        {/* User card */}
        <div style={{
          background: 'var(--bg-white)',
          borderRadius: '16px',
          padding: '16px',
          marginBottom: '24px',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '20px',
            fontWeight: 600,
          }}>
            DR
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}>
              Dr. Demo User
            </div>
            <div style={{
              fontSize: '13px',
              color: 'var(--text-muted)',
            }}>
              demo@sevaro.health
            </div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>

        {/* Settings sections */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '12px',
            padding: '0 4px',
          }}>
            Preferences
          </h2>
          <div style={{
            background: 'var(--bg-white)',
            borderRadius: '16px',
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            {settings.map((setting, index) => (
              <div
                key={setting.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px',
                  borderBottom: index < settings.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={{ flex: 1, marginRight: '12px' }}>
                  <div style={{
                    fontSize: '15px',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                  }}>
                    {setting.label}
                  </div>
                  <div style={{
                    fontSize: '13px',
                    color: 'var(--text-muted)',
                    marginTop: '2px',
                  }}>
                    {setting.description}
                  </div>
                </div>
                <button
                  onClick={() => toggleSetting(setting.id)}
                  style={{
                    width: '52px',
                    height: '32px',
                    borderRadius: '16px',
                    background: setting.enabled
                      ? 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)'
                      : 'var(--bg-gray)',
                    border: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: 'white',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    position: 'absolute',
                    top: '2px',
                    left: setting.enabled ? '22px' : '2px',
                    transition: 'left 0.2s',
                  }} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '12px',
            padding: '0 4px',
          }}>
            Quick Actions
          </h2>
          <div style={{
            background: 'var(--bg-white)',
            borderRadius: '16px',
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            {[
              { icon: '🔐', label: 'Change Password' },
              { icon: '📱', label: 'Manage Devices' },
              { icon: '💬', label: 'Dot Phrases' },
              { icon: '📊', label: 'Usage Statistics' },
              { icon: '❓', label: 'Help & Support' },
            ].map((action, index, arr) => (
              <button
                key={action.label}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: index < arr.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: '20px' }}>{action.icon}</span>
                <span style={{
                  flex: 1,
                  fontSize: '15px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                }}>
                  {action.label}
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ))}
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={() => router.push('/login')}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '16px',
            border: '1px solid #FEE2E2',
            background: '#FEF2F2',
            fontSize: '15px',
            fontWeight: 600,
            color: '#EF4444',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Sign Out
        </button>

        {/* Version info */}
        <div style={{
          textAlign: 'center',
          marginTop: '24px',
          color: 'var(--text-muted)',
          fontSize: '12px',
        }}>
          Sevaro Clinical Mobile v1.0.0
        </div>
      </div>
    </MobileLayout>
  )
}
