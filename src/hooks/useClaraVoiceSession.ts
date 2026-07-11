'use client'

/**
 * useClaraVoiceSession — focused voice hook for the Clara browser test
 * surface (/rnd/clara).
 *
 * Deliberately NOT a reuse of useRealtimeSession.ts — that hook is >900
 * lines of historian-specific orchestration (localizer, scale
 * administration, save_interview_output tool flow, consult pipeline
 * linkage) that doesn't apply here. Instead this hook reuses the SAME
 * underlying transport the historian's Nova path uses —
 * makeProvider('nova') / NovaSonicWsProvider — so it rides the identical,
 * already-deployed relay (services/nova-sonic-relay) and the same
 * VoiceEvent contract, without rebuilding a WebSocket client from scratch.
 *
 * Per turn: on each finalized user transcript, POSTs to
 * /api/ai/clara/classify (Gate 0 + Clara's rulebook) and attaches the result
 * to that turn. No in-session tool calls — classification runs entirely out
 * of band from the voice loop.
 */

import { useCallback, useRef, useState } from 'react'
import { makeProvider } from '@/lib/voice/selectProvider'
import type { VoiceEvent, VoiceProvider } from '@/lib/voice/providerTypes'

export interface ClaraGate0 {
  fired: boolean
  category: string | null
  matchedTerms: string[]
}

export interface ClaraClassification {
  consultType: string
  confidence: number
  rationale: string
  statLevel: number | null
  redFlags: string[]
  urgencyLevel: string
  needsClarification: boolean
  clarificationQuestions: string[]
  gate0: ClaraGate0
  routing: { action: string; label: string; slaMinutes: number | null }
}

export interface ClaraTurn {
  role: 'user' | 'assistant'
  text: string
  ts: number
  classifying?: boolean
  gate0?: ClaraGate0
  classification?: ClaraClassification
  classifyError?: string
}

export type ClaraSessionStatus = 'idle' | 'connecting' | 'active' | 'ending' | 'error'

