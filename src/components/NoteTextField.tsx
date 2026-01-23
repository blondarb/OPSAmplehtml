'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import InlinePhrasePicker from './InlinePhrasePicker'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'

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
  rawDictation?: Array<{ text: string; timestamp: string }> | null
  onRawDictationChange?: (rawText: string) => void
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
  rawDictation,
  onRawDictationChange,
}: NoteTextFieldProps) {
  const [showPicker, setShowPicker] = useState(false)
  const [phrases, setPhrases] = useState<Phrase[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastExpandedRef = useRef<string>('')

  const [showRawDictation, setShowRawDictation] = useState(false)

  // Voice recording hook
  const {
    isRecording,
    isTranscribing,
    error: recordingError,
    transcribedText,
    rawText,
    startRecording,
    stopRecording,
    clearTranscription,
  } = useVoiceRecorder()

  // Insert transcribed text when available
  useEffect(() => {
    if (transcribedText) {
      const textarea = textareaRef.current
      if (textarea) {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const newValue = value.substring(0, start) + transcribedText + value.substring(end)
        onChange(newValue)

        // Save raw dictation if callback provided
        console.log('Dictation complete - rawText:', rawText, 'has callback:', !!onRawDictationChange)
        if (rawText && onRawDictationChange) {
          onRawDictationChange(rawText)
        }

        // Set cursor position after inserted text
        setTimeout(() => {
          textarea.focus()
          const newPos = start + transcribedText.length
          textarea.setSelectionRange(newPos, newPos)
        }, 0)
      } else {
        // Fallback: append to end
        onChange(value + transcribedText)
        // Save raw dictation if callback provided
        if (rawText && onRawDictationChange) {
          onRawDictationChange(rawText)
        }
      }
      clearTranscription()
    }
  }, [transcribedText, rawText, value, onChange, onRawDictationChange, clearTranscription])

  // Handle dictation button click
  const handleDictateClick = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

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

  // Handle text change with auto-expansion
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const cursorPos = e.target.selectionStart

    // Check for dot phrase trigger pattern: .trigger followed by space
    const textBeforeCursor = newValue.substring(0, cursorPos)
    const triggerMatch = textBeforeCursor.match(/(\.[a-z0-9]+)\s$/i)

    if (triggerMatch && phrases.length > 0) {
      const trigger = triggerMatch[1].toLowerCase()

      // Don't re-expand the same trigger
      if (trigger !== lastExpandedRef.current) {
        // Find matching phrase (must match scope: global or field-specific)
        const matchingPhrase = phrases.find(p =>
          p.trigger_text.toLowerCase() === trigger &&
          (p.scope === 'global' || p.scope === fieldName)
        )

        if (matchingPhrase) {
          // Calculate positions
          const triggerWithSpace = trigger + ' '
          const triggerStart = cursorPos - triggerWithSpace.length
          const beforeTrigger = newValue.substring(0, triggerStart)
          const afterCursor = newValue.substring(cursorPos)
          const expandedValue = beforeTrigger + matchingPhrase.expansion_text + ' ' + afterCursor

          // Track that we expanded this trigger
          lastExpandedRef.current = trigger

          // Track usage
          trackUsage(matchingPhrase.id)

          // Update with expanded value
          onChange(expandedValue)

          // Set cursor position after the expanded text
          setTimeout(() => {
            const textarea = textareaRef.current
            if (textarea) {
              const newCursorPos = beforeTrigger.length + matchingPhrase.expansion_text.length + 1
              textarea.setSelectionRange(newCursorPos, newCursorPos)
              textarea.focus()
            }
          }, 0)

          return // Don't update with original value
        }
      }
    }

    // Reset last expanded if user is typing something new
    if (lastExpandedRef.current && !textBeforeCursor.endsWith(lastExpandedRef.current)) {
      lastExpandedRef.current = ''
    }

    // Normal update
    onChange(newValue)
  }, [phrases, fieldName, onChange, trackUsage])

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
    <div ref={containerRef} className="ai-textarea-wrapper">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onFocus={() => setActiveTextField(fieldName)}
        placeholder={placeholder}
        className="form-textarea"
        style={{
          minHeight,
          paddingRight: showDictate ? '140px' : '110px',
        }}
      />

      {/* Recording Waveform Overlay */}
      {isRecording && (
        <div className="recording-waveform active">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="wave-bar" />
          ))}
          <div className="recording-text">
            <span className="rec-dot" />
            Recording...
          </div>
        </div>
      )}

      {/* Button group with inline picker */}
      <div className="ai-textarea-icons">
        {showDictate && (
          <button
            onClick={handleDictateClick}
            disabled={isTranscribing}
            className={`ai-icon-btn ${isRecording ? 'recording' : ''}`}
            title={isRecording ? 'Stop Recording' : isTranscribing ? 'Transcribing...' : recordingError || 'Dictate'}
          >
            {isTranscribing ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ai-loading-spinner" style={{ width: '14px', height: '14px', border: '2px solid var(--border)', borderTopColor: 'var(--primary)' }}>
                <circle cx="12" cy="12" r="10" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/>
              </svg>
            )}
          </button>
        )}
        <button
          onClick={() => setShowPicker(!showPicker)}
          className={`quick-phrases-btn ${showPicker ? 'active' : ''}`}
          style={{
            background: showPicker ? '#8B5CF6' : undefined,
            color: showPicker ? 'white' : undefined,
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
            className="ai-icon-btn sparkle"
            style={{
              background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%)',
              color: 'white',
            }}
            title="AI Actions"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
        )}
        {showDictate && (
          <button
            onClick={() => rawDictation && rawDictation.length > 0 && setShowRawDictation(!showRawDictation)}
            disabled={!rawDictation || rawDictation.length === 0}
            className="ai-icon-btn"
            style={{
              background: showRawDictation ? 'var(--info)' : undefined,
              color: showRawDictation ? 'white' : rawDictation && rawDictation.length > 0 ? 'var(--info)' : undefined,
              opacity: rawDictation && rawDictation.length > 0 ? 1 : 0.5,
              cursor: rawDictation && rawDictation.length > 0 ? 'pointer' : 'not-allowed',
            }}
            title={rawDictation && rawDictation.length > 0 ? `View ${rawDictation.length} dictation${rawDictation.length > 1 ? 's' : ''}` : "No dictation recorded yet"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4"/>
              <path d="M12 8h.01"/>
            </svg>
          </button>
        )}

        {/* Inline Phrase Picker - positioned above buttons */}
        {showPicker && (
          <InlinePhrasePicker
            fieldName={fieldName}
            onInsertPhrase={handleInsertPhrase}
            onOpenFullDrawer={handleOpenFullDrawer}
          />
        )}

        {/* Raw Dictation Tooltip */}
        {showRawDictation && rawDictation && rawDictation.length > 0 && (
          <div className="quick-phrases-dropdown show" style={{ width: '340px', maxHeight: '300px', overflowY: 'auto' }}>
            <div className="quick-phrases-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Dictation History ({rawDictation.length})</span>
              <button
                onClick={() => setShowRawDictation(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px' }}>
              {[...rawDictation].reverse().map((entry, index) => (
                <div
                  key={index}
                  style={{
                    padding: '10px',
                    background: 'var(--bg-gray)',
                    borderRadius: '6px',
                    borderLeft: '3px solid var(--info)',
                  }}
                >
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    {new Date(entry.timestamp).toLocaleString()}
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {entry.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
