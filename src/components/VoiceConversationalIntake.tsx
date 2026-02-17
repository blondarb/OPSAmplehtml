'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface TranscriptEntry {
  role: 'user' | 'assistant'
  text: string
}

interface VoiceConversationalIntakeProps {
  onComplete: (data: Record<string, string>) => void
  onCancel: () => void
}

type SessionStatus = 'idle' | 'connecting' | 'active' | 'ending' | 'complete' | 'error' | 'safety_escalation'

const REQUIRED_FIELDS = [
  'patient_name', 'date_of_birth', 'email', 'phone',
  'chief_complaint', 'current_medications', 'allergies',
  'medical_history', 'family_history',
] as const

const SAFETY_KEYWORDS = [
  'kill myself', 'want to die', 'hurt myself', 'end my life',
  'suicide', 'suicidal', 'self-harm', "don't want to live",
  'hurt someone', 'kill someone',
]

export default function VoiceConversationalIntake({ onComplete, onCancel }: VoiceConversationalIntakeProps) {
  const [status, setStatus] = useState<SessionStatus>('idle')
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [currentAssistantText, setCurrentAssistantText] = useState('')
  const [currentUserText, setCurrentUserText] = useState('')
  const [isAiSpeaking, setIsAiSpeaking] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [intakeData, setIntakeData] = useState<Record<string, string>>({})

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const transcriptRef = useRef<TranscriptEntry[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const fieldsCollected = REQUIRED_FIELDS.filter(
    f => intakeData[f] && String(intakeData[f]).trim() !== ''
  ).length

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript, currentAssistantText, currentUserText])

  const checkSafety = useCallback((text: string) => {
    const lower = text.toLowerCase()
    return SAFETY_KEYWORDS.some(kw => lower.includes(kw))
  }, [])

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (dcRef.current) {
      try { dcRef.current.close() } catch { /* ignore */ }
      dcRef.current = null
    }
    if (pcRef.current) {
      try { pcRef.current.close() } catch { /* ignore */ }
      pcRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (audioElRef.current) {
      audioElRef.current.srcObject = null
      audioElRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => cleanup()
  }, [cleanup])

  const startSession = useCallback(async () => {
    setStatus('connecting')
    setError(null)
    setTranscript([])
    setCurrentAssistantText('')
    setCurrentUserText('')
    transcriptRef.current = []

    try {
      // 1. Get ephemeral token
      const tokenRes = await fetch('/api/ai/intake/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!tokenRes.ok) {
        const errData = await tokenRes.json().catch(() => ({}))
        throw new Error(errData.error || `Failed to get session token (${tokenRes.status})`)
      }

      const { ephemeralKey } = await tokenRes.json()
      if (!ephemeralKey) throw new Error('No ephemeral key returned')

      // 2. Create RTCPeerConnection
      const pc = new RTCPeerConnection()
      pcRef.current = pc

      // 3. Audio playback
      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      // @ts-expect-error - playsinline is valid for iOS Safari
      audioEl.playsInline = true
      audioElRef.current = audioEl

      pc.ontrack = (event) => {
        audioEl.srcObject = event.streams[0]
      }

      // 4. Get user mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      // 5. Create data channel
      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc

      dc.onopen = () => {
        setStatus('active')
        startTimeRef.current = Date.now()
        timerRef.current = setInterval(() => {
          setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000))
        }, 1000)
      }

      dc.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          handleRealtimeEvent(msg)
        } catch {
          // Ignore unparseable events
        }
      }

      dc.onclose = () => {
        if (status === 'active') {
          setStatus('complete')
          cleanup()
        }
      }

      // 6. Create and set local SDP offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // 7. Exchange SDP with OpenAI
      const sdpRes = await fetch('https://api.openai.com/v1/realtime?model=gpt-realtime', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      })

      if (!sdpRes.ok) throw new Error(`SDP exchange failed: ${sdpRes.status}`)

      const answerSdp = await sdpRes.text()
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
    } catch (err: any) {
      console.error('Voice intake session error:', err)
      setError(err?.message || 'Failed to start voice session')
      setStatus('error')
      cleanup()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRealtimeEvent = useCallback((msg: Record<string, any>) => {
    const type = msg.type

    // User speech transcript
    if (type === 'conversation.item.input_audio_transcription.completed') {
      const text = msg.transcript?.trim()
      if (text) {
        if (checkSafety(text)) {
          setStatus('safety_escalation')
        }
        const entry: TranscriptEntry = { role: 'user', text }
        transcriptRef.current = [...transcriptRef.current, entry]
        setTranscript([...transcriptRef.current])
        setCurrentUserText('')
      }
    }

    // AI speech started
    if (type === 'response.audio_transcript.delta') {
      setIsAiSpeaking(true)
      setCurrentAssistantText(prev => prev + (msg.delta || ''))
    }

    // AI speech done
    if (type === 'response.audio_transcript.done') {
      const text = msg.transcript?.trim() || currentAssistantText
      if (text) {
        const entry: TranscriptEntry = { role: 'assistant', text }
        transcriptRef.current = [...transcriptRef.current, entry]
        setTranscript([...transcriptRef.current])
      }
      setCurrentAssistantText('')
      setIsAiSpeaking(false)
    }

    // Tool call — the model is saving structured intake data
    if (type === 'response.function_call_arguments.done') {
      if (msg.name === 'save_intake_data') {
        try {
          const data = JSON.parse(msg.arguments)
          console.log('[Sevaro Analytics] voice_intake_completed', { fieldsCollected: Object.keys(data).length, timestamp: new Date().toISOString() })
          setIntakeData(data)

          // Send tool result back so the model can deliver closing message
          if (dcRef.current?.readyState === 'open') {
            dcRef.current.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: msg.call_id,
                output: JSON.stringify({ success: true }),
              },
            }))
            dcRef.current.send(JSON.stringify({ type: 'response.create' }))
          }

          // Auto-complete after a brief delay for the closing message
          setTimeout(() => {
            setStatus('complete')
            cleanup()
            onComplete(data)
          }, 3000)
        } catch (err) {
          console.error('Failed to parse intake tool call:', err)
        }
      }
    }

    // User speech activity
    if (type === 'input_audio_buffer.speech_started') {
      setCurrentUserText('...')
    }
    if (type === 'input_audio_buffer.speech_stopped') {
      setCurrentUserText('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkSafety, cleanup, onComplete])

  const endSession = useCallback(() => {
    setStatus('ending')
    cleanup()

    // If we collected data, complete with it
    if (Object.keys(intakeData).length > 0) {
      onComplete(intakeData)
    }
    setStatus('complete')
  }, [cleanup, intakeData, onComplete])

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div style={{
      background: '#0f172a',
      borderRadius: '12px',
      border: '1px solid #334155',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '500px',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #334155',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #8B5CF6, #A78BFA)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2" />
            </svg>
          </div>
          <div>
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'white' }}>
              Voice AI Intake
            </span>
            {status === 'active' && (
              <span style={{ marginLeft: '8px', fontSize: '12px', color: '#94a3b8' }}>
                {formatDuration(duration)}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '13px',
            textDecoration: 'underline',
          }}
        >
          Switch to Form
        </button>
      </div>

      {/* Progress indicator */}
      <div
        role="status"
        aria-live="polite"
        style={{
          padding: '8px 20px',
          borderBottom: '1px solid #334155',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <div style={{
          flex: 1,
          height: '6px',
          borderRadius: '3px',
          background: '#1e293b',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${(fieldsCollected / REQUIRED_FIELDS.length) * 100}%`,
            height: '100%',
            borderRadius: '3px',
            background: fieldsCollected === REQUIRED_FIELDS.length
              ? '#22c55e'
              : 'linear-gradient(90deg, #8B5CF6, #A78BFA)',
            transition: 'width 0.4s ease',
          }} />
        </div>
        <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
          {fieldsCollected} of {REQUIRED_FIELDS.length} fields
        </span>
      </div>

      {/* Main content area */}
      {status === 'idle' ? (
        /* Start screen */
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          gap: '16px',
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #8B5CF6, #A78BFA)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 30px rgba(139, 92, 246, 0.3)',
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </div>
          <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: 600, margin: 0 }}>
            Welcome to Voice Intake
          </h3>
          <p style={{ color: '#94a3b8', fontSize: '14px', textAlign: 'center', maxWidth: '320px', lineHeight: '1.6' }}>
            Have a quick conversation with our AI assistant to complete your intake form. Just speak naturally — it&apos;ll feel like talking to a receptionist. You&apos;ll need to allow microphone access when prompted.
          </p>
          <button
            onClick={startSession}
            style={{
              padding: '12px 32px',
              borderRadius: '8px',
              background: '#8B5CF6',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            🎙️ Start Voice Intake
          </button>
        </div>
      ) : status === 'connecting' ? (
        /* Connecting screen */
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            border: '3px solid #334155',
            borderTopColor: '#8B5CF6',
            animation: 'spin 1s linear infinite',
          }} />
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>Connecting...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      ) : status === 'error' ? (
        /* Error screen */
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          gap: '16px',
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(239,68,68,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <p style={{ color: '#fca5a5', fontSize: '14px', textAlign: 'center' }}>
            {error || 'Something went wrong.'}
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => { setStatus('idle'); setError(null) }}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                background: '#8B5CF6',
                color: '#fff',
                border: 'none',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
            <button
              onClick={onCancel}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                background: 'transparent',
                color: '#94a3b8',
                border: '1px solid #334155',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Use Form Instead
            </button>
          </div>
        </div>
      ) : status === 'safety_escalation' ? (
        /* Safety escalation */
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          gap: '16px',
        }}>
          <div style={{
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '12px',
            padding: '20px',
            textAlign: 'center',
          }}>
            <p style={{ color: '#fca5a5', fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
              ⚠️ Your safety is important
            </p>
            <p style={{ color: '#fca5a5', fontSize: '14px', lineHeight: '1.6' }}>
              If you&apos;re experiencing a medical emergency, call <strong>911</strong>.<br />
              For crisis support, call <strong>988</strong> (Suicide & Crisis Lifeline)<br />
              or text <strong>HOME</strong> to <strong>741741</strong>.
            </p>
          </div>
        </div>
      ) : (
        /* Active session — transcript + voice orb */
        <>
          {/* Transcript */}
          <div
            role="log"
            aria-live="polite"
            aria-label="Voice intake conversation"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {transcript.map((entry, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: entry.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: entry.role === 'user' ? '#8B5CF6' : '#1e293b',
                  color: 'white',
                  fontSize: '13px',
                  lineHeight: '1.5',
                }}>
                  {entry.text}
                </div>
              </div>
            ))}
            {currentAssistantText && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: '#1e293b',
                  color: '#94a3b8',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  fontStyle: 'italic',
                }}>
                  {currentAssistantText}
                </div>
              </div>
            )}
            {currentUserText && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: 'rgba(139,92,246,0.3)',
                  color: '#c4b5fd',
                  fontSize: '13px',
                }}>
                  Listening...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Voice orb + controls */}
          <div style={{
            padding: '16px 20px',
            borderTop: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
          }}>
            {/* Voice orb */}
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: isAiSpeaking
                ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                : 'linear-gradient(135deg, #8B5CF6, #A78BFA)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isAiSpeaking
                ? '0 0 20px rgba(34, 197, 94, 0.4)'
                : '0 0 20px rgba(139, 92, 246, 0.3)',
              animation: status === 'active' ? 'pulse 2s ease-in-out infinite' : 'none',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path d="M19 10v2a7 7 0 01-14 0v-2" />
              </svg>
            </div>
            <style>{`@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }`}</style>

            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              {isAiSpeaking ? 'AI is speaking...' : 'Listening...'}
            </span>

            <button
              onClick={endSession}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                background: 'rgba(239,68,68,0.15)',
                color: '#fca5a5',
                border: '1px solid rgba(239,68,68,0.3)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              End Session
            </button>
          </div>
        </>
      )}
    </div>
  )
}
