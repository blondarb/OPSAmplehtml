'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { TranscriptEntry, PatientScenario, EscalationFlag } from '@/lib/follow-up/types'
import { scanForEscalationTriggers, escalationFlagFromToolOutput } from '@/lib/follow-up/escalationRules'
import type { VoiceEvent, VoiceProvider } from '@/lib/voice/types'
import { selectProvider, makeProvider } from '@/lib/voice/selectProvider'

type SessionStatus = 'idle' | 'connecting' | 'active' | 'ending' | 'complete' | 'error' | 'safety_escalation'

export interface UseFollowUpRealtimeSessionOptions {
  scenario: PatientScenario
  /**
   * Optional voice provider override ('nova' | 'openai'). When omitted the
   * provider is resolved by selectProvider() (env-driven, defaults to Nova).
   * The session route also returns a `provider` — when present it is honored,
   * so this override is mostly for tests / forced selection.
   */
  provider?: 'nova' | 'openai'
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

  // The active VoiceProvider owns ALL transport (WebRTC peer / WS relay, mic,
  // audio playback, data channel). The hook never touches transport directly.
  const providerRef = useRef<VoiceProvider | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const escalationFlagsRef = useRef<EscalationFlag[]>([])
  const safetyEscalatedRef = useRef<boolean>(false)
  const transcriptRef = useRef<TranscriptEntry[]>([])

  // NOTE (echo handling): the pre-migration hook explicitly muted the mic track
  // while the AI spoke (muteMic / unmuteMicAfterDelay) to suppress
  // speakerphone echo on a one-sided demo line. That track-level muting was
  // DROPPED in the Nova migration — the mic is now owned by the VoiceProvider
  // and the hook can no longer reach the track. We rely instead on the
  // providers' built-in getUserMedia echoCancellation/noiseSuppression/
  // autoGainControl (both providers enable these) plus Nova's barge-in. This
  // matches the refactored historian hook. VALIDATION ITEM: confirm on-device
  // that speakerphone echo no longer breaks the AI mid-sentence without the
  // explicit mute, especially on iOS Safari / speakerphone setups.

  // Store callbacks in refs to avoid dependency churn
  const onSafetyEscalationRef = useRef(options.onSafetyEscalation)
  const onEscalationRef = useRef(options.onEscalation)
  const onCompleteRef = useRef(options.onComplete)
  useEffect(() => {
    onSafetyEscalationRef.current = options.onSafetyEscalation
    onEscalationRef.current = options.onEscalation
    onCompleteRef.current = options.onComplete
  }, [options.onSafetyEscalation, options.onEscalation, options.onComplete])

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
    // Stop the duration timer. Transport teardown is owned by the provider
    // (provider.stop()), invoked from endSession / unmount — NOT here.
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // ── Tool execution: same per-tool logic that lived in handleServerEvent's
  // response.done branch, now keyed off the normalized `toolCall` VoiceEvent
  // and replying via provider.sendToolResult instead of writing
  // function_call_output to the data channel.
  const handleToolCall = useCallback((toolName: string, toolUseId: string, input: unknown) => {
    const provider = providerRef.current
    const args: unknown = (input && typeof input === 'object') ? input : {}

    if (toolName === 'save_followup_output') {
      try {
        // Surface the AI's own escalation assessment. The save_followup_output
        // tool reports it via the flat escalation_triggered / escalation_tier /
        // escalation_reason fields (see FOLLOWUP_TOOL in the realtime-session
        // route) — NOT a structured `escalation_flags` array, which this hook
        // used to read and which the schema never declares. Convert those
        // fields into an EscalationFlag so the AI-detected tier/reason reaches
        // the clinician dashboard via onEscalation, alongside the client-side
        // regex net in checkEscalation.
        const aiFlag = escalationFlagFromToolOutput(args)
        if (aiFlag) {
          escalationFlagsRef.current = [...escalationFlagsRef.current, aiFlag]
          onEscalationRef.current?.(aiFlag)
        }

        // Acknowledge the tool call so the model can respond. The provider owns
        // the round-trip: OpenAI posts function_call_output + response.create;
        // Nova self-triggers its next turn.
        provider?.sendToolResult(toolUseId, { success: true })
      } catch (e) {
        console.error('Error handling save_followup_output:', e)
      }
      return
    }
  }, [])

