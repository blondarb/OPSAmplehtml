'use client'

import { useEffect, useState } from 'react'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'

interface DictationEntry {
  text: string
  timestamp: string
}

interface InlineDictationButtonProps {
  onTranscriptionComplete: (text: string, rawText?: string) => void
  disabled?: boolean
  size?: 'small' | 'medium'
  /** Optional: pass dictation history to display */
  dictationHistory?: DictationEntry[]
}

/**
 * A reusable inline dictation button that records audio and returns transcribed text.
 * Unlike the global VoiceDrawer, this component dictates directly into a specific field.
 *
 * Features:
 * - Records audio and sends to Whisper for transcription
 * - AI cleanup of transcription errors (via gpt-5-mini)
 * - Returns both cleaned text and raw dictation
 * - Optional dictation history display
 */
export default function InlineDictationButton({
  onTranscriptionComplete,
  disabled = false,
  size = 'small',
  dictationHistory,
}: InlineDictationButtonProps) {
  const [showHistory, setShowHistory] = useState(false)

  const {
    isRecording,
    isTranscribing,
    error,
    transcribedText,
    rawText,
    startRecording,
    stopRecording,
    clearTranscription,
  } = useVoiceRecorder()

  // When transcription completes, send it to parent and clear
  useEffect(() => {
    if (transcribedText) {
      onTranscriptionComplete(transcribedText, rawText || undefined)
      clearTranscription()
    }
  }, [transcribedText, rawText, onTranscriptionComplete, clearTranscription])

  const handleClick = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const iconSize = size === 'small' ? 12 : 14
  const buttonSize = size === 'small' ? 24 : 28
  const hasHistory = dictationHistory && dictationHistory.length > 0

  return (
    <div style={{ position: 'relative', display: 'inline-flex', gap: '4px' }}>
      {/* Main dictate button */}
      <button
        onClick={handleClick}
        disabled={disabled || isTranscribing}
        title={
          isRecording
            ? 'Stop Recording'
            : isTranscribing
            ? 'Transcribing...'
            : error || 'Dictate into this field'
        }
        style={{
          width: `${buttonSize}px`,
          height: `${buttonSize}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          border: 'none',
          background: isRecording ? '#EF4444' : '#FEE2E2',
          color: isRecording ? 'white' : '#EF4444',
          cursor: disabled || isTranscribing ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'all 0.2s',
          animation: isRecording ? 'pulse 1.5s infinite' : 'none',
        }}
      >
        {isTranscribing ? (
          <div
            style={{
              width: `${iconSize}px`,
              height: `${iconSize}px`,
              border: '2px solid rgba(239, 68, 68, 0.3)',
              borderTopColor: '#EF4444',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
        ) : (
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
            <path d="M19 10v2a7 7 0 01-14 0v-2" />
          </svg>
        )}
      </button>

      {/* History button - only show if there's history */}
      {hasHistory && (
        <button
          onClick={() => setShowHistory(!showHistory)}
          title={`View ${dictationHistory.length} dictation${dictationHistory.length > 1 ? 's' : ''}`}
          style={{
            width: `${buttonSize}px`,
            height: `${buttonSize}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px',
            border: 'none',
            background: showHistory ? '#3B82F6' : '#DBEAFE',
            color: showHistory ? 'white' : '#3B82F6',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </button>
      )}

      {/* History dropdown */}
      {showHistory && hasHistory && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: '0',
            marginTop: '4px',
            width: '320px',
            maxHeight: '250px',
            overflowY: 'auto',
            background: 'var(--bg-white, white)',
            border: '1px solid var(--border, #e5e7eb)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 50,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 12px',
              borderBottom: '1px solid var(--border, #e5e7eb)',
              background: 'var(--bg-gray, #f9fafb)',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary, #111827)' }}>
              Raw Dictation ({dictationHistory.length})
            </span>
            <button
              onClick={() => setShowHistory(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted, #6b7280)',
                padding: '2px',
                display: 'flex',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div style={{ padding: '8px' }}>
            {[...dictationHistory].reverse().map((entry, index) => (
              <div
                key={index}
                style={{
                  padding: '10px',
                  marginBottom: index < dictationHistory.length - 1 ? '6px' : 0,
                  background: 'var(--bg-gray, #f9fafb)',
                  borderRadius: '6px',
                  borderLeft: '3px solid #3B82F6',
                }}
              >
                <div style={{ fontSize: '10px', color: 'var(--text-muted, #6b7280)', marginBottom: '4px' }}>
                  {new Date(entry.timestamp).toLocaleString()}
                </div>
                <p
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-secondary, #374151)',
                    margin: 0,
                    lineHeight: 1.4,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {entry.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
