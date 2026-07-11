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
        const idx = pushTurn({ role: 'user', text: e.text, ts: Date.now() })
        void classifyTurn(idx, e.text)
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
        setIsAiSpeaking(true)
        break
      case 'aiSpeechStop':
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
  }
}