  // ── Normalized provider event handler — replaces handleServerEvent.
  // Routes provider-agnostic VoiceEvents to the SAME harness logic as before.
  const handleVoiceEvent = useCallback((e: VoiceEvent) => {
    switch (e.type) {
      case 'assistantTextDelta': {
        // Streaming AI text (was response.audio_transcript.delta)
        setCurrentAssistantText(prev => prev + (e.text || ''))
        setIsAiSpeaking(true)
        break
      }

      case 'assistantTranscript': {
        // AI finished speaking this response (was response.audio_transcript.done)
        const fullText = e.text || ''
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
        break
      }

      case 'userTranscript': {
        // User finished speaking (was input_audio_transcription.completed)
        const userText = e.text || ''
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

      case 'userSpeechStart': {
        // NOTE: emitted only by the OpenAI provider (input_audio_buffer.
        // speech_started). Nova does not forward user-speech VAD boundaries, so
        // under Nova isUserSpeaking stays false — best-effort indicator only.
        setIsUserSpeaking(true)
        setCurrentUserText('(listening...)')
        break
      }

      case 'userSpeechStop': {
        setIsUserSpeaking(false)
        break
      }

      case 'aiSpeechStart': {
        setIsAiSpeaking(true)
        break
      }

      case 'aiSpeechStop': {
        setIsAiSpeaking(false)
        break
      }

      case 'toolCall': {
        handleToolCall(e.toolName, e.toolUseId, e.input)
        break
      }

      case 'error': {
        console.error('Voice provider error:', e.message)
        setError(e.message || 'Voice provider error')
        break
      }
    }
  }, [checkSafety, checkEscalation, handleToolCall])

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
      // 1. Fetch provider config from the session route. The route returns
      //    provider-native config: for OpenAI an ephemeral key + tools; for
      //    Nova a relayUrl + voiceId + Nova-shaped tools. We forward our
      //    optional override so the route can mint the matching session.
      const tokenRes = await fetch('/api/follow-up/realtime-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_context: options.scenario,
          provider: options.provider,
        }),
      })

      if (!tokenRes.ok) {
        const errData = await tokenRes.json().catch(() => ({}))
        throw new Error(errData.error || `Failed to get session token (${tokenRes.status})`)
      }

      const sessionConfig = await tokenRes.json()
      const {
        ephemeralKey,
        model: sessionModel,
        instructions: sessionInstructions,
        tools: sessionTools,
        voiceId,
        relayUrl,
      } = sessionConfig

      // 2. Resolve the provider kind. The route's `provider` field wins (it
      //    minted the session for that kind); fall back to selectProvider with
      //    our optional override.
      const kind: 'nova' | 'openai' =
        sessionConfig.provider === 'openai' || sessionConfig.provider === 'nova'
          ? sessionConfig.provider
          : selectProvider(options.provider)

      // OpenAI requires the ephemeral key; Nova does not.
      if (kind === 'openai' && !ephemeralKey) throw new Error('No ephemeral key returned')

      // 3. Instantiate the provider and wire the single normalized event sink.
      const provider = makeProvider(kind)
      providerRef.current = provider
      provider.on(handleVoiceEvent)

      // 4. Open the transport. The provider ignores fields it doesn't need
      //    (OpenAI ignores relayUrl; Nova ignores ephemeralKey/model).
      await provider.start({
        instructions: sessionInstructions ?? '',
        tools: sessionTools ?? [],
        voiceId,
        ephemeralKey,
        model: sessionModel,
        relayUrl,
      })

      // 5. Start timer
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
      // Tear down any half-open transport the provider may have allocated.
      try { await providerRef.current?.stop() } catch {}
      providerRef.current = null
    }
  }, [options.scenario, options.provider, cleanup, handleVoiceEvent])

  const endSession = useCallback(() => {
    setStatus('ending')

    const finalDuration = Math.floor((Date.now() - startTimeRef.current) / 1000)
    setDuration(finalDuration)

    // Stop the timer, then tear the transport down via the provider.
    cleanup()
    const provider = providerRef.current
    providerRef.current = null
    if (provider) {
      // Fire-and-forget; teardown is idempotent and we don't block completion.
      provider.stop().catch(() => {})
    }

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
      // Best-effort transport teardown on unmount.
      try { providerRef.current?.stop() } catch {}
      providerRef.current = null
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
