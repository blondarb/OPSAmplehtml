'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { TranscriptEntry, PatientScenario, EscalationFlag } from '@/lib/follow-up/types'
import { scanForEscalationTriggers } from '@/lib/follow-up/escalationRules'

type SessionStatus = 'idle' | 'connecting' | 'active' | 'ending' | 'complete' | 'error' | 'safety_escalation'

export interface UseFollowUpRealtimeSessionOptions {
  scenario: PatientScenario
  onSafetyEscalation?: () => void
  onEscalation?: (flag: EscalationFlag) => void
  onComplete?: (data: {
    transcript: TranscriptEntry[]
    duration: number
    escalationFlags: EscalationFlag[]
  }) => void
}

interface UseFollowUpRealtimeSessionResult {
  status: SessionStatus
  transcript: TranscriptEntry[]
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
  'seizure', 'stroke', 'chest pain', 'can\'t breathe',
  'allergic reaction', 'anaphylaxis', 'fall', 'hit my head',
  'lost consciousness', 'can\'t see', 'vision loss', 'stopped taking',
]

export function useFollowUpRealtimeSession(
  options: UseFollowUpRealtimeSessionOptions
): UseFollowUpRealtimeSessionResult {
  const [status, setStatus] = useState<SessionStatus>('idle')
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
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
  const micTrackRef = useRef<MediaStreamTrack | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const unmuteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startTimeRef = useRef<number>(0)
  const escalationFlagsRef = useRef<EscalationFlag[]>([])
  const safetyEscalatedRef = useRef<boolean>(false)
  const transcriptRef = useRef<TranscriptEntry[]>([])
  const aiSpeakingRef = useRef<boolean>(false)
  const responseHadAudioRef = useRef<boolean>(false)

  // Store callbacks in refs to avoid dependency churn
  const onSafetyEscalationRef = useRef(options.onSafetyEscalation)
  const onEscalationRef = useRef(options.onEscalation)
  const onCompleteRef = useRef(options.onComplete)
  useEffect(() => {
    onSafetyEscalationRef.current = options.onSafetyEscalation
    onEscalationRef.current = options.onEscalation
    onCompleteRef.current = options.onComplete
  }, [options.onSafetyEscalation, options.onEscalation, options.onComplete])

  // Mute mic to prevent echo when AI is speaking
  const muteMic = useCallback(() => {
    if (micTrackRef.current) {
      micTrackRef.current.enabled = false
    }
    // Cancel any pending unmute
    if (unmuteTimerRef.current) {
      clearTimeout(unmuteTimerRef.current)
      unmuteTimerRef.current = null
    }
  }, [])

  // Unmute mic after a delay to catch trailing echo
  const unmuteMicAfterDelay = useCallback((delayMs = 350) => {
    // Cancel any existing unmute timer
    if (unmuteTimerRef.current) {
      clearTimeout(unmuteTimerRef.current)
    }
    unmuteTimerRef.current = setTimeout(() => {
      if (micTrackRef.current) {
        micTrackRef.current.enabled = true
      }
      unmuteTimerRef.current = null
    }, delayMs)
  }, [])

  // Safety keyword check (secondary defense)
  const checkSafety = useCallback((text: string) => {
    const lower = text.toLowerCase()
    for (const kw of SAFETY_KEYWORDS) {
      if (lower.includes(kw)) {
        safetyEscalatedRef.current = true
        setStatus('safety_escalation')
        onSafetyEscalationRef.current?.()
        return true
      }
    }
    return false
  }, [])

  // Escalation trigger check via regex rules
  const checkEscalation = useCallback((text: string) => {
    const flags = scanForEscalationTriggers(text)
    if (flags.length > 0) {
      escalationFlagsRef.current = [...escalationFlagsRef.current, ...flags]
      for (const flag of flags) {
        onEscalationRef.current?.(flag)
      }
    }
  }, [])

  const cleanup = useCallback(() => {
    if (unmuteTimerRef.current) {
      clearTimeout(unmuteTimerRef.current)
      unmuteTimerRef.current = null
    }
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
    micTrackRef.current = null
    aiSpeakingRef.current = false
    responseHadAudioRef.current = false
    if (audioElRef.current) {
      audioElRef.current.srcObject = null
      // Remove from DOM if we appended it
      audioElRef.current.remove()
      audioElRef.current = null
    }
  }, [])

  // Handle server events from the data channel
  const handleServerEvent = useCallback((msg: any) => {
    switch (msg.type) {
      // ── Mute mic BEFORE audio begins ──────────────────────────
      case 'response.created': {
        // This fires before any audio output — mute mic immediately
        // to prevent echo from being captured
        muteMic()
        aiSpeakingRef.current = true
        responseHadAudioRef.current = false
        break
      }

      case 'response.audio_transcript.delta': {
        // Streaming AI text transcript (audio plays concurrently via WebRTC)
        responseHadAudioRef.current = true
        setCurrentAssistantText(prev => prev + (msg.delta || ''))
        setIsAiSpeaking(true)
        break
      }

      case 'response.audio_transcript.done': {
        // AI finished speaking this response — unmute mic after delay
        const fullText = msg.transcript || ''
        if (fullText.trim()) {
          const entry: TranscriptEntry = {
            role: 'agent',
            text: fullText.trim(),
            timestamp: Math.floor((Date.now() - startTimeRef.current) / 1000),
          }
          transcriptRef.current = [...transcriptRef.current, entry]
          setTranscript([...transcriptRef.current])
        }
        setCurrentAssistantText('')
        setIsAiSpeaking(false)
        aiSpeakingRef.current = false
        // Unmute mic after delay so trailing echo dissipates
        unmuteMicAfterDelay(400)
        break
      }

      // ── User speech events ────────────────────────────────────
      case 'conversation.item.input_audio_transcription.completed': {
        // User finished speaking — their audio was transcribed
        const userText = msg.transcript || ''
        if (userText.trim()) {
          const entry: TranscriptEntry = {
            role: 'patient',
            text: userText.trim(),
            timestamp: Math.floor((Date.now() - startTimeRef.current) / 1000),
          }
          transcriptRef.current = [...transcriptRef.current, entry]
          setTranscript([...transcriptRef.current])
          // Safety check on user speech
          checkSafety(userText)
          // Escalation trigger check on user speech
          checkEscalation(userText)
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

      // ── Response complete ─────────────────────────────────────
      case 'response.done': {
        // If response had no audio (e.g. tool-call only), unmute as fallback
        // but only if we're not about to trigger another response
        let triggeredFollowUp = false

        // Check if the response includes a tool call (save_followup_output)
        const output = msg.response?.output
        if (output && Array.isArray(output)) {
          for (const item of output) {
            if (item.type === 'function_call' && item.name === 'save_followup_output') {
              triggeredFollowUp = true
              try {
                const args = JSON.parse(item.arguments || '{}')

                // Extract any escalation flags from the AI output
                if (args.escalation_flags && Array.isArray(args.escalation_flags)) {
                  for (const flag of args.escalation_flags) {
                    const escalation: EscalationFlag = {
                      tier: flag.tier || 'informational',
                      triggerText: flag.trigger_text || '',
                      category: flag.category || 'ai_detected',
                      aiAssessment: flag.ai_assessment || '',
                      recommendedAction: flag.recommended_action || '',
                      timestamp: new Date().toISOString(),
                    }
                    escalationFlagsRef.current = [...escalationFlagsRef.current, escalation]
                    onEscalationRef.current?.(escalation)
                  }
                }

                // Send function call output back so the model can respond
                // (this will trigger response.created → mic stays muted)
                if (dcRef.current?.readyState === 'open') {
                  dcRef.current.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                      type: 'function_call_output',
                      call_id: item.call_id,
                      output: JSON.stringify({ success: true }),
                    },
                  }))
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

        // Fallback unmute: if response had no audio and didn't trigger follow-up
        if (!responseHadAudioRef.current && !triggeredFollowUp) {
          aiSpeakingRef.current = false
          unmuteMicAfterDelay(400)
        }
        break
      }

      case 'error': {
        console.error('Realtime API error:', msg.error)
        setError(msg.error?.message || 'Realtime API error')
        // Unmute on error so user isn't stuck muted
        aiSpeakingRef.current = false
        unmuteMicAfterDelay(0)
        break
      }
    }
  }, [checkSafety, checkEscalation, muteMic, unmuteMicAfterDelay])

  const startSession = useCallback(async () => {
    setStatus('connecting')
    setError(null)
    setTranscript([])
    setCurrentAssistantText('')
    setCurrentUserText('')
    transcriptRef.current = []
    escalationFlagsRef.current = []
    safetyEscalatedRef.current = false

    try {
      // 1. Get ephemeral token
      const tokenRes = await fetch('/api/follow-up/realtime-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_context: options.scenario,
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

      // 3. Set up remote audio playback — append to DOM for better browser support
      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      // @ts-expect-error - playsinline is valid for iOS Safari
      audioEl.playsInline = true
      audioEl.style.display = 'none'
      document.body.appendChild(audioEl)
      audioElRef.current = audioEl

      pc.ontrack = (event) => {
        audioEl.srcObject = event.streams[0]
        // Force play in case autoplay was blocked
        audioEl.play().catch(() => {
          console.warn('Audio autoplay blocked — user may need to interact')
        })
      }

      // 4. Get user mic with echo cancellation and noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream
      const audioTrack = stream.getAudioTracks()[0]
      micTrackRef.current = audioTrack
      // Start mic MUTED — the first AI greeting will play immediately,
      // and we don't want to capture it. Mic unmutes after AI finishes speaking.
      audioTrack.enabled = false
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
      const sdpRes = await fetch('https://api.openai.com/v1/realtime?model=gpt-realtime', {
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
      console.error('Failed to start follow-up realtime session:', err)
      setError(err.message || 'Failed to start session')
      setStatus('error')
      cleanup()
    }
  }, [options.scenario, cleanup, handleServerEvent])

  const endSession = useCallback(() => {
    setStatus('ending')

    const finalDuration = Math.floor((Date.now() - startTimeRef.current) / 1000)
    setDuration(finalDuration)

    cleanup()

    // Fire completion callback via ref (avoids stale closure)
    onCompleteRef.current?.({
      transcript: transcriptRef.current,
      duration: finalDuration,
      escalationFlags: escalationFlagsRef.current,
    })

    setStatus('complete')
  }, [cleanup])

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
