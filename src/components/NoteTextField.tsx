'use client'

import { useState, useRef, useEffect } from 'react'
import InlinePhrasePicker from './InlinePhrasePicker'

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
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
        onChange={(e) => onChange(e.target.value)}
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
      <div style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
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

      {/* Inline Phrase Picker */}
      {showPicker && (
        <InlinePhrasePicker
          fieldName={fieldName}
          onInsertPhrase={handleInsertPhrase}
          onOpenFullDrawer={handleOpenFullDrawer}
        />
      )}
    </div>
  )
}
