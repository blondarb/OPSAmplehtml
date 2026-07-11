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
  // The single end-of-call disposition — a fresh classification of the WHOLE
  // caller transcript, so there is always a clear "where would this route"
  // answer even when per-turn classification was sparse (e.g. echo-guarded
  // turns). This is what the results panel leads with.
  const [finalClassification, setFinalClassification] = useState<ClaraClassification | null>(null)
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
    // Per-turn classification is a live convenience signal, NOT the authoritative
    // result — the end-of-call Final Disposition re-classifies the whole caller
    // transcript. So a transient per-turn failure (e.g. brief Bedrock throttle
    // when several turns fire in a burst) is retried once, then fails QUIETLY:
    // we record classifyError for diagnostics but never surface it as an alarming
    // banner, because the call still gets a correct Final Disposition.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch('/api/ai/clara/classify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: text }),
        })
        const data = await res.json()
        if (!res.ok) {
          if (attempt === 0) { await new Promise((r) => setTimeout(r, 400)); continue }
          updateTurn(index, { classifying: false, classifyError: data?.error || `HTTP ${res.status}` })
          return
        }
        const classification = data as ClaraClassification
        updateTurn(index, { classifying: false, classifyError: undefined, gate0: classification.gate0, classification })
        setLastClassification(classification)
        if (classification.gate0?.fired || classification.urgencyLevel === 'critical') {
          setEmergencyActive(true)
        }
        return
      } catch (err) {
        if (attempt === 0) { await new Promise((r) => setTimeout(r, 400)); continue }
        updateTurn(index, {
          classifying: false,
          classifyError: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }, [updateTurn])

  const handleEvent = useCallback((e: VoiceEvent) => {
    switch (e.type) {
      case 'userTranscript': {
        // Record EVERY caller utterance — same as the historian
        // (useRealtimeSession), which runs on this exact Nova relay with no
        // echo-guard and transcribes callers cleanly. An earlier blanket
        // echo-guard (drop while Clara is speaking / <800ms after) was eating
        // most legitimate caller turns on a live call: Clara still heard the
        // caller (Nova is speech-to-speech, it doesn't need the text to reply),
        // but their words never reached the transcript OR the classifier — only
        // the very first pre-greeting turn slipped through. Nova's relay only
        // emits userTranscript for actual caller speech (proven by the
        // historian), so the guard was unnecessary and net-harmful.
        const text = (e.text || '').trim()
        if (!text) break
        const idx = pushTurn({ role: 'user', text, ts: Date.now() })
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
    setFinalClassification(null)
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
    const lastPerTurn = [...finalTurns].reverse().find((t) => t.classification)?.classification

    // FINAL DISPOSITION — classify the whole caller transcript once so we always
    // have a definitive "where would this route" answer, even if per-turn
    // classification was sparse. Caller (user) turns only — never Clara's own
    // words, which would false-trigger Gate 0's red-flag intercept.
    const callerText = finalTurns
      .filter((t) => t.role === 'user' && t.text.trim())
      .map((t) => t.text.trim())
      .join('. ')
    let disposition: ClaraClassification | null = lastPerTurn ?? null
    if (callerText) {
      try {
        const fres = await fetch('/api/ai/clara/classify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: callerText }),
        })
        const fdata = await fres.json()
        if (fres.ok) disposition = fdata as ClaraClassification
      } catch {
        // keep per-turn fallback
      }
    }
    setFinalClassification(disposition)

    try {
      const res = await fetch('/api/ai/clara/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turns: finalTurns,
          durationSeconds,
          gate0Fired,
          consultType: disposition?.consultType,
          confidence: disposition?.confidence,
          rationale: disposition?.rationale,
          statLevel: disposition?.statLevel,
          redFlags: disposition?.redFlags,
          urgencyLevel: disposition?.urgencyLevel,
          needsClarification: disposition?.needsClarification,
          clarificationQuestions: disposition?.clarificationQuestions,
          routing: disposition?.routing,
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
    setFinalClassification(null)
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
    finalClassification,
    loggedSessionId,
    startSession,
    endSession,
    resetSession,
  }
}
