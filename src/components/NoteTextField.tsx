'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import InlinePhrasePicker from './InlinePhrasePicker'

interface Phrase {
  id: string
  trigger_text: string
  expansion_text: string
  scope: 'global' | 'hpi' | 'assessment' | 'plan' | 'ros' | 'allergies'
}

interface NoteTextFieldProps {
  value: string
  onChange: (value: string) => void
  fieldName: string
  placeholder?: string
  minHeight?: string
  showDictate?: boolean
  showAiAction?: boolean
  onOpenAiDrawer?: () => void
  onOpenFullPhrasesDrawer: () => void
  setActiveTextField: (field: string | null) => void
}

export default function NoteTextField({
  value,
  onChange,
  fieldName,
  placeholder = '',
  minHeight = '120px',
  showDictate = false,
  showAiAction = true,
  onOpenAiDrawer,
  onOpenFullPhrasesDrawer,
  setActiveTextField,
}: NoteTextFieldProps) {
  const [showPicker, setShowPicker] = useState(false)
  const [phrases, setPhrases] = useState<Phrase[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastExpandedRef = useRef<string>('')

  // Fetch phrases for auto-expansion
  useEffect(() => {
    const fetchPhrases = async () => {
      try {
        const response = await fetch('/api/phrases')
        if (response.ok) {
          const data = await response.json()
          setPhrases(data.phrases || [])
        }
      } catch (error) {
        console.error('Error fetching phrases:', error)
      }
    }
    fetchPhrases()
  }, [])

  // Track usage when a phrase is expanded
  const trackUsage = useCallback(async (phraseId: string) => {
    try {
      await fetch(`/api/phrases/${phraseId}`, { method: 'PATCH' })
    } catch (error) {
      console.error('Error tracking usage:', error)
    }
  }, [])

  // Check for dot phrase triggers and auto-expand
  const checkForTrigger = useCallback((newValue: string, cursorPos: number) => {
    // Find the word being typed (look backwards from cursor for a dot phrase)
    const textBeforeCursor = newValue.substring(0, cursorPos)

    // Match a dot phrase pattern: starts with '.', followed by alphanumeric, ends with space or is at cursor
    const triggerMatch = textBeforeCursor.match(/(\.[a-z0-9]+)(\s?)$/i)

    if (triggerMatch) {
      const trigger = triggerMatch[1].toLowerCase()
      const hasTrailingSpace = triggerMatch[2] === ' '

      // Only expand if there's a trailing space (user finished typing the trigger)
      if (hasTrailingSpace && trigger !== lastExpandedRef.current) {
        // Find matching phrase (must match scope: global or field-specific)
        const matchingPhrase = phrases.find(p =>
          p.trigger_text.toLowerCase() === trigger &&
          (p.scope === 'global' || p.scope === fieldName)
        )

        if (matchingPhrase) {
          // Replace the trigger with expansion text
          const triggerStart = cursorPos - trigger.length - 1 // -1 for the space
          const beforeTrigger = newValue.substring(0, triggerStart)
          const afterCursor = newValue.substring(cursorPos)
          const expandedValue = beforeTrigger + matchingPhrase.expansion_text + ' ' + afterCursor

          // Track that we expanded this trigger to prevent re-expansion
          lastExpandedRef.current = trigger

          // Track usage
          trackUsage(matchingPhrase.id)

          // Update value and set cursor position after expansion
          onChange(expandedValue)

          // Set cursor position after the expanded text
          setTimeout(() => {
            const textarea = textareaRef.current
            if (textarea) {
              const newCursorPos = beforeTrigger.length + matchingPhrase.expansion_text.length + 1
              textarea.setSelectionRange(newCursorPos, newCursorPos)
            }
          }, 0)

          return true // Expanded
        }
      }
    }

    // Reset the last expanded ref if the user types something else
    if (!textBeforeCursor.includes(lastExpandedRef.current)) {
      lastExpandedRef.current = ''
    }

    return false // Not expanded
  }, [phrases, fieldName, onChange, trackUsage])

  // Handle text change with auto-expansion
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const cursorPos = e.target.selectionStart

    // Check for trigger expansion
    const expanded = checkForTrigger(newValue, cursorPos)

    // If not expanded, just update the value normally
    if (!expanded) {
      onChange(newValue)
    }
  }, [checkForTrigger, onChange])

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowPicker(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleInsertPhrase = (text: string) => {
    // Get current cursor position
    const textarea = textareaRef.current
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newValue = value.substring(0, start) + text + value.substring(end)
      onChange(newValue)

      // Set cursor position after inserted text
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + text.length, start + text.length)
      }, 0)
    } else {
      // Fallback: append to end
      onChange(value + text)
    }
    setShowPicker(false)
  }

  const handleOpenFullDrawer = () => {
    setShowPicker(false)
    onOpenFullPhrasesDrawer()
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onFocus={() => setActiveTextField(fieldName)}
        placeholder={placeholder}
        style={{
          width: '100%',
          minHeight,
          padding: '12px',
          paddingRight: showDictate ? '110px' : '80px',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          fontSize: '14px',
          resize: 'vertical',
          outline: 'none',
          fontFamily: 'inherit',
          color: 'var(--text-primary)',
          background: 'var(--bg-white)',
        }}
      />
      {/* Button group with inline picker */}
      <div style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
      }}>
        <div style={{
          display: 'flex',
          gap: '4px',
        }}>
          {showDictate && (
            <button
              onClick={onOpenAiDrawer}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--bg-white)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
              }}
              title="Dictate"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/>
              </svg>
            </button>
          )}
          <button
            onClick={() => setShowPicker(!showPicker)}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: showPicker ? 'var(--warning)' : 'var(--bg-white)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: showPicker ? 'white' : 'var(--warning)',
              transition: 'all 0.15s',
            }}
            title="Dot Phrases"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </button>
          {showAiAction && (
            <button
              onClick={onOpenAiDrawer}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                border: 'none',
                background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
              }}
              title="AI Actions"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
          )}
        </div>

        {/* Inline Phrase Picker - positioned above buttons */}
        {showPicker && (
          <InlinePhrasePicker
            fieldName={fieldName}
            onInsertPhrase={handleInsertPhrase}
            onOpenFullDrawer={handleOpenFullDrawer}
          />
        )}
      </div>
    </div>
  )
}