export function useClaraVoiceSession() {
  const [status, setStatus] = useState<ClaraSessionStatus>('idle')
  const [turns, setTurns] = useState<ClaraTurn[]>([])
  const [currentAssistantText, setCurrentAssistantText] = useState('')
  const [isAiSpeaking, setIsAiSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emergencyActive, setEmergencyActive] = useState(false)
  const [lastClassification, setLastClassification] = useState<ClaraClassification | null>(null)
  const [loggedSessionId, setLoggedSessionId] = useState<string | null>(null)

  const providerRef = useRef<VoiceProvider | null>(null)
  const turnsRef = useRef<ClaraTurn[]>([])
  const startTimeRef = useRef<number>(0)
  // Echo guard: is Clara speaking right now, and when did she last stop — so we
  // can ignore the mic picking up her own audio (see the userTranscript case).
  const isAiSpeakingRef = useRef(false)
  const lastAiSpeechEndRef = useRef(0)

  const pushTurn = useCallback((turn: ClaraTurn) => {
    turnsRef.current = [...turnsRef.current, turn]
    setTurns(turnsRef.current)
    return turnsRef.current.length - 1
  }, [])

  const updateTurn = useCallback((index: number, patch: Partial<ClaraTurn>) => {
    turnsRef.current = turnsRef.current.map((t, i) => (i === index ? { ...t, ...patch } : t))
    setTurns(turnsRef.current)
  }, [])

  const classifyTurn = useCallback(async (index: number, text: string) => {
    updateTurn(index, { classifying: true })
    try {
      const res = await fetch('/api/ai/clara/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text }),
      })
      const data = await res.json()
      if (!res.ok) {
        updateTurn(index, { classifying: false, classifyError: data?.error || `HTTP ${res.status}` })
        return
      }
      const classification = data as ClaraClassification
      updateTurn(index, { classifying: false, gate0: classification.gate0, classification })
      setLastClassification(classification)
      if (classification.gate0?.fired || classification.urgencyLevel === 'critical') {
        setEmergencyActive(true)
      }
    } catch (err) {
      updateTurn(index, {
        classifying: false,
        classifyError: err instanceof Error ? err.message : String(err),
      })
    }
  }, [updateTurn])

  const handleEvent = useCallback((e: VoiceEvent) => {
    switch (e.type) {
      case 'userTranscript': {
        const text = (e.text || '').trim()
        const now = Date.now()
        // Echo guard: a "caller" transcript that arrives while Clara is speaking —
        // or within ~800ms after — is almost always the mic picking up Clara's own
        // audio (browser echoCancellation is imperfect on laptop/speakerphone).
        // Drop it so her greeting can't appear as a caller turn or fire a premature
        // (often "emergent") classification. Rare cost: a genuine barge-in mid-
        // speech is ignored in this test harness.
        if (!text || isAiSpeakingRef.current || now - lastAiSpeechEndRef.current < 800) {
          break
        }
        const idx = pushTurn({ role: 'user', text, ts: now })
        void classifyTurn(idx, text)
        break
      }
      case 'assistantTranscript': {
        pushTurn({ role: 'assistant', text: e.text, ts: Date.now() })
        setCurrentAssistantText('')
        break
      }
      case 'assistantTextDelta':
        setCurrentAssistantText((t) => t + e.text)
        break
      case 'aiSpeechStart':
        isAiSpeakingRef.current = true
        setIsAiSpeaking(true)
        break
      case 'aiSpeechStop':
        isAiSpeakingRef.current = false
        lastAiSpeechEndRef.current = Date.now()
        setIsAiSpeaking(false)
        break
      case 'error':
        setError(e.message)
        break
      case 'disconnected':
        setStatus((s) => (s === 'ending' ? s : 'idle'))
        break
    }
  }, [pushTurn, classifyTurn])

  const startSession = useCallback(async () => {
    setStatus('connecting')
    setError(null)
    setEmergencyActive(false)
    turnsRef.current = []
    setTurns([])
    setLastClassification(null)
    setLoggedSessionId(null)

    try {
      const res = await fetch('/api/ai/clara/session', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || `session route returned ${res.status}`)
      }
      if (!data.relayUrl) {
        throw new Error('NOVA_SONIC_RELAY_URL is not configured server-side — cannot start a Clara voice session.')
      }

      const provider = makeProvider('nova')
      providerRef.current = provider
      provider.on(handleEvent)

      await provider.start({
        instructions: data.instructions,
        tools: data.tools || [],
        voiceId: data.voiceId,
        relayUrl: data.relayUrl,
        relayToken: data.relayToken,
      })

      startTimeRef.current = Date.now()
      setStatus('active')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
      providerRef.current = null
    }
  }, [handleEvent])

  const endSession = useCallback(async () => {
    setStatus('ending')
    try {
      await providerRef.current?.stop()
    } catch {
      // best-effort teardown
    }
    providerRef.current = null

    const durationSeconds = startTimeRef.current ? Math.round((Date.now() - startTimeRef.current) / 1000) : 0
    const finalTurns = turnsRef.current
    const gate0Fired = finalTurns.some((t) => t.gate0?.fired)
    const last = [...finalTurns].reverse().find((t) => t.classification)?.classification

    try {
      const res = await fetch('/api/ai/clara/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turns: finalTurns,
          durationSeconds,
          gate0Fired,
          consultType: last?.consultType,
          confidence: last?.confidence,
          rationale: last?.rationale,
          statLevel: last?.statLevel,
          redFlags: last?.redFlags,
          urgencyLevel: last?.urgencyLevel,
          needsClarification: last?.needsClarification,
          clarificationQuestions: last?.clarificationQuestions,
          routing: last?.routing,
        }),
      })
      const data = await res.json().catch(() => ({}))
      // Post-call results/feedback UI keys off this — feedback rows FK to
      // clara_test_sessions.id, so feedback can't be submitted until the
      // call is logged and this resolves.
      if (res.ok && data?.session?.id) {
        setLoggedSessionId(data.session.id)
      }
    } catch (err) {
      console.error('[useClaraVoiceSession] session log failed (non-fatal):', err)
    }

    setStatus('idle')
  }, [])

  /**
   * Clears a finished call's transcript/turns/classification/logged-session
   * so the tester can immediately run another scenario — distinct from
   * startSession's own reset (which also opens a new mic/relay session).
   * This is a pure state reset back to "ready to start"; it does NOT touch
   * providerRef, so it must only be called while status is already 'idle'
   * (i.e. after endSession has finished tearing down the prior session).
   * The NEXT startSession() call mints a fresh POST /api/ai/clara/log on
   * endSession, so every call — reset or not — always lands as its own new
   * clara_test_sessions row; nothing here overwrites a prior session.
   */
  const resetSession = useCallback(() => {
    turnsRef.current = []
    setTurns([])
    setCurrentAssistantText('')
    setIsAiSpeaking(false)
    setError(null)
    setEmergencyActive(false)
    setLastClassification(null)
    setLoggedSessionId(null)
    setStatus('idle')
  }, [])

  return {
    status,
    turns,
    currentAssistantText,
    isAiSpeaking,
    error,
    emergencyActive,
    lastClassification,
    loggedSessionId,
    startSession,
    endSession,
    resetSession,
  }
}
