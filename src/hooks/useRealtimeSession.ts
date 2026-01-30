'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { HistorianTranscriptEntry, HistorianStructuredOutput, HistorianRedFlag, HistorianSessionType } from '@/lib/historianTypes'

type SessionStatus = 'idle' | 'connecting' | 'active' | 'ending' | 'complete' | 'error' | 'safety_escalation'

interface UseRealtimeSessionOptions {
  sessionType: HistorianSessionType
  referralReason?: string
  patientName?: string
  onSafetyEscalation?: () => void
  onComplete?: (data: {
    structuredOutput: HistorianStructuredOutput | null
    narrativeSummary: string | null
    redFlags: HistorianRedFlag[]
    safetyEscalated: boolean
    transcript: HistorianTranscriptEntry[]
    duration: number
    questionCount: number
  }) => void
}

interface UseRealtimeSessionResult {
  status: SessionStatus
  transcript: HistorianTranscriptEntry[]
  currentAssistantText: string
  currentUserText: string
  isAiSpeaking: boolean
  isUserSpeaking: boolean
  duration: number
  error: string | null
  startSession: () => Promise<void>
  endSession: () => void
}

const SAFETY_KEYWORDS = [
  'kill myself', 'want to die', 'hurt myself', 'end my life',
  'suicide', 'suicidal', 'self-harm', 'don\'t want to live',
  'hurt someone', 'kill someone',
]

