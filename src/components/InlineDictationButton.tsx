'use client'

import { useEffect } from 'react'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'

interface InlineDictationButtonProps {
  onTranscriptionComplete: (text: string) => void
  disabled?: boolean
  size?: 'small' | 'medium'
}

/**
 * A reusable inline dictation button that records audio and returns transcribed text.
 * Unlike the global VoiceDrawer, this component dictates directly into a specific field.
 */
export default function InlineDictationButton({
  onTranscriptionComplete,
  disabled = false,
  size = 'small',
}: InlineDictationButtonProps) {
  const {
    isRecording,
    isTranscribing,
    error,
    transcribedText,
    startRecording,
    stopRecording,
    clearTranscription,
  } = useVoiceRecorder()

  // When transcription completes, send it to parent and clear
  useEffect(() => {
    if (transcribedText) {
      onTranscriptionComplete(transcribedText)
      clearTranscription()
    }
  }, [transcribedText, onTranscriptionComplete, clearTranscription])

  const handleClick = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const iconSize = size === 'small' ? 12 : 14
  const buttonSize = size === 'small' ? 24 : 28

  return (
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
  )
}
