'use client'

import { useState, useRef, useEffect } from 'react'

interface MobileVoiceRecorderProps {
  onTranscription: (text: string, rawText: string) => void
  onClose: () => void
  fieldLabel?: string
}

export default function MobileVoiceRecorder({
  onTranscription,
  onClose,
  fieldLabel = 'Note',
}: MobileVoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  const startRecording = async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Set up audio analysis for visualization
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      // Start visualizing audio level
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length
        setAudioLevel(average / 255)
        animationRef.current = requestAnimationFrame(updateLevel)
      }
      updateLevel()

      // Determine MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/ogg'

      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop())
        if (animationRef.current) cancelAnimationFrame(animationRef.current)

        if (chunksRef.current.length > 0) {
          await processRecording()
        }
      }

      mediaRecorder.start(1000) // Collect data every second
      setIsRecording(true)
      setDuration(0)

      timerRef.current = setInterval(() => {
        setDuration(d => d + 1)
      }, 1000)

      // Haptic feedback
      if ('vibrate' in navigator) {
        navigator.vibrate(50)
      }
    } catch (err) {
      console.error('Failed to start recording:', err)
      setError('Could not access microphone. Please check permissions.')
    }
  }

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause()
      setIsPaused(true)
      if (timerRef.current) clearInterval(timerRef.current)
      if ('vibrate' in navigator) navigator.vibrate(30)
    }
  }

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume()
      setIsPaused(false)
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1)
      }, 1000)
      if ('vibrate' in navigator) navigator.vibrate(30)
    }
  }

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop()
    }
    setIsRecording(false)
    setIsPaused(false)
    if ('vibrate' in navigator) navigator.vibrate([50, 50, 50])
  }

  const processRecording = async () => {
    setIsProcessing(true)
    try {
      const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type: mimeType })

      const extension = mimeType.includes('webm') ? 'webm'
        : mimeType.includes('mp4') ? 'mp4'
        : mimeType.includes('m4a') ? 'm4a'
        : 'ogg'

      const formData = new FormData()
      formData.append('audio', blob, `recording.${extension}`)

      const response = await fetch('/api/ai/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Transcription failed')
      }

      const data = await response.json()
      onTranscription(data.text, data.rawText || data.text)

      // Success haptic
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100])
    } catch (err) {
      console.error('Transcription error:', err)
      setError('Failed to transcribe. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const cancelRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop()
    }
    chunksRef.current = []
    onClose()
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px',
    }}>
      {/* Close button */}
      <button
        onClick={cancelRecording}
        style={{
          position: 'absolute',
          top: 'max(20px, env(safe-area-inset-top))',
          right: '20px',
          background: 'rgba(255, 255, 255, 0.1)',
          border: 'none',
          borderRadius: '50%',
          width: '44px',
          height: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'white',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Field label */}
      <div style={{
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: '14px',
        fontWeight: 500,
        marginBottom: '8px',
        textTransform: 'uppercase',
        letterSpacing: '1px',
      }}>
        Recording to
      </div>
      <div style={{
        color: 'white',
        fontSize: '24px',
        fontWeight: 600,
        marginBottom: '40px',
      }}>
        {fieldLabel}
      </div>

      {/* Visualization */}
      <div style={{
        width: '200px',
        height: '200px',
        borderRadius: '50%',
        background: isProcessing
          ? 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)'
          : isRecording
          ? `radial-gradient(circle, rgba(239, 68, 68, ${0.3 + audioLevel * 0.7}) 0%, rgba(239, 68, 68, 0.1) 70%)`
          : 'rgba(255, 255, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '40px',
        transition: 'background 0.1s',
        transform: isRecording ? `scale(${1 + audioLevel * 0.1})` : 'scale(1)',
      }}>
        {isProcessing ? (
          <div style={{
            width: '60px',
            height: '60px',
            border: '4px solid rgba(255, 255, 255, 0.3)',
            borderTopColor: 'white',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
        ) : (
          <svg
            width="80"
            height="80"
            viewBox="0 0 24 24"
            fill="none"
            stroke={isRecording ? '#EF4444' : 'white'}
            strokeWidth="1.5"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </div>

      {/* Duration */}
      <div style={{
        color: 'white',
        fontSize: '48px',
        fontWeight: 300,
        fontVariantNumeric: 'tabular-nums',
        marginBottom: '16px',
      }}>
        {formatDuration(duration)}
      </div>

      {/* Status text */}
      <div style={{
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: '14px',
        marginBottom: '40px',
        height: '20px',
      }}>
        {isProcessing
          ? 'Processing transcription...'
          : isRecording
          ? isPaused
            ? 'Paused'
            : 'Listening...'
          : error || 'Tap the button to start'}
      </div>

      {/* Error message */}
      {error && (
        <div style={{
          color: '#EF4444',
          fontSize: '14px',
          marginBottom: '20px',
          textAlign: 'center',
        }}>
          {error}
        </div>
      )}

      {/* Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
      }}>
        {!isRecording && !isProcessing && (
          <button
            onClick={startRecording}
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
              border: '4px solid rgba(255, 255, 255, 0.3)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(239, 68, 68, 0.4)',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="white" stroke="none">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            </svg>
          </button>
        )}

        {isRecording && !isProcessing && (
          <>
            {/* Pause/Resume */}
            <button
              onClick={isPaused ? resumeRecording : pauseRecording}
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
              }}
            >
              {isPaused ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              )}
            </button>

            {/* Stop */}
            <button
              onClick={stopRecording}
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                border: '4px solid rgba(255, 255, 255, 0.3)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 32px rgba(16, 185, 129, 0.4)',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>

            {/* Cancel */}
            <button
              onClick={cancelRecording}
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </>
        )}
      </div>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
