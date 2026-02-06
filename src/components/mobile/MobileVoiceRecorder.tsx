'use client'

import { useState, useRef, useEffect } from 'react'

interface ChartPrepSections {
  summary?: string
  alerts?: string
  suggestedHPI?: string
  suggestedAssessment?: string
  suggestedPlan?: string
}

interface MobileVoiceRecorderProps {
  onTranscription: (text: string, rawText: string) => void
  onClose: () => void
  fieldLabel?: string
  mode?: 'dictate' | 'chart-prep'
  patient?: {
    id: string
    name: string
    age: number
    gender: string
    reason?: string
  }
  noteData?: Record<string, string>
  onChartPrepComplete?: (sections: ChartPrepSections) => void
}

export default function MobileVoiceRecorder({
  onTranscription,
  onClose,
  fieldLabel = 'Note',
  mode = 'dictate',
  patient,
  noteData,
  onChartPrepComplete,
}: MobileVoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [chartPrepSections, setChartPrepSections] = useState<ChartPrepSections | null>(null)
  const [showChartPrepResults, setShowChartPrepResults] = useState(false)
  const [transcribedText, setTranscribedText] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioBlobRef = useRef<Blob | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  const startRecording = async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        }
      })

      // Set up audio analysis for visualization
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
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

      // Determine MIME type - iPhone Safari compatibility is critical
      // Safari on iOS typically only supports audio/mp4 or audio/aac
      let mimeType = ''

      // Check in order of preference for Whisper API compatibility
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/aac',
        'audio/mpeg',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/wav',
      ]

      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type
          console.log('Using MIME type:', type)
          break
        }
      }

      if (!mimeType) {
        console.log('No supported MIME type found, using default')
      }

      const options: MediaRecorderOptions = mimeType ? { mimeType } : {}
      let mediaRecorder: MediaRecorder

      try {
        mediaRecorder = new MediaRecorder(stream, options)
      } catch (e) {
        // If options fail, try without options
        console.log('MediaRecorder with options failed, trying without:', e)
        mediaRecorder = new MediaRecorder(stream)
      }
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
    setError(null)

    try {
      const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type: mimeType })
      audioBlobRef.current = blob // Store for retry

      // Check file size (max 25MB for Whisper API)
      if (blob.size > 25 * 1024 * 1024) {
        throw new Error('Recording too long. Please keep recordings under 2 minutes.')
      }

      // Map MIME type to file extension - critical for Whisper API
      // Whisper accepts: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm
      let extension = 'webm'
      if (mimeType.includes('mp4') || mimeType.includes('m4a') || mimeType.includes('aac')) {
        extension = 'm4a' // Use m4a for Safari recordings - Whisper handles this well
      } else if (mimeType.includes('mpeg') || mimeType.includes('mp3')) {
        extension = 'mp3'
      } else if (mimeType.includes('ogg') || mimeType.includes('oga')) {
        extension = 'ogg'
      } else if (mimeType.includes('wav')) {
        extension = 'wav'
      } else if (mimeType.includes('webm')) {
        extension = 'webm'
      }

      console.log('Recording MIME type:', mimeType, '-> extension:', extension, 'size:', blob.size)

      const formData = new FormData()
      formData.append('audio', blob, `recording.${extension}`)

      const response = await fetch('/api/ai/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Transcription failed (${response.status})`)
      }

      const data = await response.json()

      if (!data.text || data.text.trim() === '') {
        throw new Error('No speech detected. Please try again.')
      }

      // In chart-prep mode, process with AI after transcription
      if (mode === 'chart-prep') {
        setTranscribedText(data.text)
        audioBlobRef.current = null
        await processChartPrep(data.text)
        return // Don't call onTranscription in chart-prep mode
      }

      onTranscription(data.text, data.rawText || data.text)
      audioBlobRef.current = null // Clear on success

      // Success haptic
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100])
    } catch (err) {
      console.error('Transcription error:', err)
      setError(err instanceof Error ? err.message : 'Failed to transcribe. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const retryTranscription = () => {
    if (audioBlobRef.current) {
      processRecording()
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const processChartPrep = async (transcription: string) => {
    setIsProcessing(true)
    setError(null)

    try {
      const response = await fetch('/api/ai/chart-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient: patient ? {
            id: patient.id,
            first_name: patient.name.split(' ')[0],
            last_name: patient.name.split(' ').slice(1).join(' '),
            date_of_birth: '', // Not available from mobile view
            gender: patient.gender,
          } : undefined,
          noteData: {
            chiefComplaint: patient?.reason ? [patient.reason] : [],
            ...noteData,
          },
          prepNotes: [{
            category: 'general',
            text: transcription,
            timestamp: new Date().toISOString(),
          }],
          userSettings: {},
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Chart Prep failed')
      }

      const data = await response.json()
      setChartPrepSections(data.sections || data)
      setShowChartPrepResults(true)

      // Success haptic
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100])
    } catch (err) {
      console.error('Chart Prep error:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate chart prep')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleAddSection = (field: string, content: string) => {
    if (onChartPrepComplete && chartPrepSections) {
      // Build a partial sections object with just this field
      const sectionKey = field === 'hpi' ? 'suggestedHPI'
        : field === 'assessment' ? 'suggestedAssessment'
        : field === 'plan' ? 'suggestedPlan'
        : 'summary'
      onChartPrepComplete({ [sectionKey]: content })
    }
    if ('vibrate' in navigator) navigator.vibrate(30)
  }

  const handleAddAllSections = () => {
    if (onChartPrepComplete && chartPrepSections) {
      onChartPrepComplete(chartPrepSections)
    }
    if ('vibrate' in navigator) navigator.vibrate([100, 50, 100])
    onClose()
  }

  const cancelRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop()
    }
    chunksRef.current = []
    audioBlobRef.current = null
    onClose()
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.95)',
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
          top: 'max(16px, env(safe-area-inset-top))',
          right: '16px',
          background: 'rgba(255, 255, 255, 0.1)',
          border: 'none',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'white',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Field label */}
      <div style={{
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: '12px',
        fontWeight: 500,
        marginBottom: '4px',
        textTransform: 'uppercase',
        letterSpacing: '1px',
      }}>
        Recording to
      </div>
      <div style={{
        color: 'white',
        fontSize: '18px',
        fontWeight: 600,
        marginBottom: '24px',
      }}>
        {fieldLabel}
      </div>

      {/* Visualization - smaller */}
      <div style={{
        width: '140px',
        height: '140px',
        borderRadius: '50%',
        background: isProcessing
          ? 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)'
          : isRecording
          ? `radial-gradient(circle, rgba(239, 68, 68, ${0.3 + audioLevel * 0.7}) 0%, rgba(239, 68, 68, 0.1) 70%)`
          : 'rgba(255, 255, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '24px',
        transition: 'background 0.1s',
        transform: isRecording ? `scale(${1 + audioLevel * 0.08})` : 'scale(1)',
      }}>
        {isProcessing ? (
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(255, 255, 255, 0.3)',
            borderTopColor: 'white',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
        ) : (
          <svg
            width="56"
            height="56"
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
        fontSize: '36px',
        fontWeight: 300,
        fontVariantNumeric: 'tabular-nums',
        marginBottom: '8px',
      }}>
        {formatDuration(duration)}
      </div>

      {/* Status text */}
      <div style={{
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: '13px',
        marginBottom: '24px',
        height: '18px',
        textAlign: 'center',
      }}>
        {isProcessing
          ? 'Processing...'
          : isRecording
          ? isPaused
            ? 'Paused'
            : 'Listening...'
          : error ? '' : 'Tap to start'}
      </div>

      {/* Error message with retry */}
      {error && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '16px',
        }}>
          <div style={{
            color: '#EF4444',
            fontSize: '13px',
            textAlign: 'center',
            maxWidth: '280px',
          }}>
            {error}
          </div>
          {audioBlobRef.current && (
            <button
              onClick={retryTranscription}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.1)',
                color: 'white',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
          )}
        </div>
      )}

      {/* Controls - more compact */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
      }}>
        {!isRecording && !isProcessing && (
          <button
            onClick={startRecording}
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
              border: '3px solid rgba(255, 255, 255, 0.3)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 24px rgba(239, 68, 68, 0.4)',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="none">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            </svg>
          </button>
        )}

        {isRecording && !isProcessing && (
          <>
            {/* Pause/Resume - smaller */}
            <button
              onClick={isPaused ? resumeRecording : pauseRecording}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '2px solid rgba(255, 255, 255, 0.2)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
              }}
            >
              {isPaused ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              )}
            </button>

            {/* Stop/Done */}
            <button
              onClick={stopRecording}
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                border: '3px solid rgba(255, 255, 255, 0.3)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 6px 24px rgba(16, 185, 129, 0.4)',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>

            {/* Cancel - smaller */}
            <button
              onClick={cancelRecording}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '2px solid rgba(255, 255, 255, 0.2)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Chart Prep Results Panel */}
      {showChartPrepResults && chartPrepSections && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg-white, #fff)',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px',
            paddingTop: 'max(16px, env(safe-area-inset-top))',
            borderBottom: '1px solid var(--border, #e5e7eb)',
            background: 'linear-gradient(135deg, #F0FDFA 0%, #CCFBF1 100%)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              <span style={{ fontSize: '16px', fontWeight: 600, color: '#0D9488' }}>
                Chart Prep Results
              </span>
            </div>
            <button
              onClick={() => {
                setShowChartPrepResults(false)
                onClose()
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: '8px',
                cursor: 'pointer',
                color: 'var(--text-muted, #6b7280)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Transcription preview */}
          {transcribedText && (
            <div style={{
              padding: '12px 16px',
              background: 'var(--bg-gray, #f9fafb)',
              borderBottom: '1px solid var(--border, #e5e7eb)',
            }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 500,
                color: 'var(--text-muted, #6b7280)',
                marginBottom: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Your Dictation
              </div>
              <div style={{
                fontSize: '13px',
                color: 'var(--text-secondary, #4b5563)',
                lineHeight: 1.4,
              }}>
                {transcribedText.length > 150 ? transcribedText.slice(0, 150) + '...' : transcribedText}
              </div>
            </div>
          )}

          {/* Sections */}
          <div style={{
            flex: 1,
            overflow: 'auto',
            padding: '12px 16px',
            WebkitOverflowScrolling: 'touch',
          }}>
            {/* Alerts */}
            {chartPrepSections.alerts && chartPrepSections.alerts.trim() && (
              <div style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '12px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '6px',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#DC2626' }}>
                    Alerts
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#991B1B', lineHeight: 1.5 }}>
                  {chartPrepSections.alerts}
                </div>
              </div>
            )}

            {/* Summary */}
            {chartPrepSections.summary && (
              <div style={{
                background: 'var(--bg-gray, #f9fafb)',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '12px',
              }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-muted, #6b7280)',
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  Summary
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-primary, #111827)', lineHeight: 1.5 }}>
                  {chartPrepSections.summary}
                </div>
              </div>
            )}

            {/* Suggested HPI */}
            {chartPrepSections.suggestedHPI && (
              <div style={{
                background: 'var(--bg-white, #fff)',
                border: '1px solid var(--border, #e5e7eb)',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '12px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}>
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      background: '#0D948815',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488' }}>
                      Suggested HPI
                    </span>
                  </div>
                  <button
                    onClick={() => handleAddSection('hpi', chartPrepSections.suggestedHPI!)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid #0D9488',
                      background: 'transparent',
                      color: '#0D9488',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Add
                  </button>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary, #4b5563)', lineHeight: 1.5 }}>
                  {chartPrepSections.suggestedHPI}
                </div>
              </div>
            )}

            {/* Suggested Assessment */}
            {chartPrepSections.suggestedAssessment && (
              <div style={{
                background: 'var(--bg-white, #fff)',
                border: '1px solid var(--border, #e5e7eb)',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '12px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}>
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      background: '#EF444415',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#EF4444' }}>
                      Suggested Assessment
                    </span>
                  </div>
                  <button
                    onClick={() => handleAddSection('assessment', chartPrepSections.suggestedAssessment!)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid #EF4444',
                      background: 'transparent',
                      color: '#EF4444',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Add
                  </button>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary, #4b5563)', lineHeight: 1.5 }}>
                  {chartPrepSections.suggestedAssessment}
                </div>
              </div>
            )}

            {/* Suggested Plan */}
            {chartPrepSections.suggestedPlan && (
              <div style={{
                background: 'var(--bg-white, #fff)',
                border: '1px solid var(--border, #e5e7eb)',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '12px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}>
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      background: '#10B98115',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#10B981' }}>
                      Suggested Plan
                    </span>
                  </div>
                  <button
                    onClick={() => handleAddSection('plan', chartPrepSections.suggestedPlan!)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid #10B981',
                      background: 'transparent',
                      color: '#10B981',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Add
                  </button>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary, #4b5563)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {chartPrepSections.suggestedPlan}
                </div>
              </div>
            )}
          </div>

          {/* Add All button */}
          <div style={{
            padding: '12px 16px',
            paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
            borderTop: '1px solid var(--border, #e5e7eb)',
            background: 'var(--bg-white, #fff)',
          }}>
            <button
              onClick={handleAddAllSections}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
                color: 'white',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Add All to Note
            </button>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
