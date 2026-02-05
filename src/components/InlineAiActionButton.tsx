'use client'

import { useState, useRef, useEffect } from 'react'

type FieldActionType = 'improve' | 'expand' | 'summarize'

interface InlineAiActionButtonProps {
  /** Current text content to transform */
  value: string
  /** Callback when text is transformed */
  onTextChange: (newText: string) => void
  /** Field name for context */
  fieldName: string
  /** Patient context for AI */
  patientContext?: {
    patient?: string
    chiefComplaint?: string
  }
  /** Disabled state */
  disabled?: boolean
  /** Button size */
  size?: 'small' | 'medium'
  /** Fallback to open full AI drawer */
  onOpenAiDrawer?: () => void
}

/**
 * A reusable inline AI action button that provides Improve/Expand/Summarize actions.
 * This component mirrors the AI action menu from NoteTextField for use with regular textareas.
 */
export default function InlineAiActionButton({
  value,
  onTextChange,
  fieldName,
  patientContext,
  disabled = false,
  size = 'small',
  onOpenAiDrawer,
}: InlineAiActionButtonProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleAiAction = async (action: FieldActionType) => {
    if (!value.trim()) {
      setError('Please enter some text first')
      setTimeout(() => setError(null), 3000)
      return
    }

    setShowMenu(false)
    setLoading(true)
    setError(null)

    try {
      // Get user settings from localStorage
      let userSettings = null
      const savedSettings = localStorage.getItem('sevaro-user-settings')
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings)
          userSettings = {
            globalAiInstructions: parsed.globalAiInstructions || '',
            sectionAiInstructions: parsed.sectionAiInstructions || {},
            documentationStyle: parsed.documentationStyle || 'detailed',
            preferredTerminology: parsed.preferredTerminology || 'standard',
          }
        } catch (e) {
          console.error('Failed to parse user settings:', e)
        }
      }

      const response = await fetch('/api/ai/field-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          text: value,
          fieldName,
          context: patientContext,
          userSettings,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process text')
      }

      // Replace the text with the AI result
      onTextChange(data.result)
    } catch (err: unknown) {
      console.error('AI action error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to process text'
      setError(errorMessage)
      setTimeout(() => setError(null), 5000)
    } finally {
      setLoading(false)
    }
  }

  const iconSize = size === 'small' ? 12 : 14
  const buttonSize = size === 'small' ? 24 : 28

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* AI Action Button */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={disabled || loading}
        title="AI Actions"
        style={{
          width: `${buttonSize}px`,
          height: `${buttonSize}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          border: 'none',
          background: showMenu ? '#D97706' : 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
          color: 'white',
          cursor: disabled || loading ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'all 0.2s',
        }}
      >
        {loading ? (
          <div
            style={{
              width: `${iconSize}px`,
              height: `${iconSize}px`,
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: 'white',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
        ) : (
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z" />
          </svg>
        )}
      </button>

      {/* Action Menu Dropdown */}
      {showMenu && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: '0',
            marginTop: '4px',
            width: '200px',
            background: 'var(--bg-white, white)',
            border: '1px solid var(--border, #e5e7eb)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 50,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#F59E0B' }}>AI Actions</span>
          </div>

          {/* Improve */}
          <button
            onClick={() => handleAiAction('improve')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '10px 12px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-gray, #f9fafb)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary, #111827)' }}>Improve Writing</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted, #6b7280)' }}>Polish grammar & clarity</div>
            </div>
          </button>

          {/* Expand */}
          <button
            onClick={() => handleAiAction('expand')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '10px 12px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-gray, #f9fafb)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary, #111827)' }}>Expand Details</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted, #6b7280)' }}>Add clinical context</div>
            </div>
          </button>

          {/* Summarize */}
          <button
            onClick={() => handleAiAction('summarize')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '10px 12px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-gray, #f9fafb)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2">
              <line x1="21" y1="10" x2="3" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="21" y1="18" x2="3" y2="18" />
            </svg>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary, #111827)' }}>Summarize</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted, #6b7280)' }}>Condense to key points</div>
            </div>
          </button>

          {/* Ask AI option */}
          {onOpenAiDrawer && (
            <>
              <div style={{ height: '1px', background: 'var(--border, #e5e7eb)', margin: '4px 0' }} />
              <button
                onClick={() => {
                  setShowMenu(false)
                  onOpenAiDrawer()
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '10px 12px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-gray, #f9fafb)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted, #6b7280)" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #374151)' }}>Ask AI...</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted, #6b7280)' }}>Open AI assistant</div>
                </div>
              </button>
            </>
          )}
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            right: '0',
            marginBottom: '8px',
            padding: '8px 12px',
            background: '#EF4444',
            color: 'white',
            borderRadius: '6px',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            zIndex: 100,
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