export function useRealtimeSession(options: UseRealtimeSessionOptions): UseRealtimeSessionResult {
  const [status, setStatus] = useState<SessionStatus>('idle')
  const [transcript, setTranscript] = useState<HistorianTranscriptEntry[]>([])
  const [currentAssistantText, setCurrentAssistantText] = useState('')
  const [currentUserText, setCurrentUserText] = useState('')
  const [isAiSpeaking, setIsAiSpeaking] = useState(false)
  const [isUserSpeaking, setIsUserSpeaking] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const questionCountRef = useRef<number>(0)
  const structuredOutputRef = useRef<HistorianStructuredOutput | null>(null)
  const narrativeSummaryRef = useRef<string | null>(null)
  const redFlagsRef = useRef<HistorianRedFlag[]>([])
  const safetyEscalatedRef = useRef<boolean>(false)
  const transcriptRef = useRef<HistorianTranscriptEntry[]>([])

  // Safety keyword check (secondary defense)
  const checkSafety = useCallback((text: string) => {
    const lower = text.toLowerCase()
    for (const kw of SAFETY_KEYWORDS) {
      if (lower.includes(kw)) {
        safetyEscalatedRef.current = true
        setStatus('safety_escalation')
        options.onSafetyEscalation?.()
        return true
      }
    }
    return false
  }, [options])

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (dcRef.current) {
      try { dcRef.current.close() } catch {}
      dcRef.current = null
    }
    if (pcRef.current) {
      try { pcRef.current.close() } catch {}
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

  const startSession = useCallback(async () => {
    setStatus('connecting')
    setError(null)
    setTranscript([])
    setCurrentAssistantText('')
    setCurrentUserText('')
    transcriptRef.current = []
    questionCountRef.current = 0
    structuredOutputRef.current = null
    narrativeSummaryRef.current = null
    redFlagsRef.current = []
    safetyEscalatedRef.current = false

    try {
      // 1. Get ephemeral token
      const tokenRes = await fetch('/api/ai/historian/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionType: options.sessionType,
          referralReason: options.referralReason,
        }),
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

      // 3. Set up remote audio playback
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

      // 5. Create data channel for events
      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc

      dc.onopen = () => {
        // Session is connected, send initial response.create to kick things off
        dc.send(JSON.stringify({
          type: 'response.create',
          response: {
            modalities: ['text', 'audio'],
          },
        }))
      }

      dc.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          handleServerEvent(msg)
        } catch {}
      }

      // 6. SDP offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // 7. Send offer to OpenAI, get answer
      const sdpRes = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      })

      if (!sdpRes.ok) {
        throw new Error(`WebRTC SDP exchange failed (${sdpRes.status})`)
      }

      const answerSdp = await sdpRes.text()
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

      // 8. Start timer
      startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 1000)

      setStatus('active')
    } catch (err: any) {
      console.error('Failed to start realtime session:', err)
      setError(err.message || 'Failed to start session')
      setStatus('error')
      cleanup()
    }
  }, [options.sessionType, options.referralReason, cleanup])

  // Handle server events from the data channel
  const handleServerEvent = useCallback((msg: any) => {
    switch (msg.type) {
      case 'response.audio_transcript.delta': {
        // Streaming AI text
        setCurrentAssistantText(prev => prev + (msg.delta || ''))
        setIsAiSpeaking(true)
        break
      }

      case 'response.audio_transcript.done': {
        // AI finished speaking this response
        const fullText = msg.transcript || ''
        if (fullText.trim()) {
          const entry: HistorianTranscriptEntry = {
            role: 'assistant',
            text: fullText.trim(),
            timestamp: Math.floor((Date.now() - startTimeRef.current) / 1000),
          }
          transcriptRef.current = [...transcriptRef.current, entry]
          setTranscript([...transcriptRef.current])
          questionCountRef.current += 1
        }
        setCurrentAssistantText('')
        setIsAiSpeaking(false)
        break
      }

      case 'conversation.item.input_audio_transcription.completed': {
        // User finished speaking
        const userText = msg.transcript || ''
        if (userText.trim()) {
          const entry: HistorianTranscriptEntry = {
            role: 'user',
            text: userText.trim(),
            timestamp: Math.floor((Date.now() - startTimeRef.current) / 1000),
          }
          transcriptRef.current = [...transcriptRef.current, entry]
          setTranscript([...transcriptRef.current])
          // Safety check on user speech
          checkSafety(userText)
        }
        setCurrentUserText('')
        setIsUserSpeaking(false)
        break
      }

      case 'input_audio_buffer.speech_started': {
        setIsUserSpeaking(true)
        setCurrentUserText('(listening...)')
        break
      }

      case 'input_audio_buffer.speech_stopped': {
        setIsUserSpeaking(false)
        break
      }

      case 'response.done': {
        // Check if the response includes a tool call (structured output)
        const output = msg.response?.output
        if (output && Array.isArray(output)) {
          for (const item of output) {
            if (item.type === 'function_call' && item.name === 'save_interview_output') {
              try {
                const args = JSON.parse(item.arguments || '{}')
                // Extract structured data
                const { narrative_summary, red_flags, safety_escalated, ...structured } = args
                structuredOutputRef.current = structured
                narrativeSummaryRef.current = narrative_summary || null
                if (red_flags && Array.isArray(red_flags)) {
                  redFlagsRef.current = red_flags
                }
                if (safety_escalated) {
                  safetyEscalatedRef.current = true
                }

                // Send function call output back so the model can respond
                if (dcRef.current?.readyState === 'open') {
                  dcRef.current.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                      type: 'function_call_output',
                      call_id: item.call_id,
                      output: JSON.stringify({ success: true }),
                    },
                  }))
                  // Let the model generate a closing response
                  dcRef.current.send(JSON.stringify({
                    type: 'response.create',
                    response: {
                      modalities: ['text', 'audio'],
                    },
                  }))
                }
              } catch (e) {
                console.error('Error parsing tool call:', e)
              }
            }
          }
        }
        break
      }

      case 'error': {
        console.error('Realtime API error:', msg.error)
        setError(msg.error?.message || 'Realtime API error')
        break
      }
    }
  }, [checkSafety])

  const endSession = useCallback(() => {
    setStatus('ending')

    const finalDuration = Math.floor((Date.now() - startTimeRef.current) / 1000)
    setDuration(finalDuration)

    cleanup()

    // Fire completion callback
    options.onComplete?.({
      structuredOutput: structuredOutputRef.current,
      narrativeSummary: narrativeSummaryRef.current,
      redFlags: redFlagsRef.current,
      safetyEscalated: safetyEscalatedRef.current,
      transcript: transcriptRef.current,
      duration: finalDuration,
      questionCount: questionCountRef.current,
    })

    setStatus('complete')
  }, [cleanup, options])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  return {
    status,
    transcript,
    currentAssistantText,
    currentUserText,
    isAiSpeaking,
    isUserSpeaking,
    duration,
    error,
    startSession,
    endSession,
  }
}
