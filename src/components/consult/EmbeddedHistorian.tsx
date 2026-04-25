'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRealtimeSession } from '@/hooks/useRealtimeSession'
import type { HistorianStructuredOutput, HistorianRedFlag, HistorianTranscriptEntry, HistorianSessionType } from '@/lib/historianTypes'
import type { LocalizerResponse } from '@/lib/consult/localizer-types'
import type { SaveScaleResponsesArgs, LocalizerSnapshot, TriggeredScale } from '@/lib/consult/scales'
import { getTenantClient } from '@/lib/tenant'
import LocalizerPanel from '@/components/LocalizerPanel'

type Phase = 'ready' | 'connecting' | 'active' | 'ending' | 'saving' | 'complete' | 'safety_escalation'

interface EmbeddedHistorianProps {
  consultId: string
  referralReason: string
  patientName?: string
  sessionType?: HistorianSessionType
  onComplete: () => void
  onError: (msg: string) => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function EmbeddedHistorian({
  consultId,
  referralReason,
  patientName = 'Patient',
  sessionType = 'new_patient',
  onComplete,
  onError,
}: EmbeddedHistorianProps) {
  const [phase, setPhase] = useState<Phase>('ready')
  const [showTranscript, setShowTranscript] = useState(false)
  const [showPhysicianPanel, setShowPhysicianPanel] = useState(false)
  const [autoShownPhysicianPanel, setAutoShownPhysicianPanel] = useState(false)
  const [completionData, setCompletionData] = useState<{
    structuredOutput: HistorianStructuredOutput | null
    narrativeSummary: string | null
    redFlags: HistorianRedFlag[]
    safetyEscalated: boolean
    transcript: HistorianTranscriptEntry[]
    duration: number
    questionCount: number
    endedEarly: boolean
  } | null>(null)

  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const tenant = getTenantClient()

  // Scales that have been injected into the live session (by us, not the AI's choice).
  // Used to deduplicate trigger evaluations so we never re-inject the same scale
  // mid-administration. Completed scales are tracked separately in the hook.
  const injectedScaleIdsRef = useRef<Set<string>>(new Set())
  const scaleAdminInProgressRef = useRef<boolean>(false)
  const [activeScale, setActiveScale] = useState<{ id: string; abbreviation: string } | null>(null)

  const handleSessionComplete = useCallback(async (data: typeof completionData) => {
    if (!data) return
    setCompletionData(data)
    setPhase('saving')

    try {
      const res = await fetch('/api/ai/historian/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenant,
          patient_id: null,
          session_type: sessionType,
          patient_name: patientName,
          referral_reason: referralReason || null,
          structured_output: data.structuredOutput,
          narrative_summary: data.narrativeSummary,
          transcript: data.transcript,
          red_flags: data.redFlags,
          safety_escalated: data.safetyEscalated,
          duration_seconds: data.duration,
          question_count: data.questionCount,
          status: 'completed',
          interview_completion_status: data.endedEarly ? 'ended_early' : 'complete',
          consult_id: consultId,
        }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Save failed (${res.status}): ${body.slice(0, 200)}`)
      }
      setPhase('complete')
      onComplete()
    } catch (err) {
      console.error('Failed to save historian session:', err)
      onError('Failed to save interview data')
      setPhase('complete')
      onComplete()
    }
  }, [tenant, sessionType, patientName, referralReason, consultId, onComplete, onError])

  const handleSafetyEscalation = useCallback(() => {
    setPhase('safety_escalation')
  }, [])

  // Forward declaration so `onLocalizerUpdate` (which lives in the hook
  // options) can reach `injectScaleAdministration` (which lives on the hook
  // result). The ref is populated in an effect once the hook returns.
  const injectScaleAdministrationRef = useRef<((block: string) => void) | null>(null)

  const buildSnapshotFromLocalizer = useCallback((data: LocalizerResponse): LocalizerSnapshot => {
    const diagnoses = data.differential.map((d) => d.diagnosis)
    const symptomSummary = [
      data.localizationHypothesis,
      data.contextHint,
      diagnoses.join(' '),
      referralReason ?? '',
    ].filter(Boolean).join(' ')
    return {
      differentialCategories: diagnoses,
      symptomSummary,
      completedScaleIds: Array.from(injectedScaleIdsRef.current),
    }
  }, [referralReason])

  const handleLocalizerUpdate = useCallback(async (data: LocalizerResponse) => {
    // Don't queue another scale while one is in progress
    if (scaleAdminInProgressRef.current) return
    if (data.differential.length === 0) return

    try {
      const snapshot = buildSnapshotFromLocalizer(data)
      const triggerRes = await fetch('/api/ai/historian/scales?action=trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot, mode: 'broad' }),
      })
      if (!triggerRes.ok) return
      const triggerJson: { enabled: boolean; voiceAdministrable: TriggeredScale[] } = await triggerRes.json()
      if (!triggerJson.enabled) return

      const next = triggerJson.voiceAdministrable.find(
        (s) => !injectedScaleIdsRef.current.has(s.scaleId),
      )
      if (!next) return

      const adminRes = await fetch('/api/ai/historian/scales?action=administer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scale_id: next.scaleId }),
      })
      if (!adminRes.ok) return
      const adminJson: { instruction_block: string; scale_abbreviation: string } = await adminRes.json()

      injectedScaleIdsRef.current.add(next.scaleId)
      scaleAdminInProgressRef.current = true
      setActiveScale({ id: next.scaleId, abbreviation: next.scaleAbbreviation })
      injectScaleAdministrationRef.current?.(adminJson.instruction_block)
    } catch (err) {
      console.warn('[EmbeddedHistorian] Scale trigger evaluation failed (session continues):', err)
    }
  }, [buildSnapshotFromLocalizer])

  const handleScaleComplete = useCallback(async (args: SaveScaleResponsesArgs) => {
    scaleAdminInProgressRef.current = false
    setActiveScale(null)
    try {
      await fetch('/api/ai/historian/scales?action=submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scale_id: args.scale_id,
          responses: args.responses,
          consult_id: consultId,
          admin_mode: 'voice_administrable',
        }),
      })
    } catch (err) {
      console.warn('[EmbeddedHistorian] Scale submit failed (continuing):', err)
    }
  }, [consultId])

  const {
    status,
    transcript,
    currentAssistantText,
    currentUserText,
    isAiSpeaking,
    isUserSpeaking,
    duration,
    error,
    localizerData,
    localizerLoading,
    interviewCompleted,
    startSession,
    endSession,
    injectScaleAdministration,
  } = useRealtimeSession({
    sessionType,
    referralReason,
    patientName,
    consultId,
    enableLocalizer: true,
    onComplete: handleSessionComplete,
    onSafetyEscalation: handleSafetyEscalation,
    onLocalizerUpdate: handleLocalizerUpdate,
    onScaleComplete: handleScaleComplete,
  })

  // Wire the hook's injection function into the ref so onLocalizerUpdate
  // (defined before the hook returns) can call it.
  useEffect(() => {
    injectScaleAdministrationRef.current = injectScaleAdministration
  }, [injectScaleAdministration])

  // Sync hook status to phase
  useEffect(() => {
    if (status === 'connecting') setPhase('connecting')
    else if (status === 'active') setPhase('active')
    else if (status === 'error') setPhase('ready')
    else if (status === 'safety_escalation') setPhase('safety_escalation')
  }, [status])

  // Scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript, currentAssistantText])

  // Auto-open the physician differential panel the first time localizer
  // results arrive, so mobile users (who otherwise might never find the
  // "MD View" toggle in the timer-bar corner) can actually see the
  // running differential during the interview. Only fires once — after
  // that the user is in control of the toggle.
  useEffect(() => {
    if (autoShownPhysicianPanel) return
    if (!localizerData) return
    const hasContent =
      localizerData.differential.length > 0 || !!localizerData.localizationHypothesis
    if (!hasContent) return
    setShowPhysicianPanel(true)
    setAutoShownPhysicianPanel(true)
  }, [localizerData, autoShownPhysicianPanel])

  const handleStart = async () => {
    await startSession()
  }

  const handleEnd = useCallback(() => {
    setPhase('ending')
    endSession()
  }, [endSession])

  // Auto-end the session once the AI Historian has signaled completion
  // (via save_interview_output) and finished speaking its closing message.
  // Small delay prevents clipping the tail of the final audio.
  useEffect(() => {
    if (!interviewCompleted) return
    if (phase !== 'active') return
    if (isAiSpeaking) return
    const t = setTimeout(() => {
      handleEnd()
    }, 1500)
    return () => clearTimeout(t)
  }, [interviewCompleted, isAiSpeaking, phase, handleEnd])

  // ── Safety Escalation ──
  if (phase === 'safety_escalation') {
    return (
      <div style={{
        borderRadius: 12,
        background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #7f1d1d 100%)',
        padding: '32px 24px',
        textAlign: 'center',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h2 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 700, margin: '0 0 12px' }}>
          We Want to Make Sure You&apos;re Safe
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.95rem', margin: '0 0 24px', lineHeight: 1.6 }}>
          If you or someone you know is in crisis, please reach out for help immediately.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360, margin: '0 auto 24px' }}>
          <a href="tel:911" style={{ display: 'block', padding: '14px 20px', borderRadius: 10, background: '#fff', color: '#991b1b', fontWeight: 700, fontSize: '1rem', textDecoration: 'none', textAlign: 'center' }}>
            Call 911 (Emergency)
          </a>
          <a href="tel:988" style={{ display: 'block', padding: '14px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, fontSize: '1rem', textDecoration: 'none', textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)' }}>
            Call 988 (Suicide &amp; Crisis Lifeline)
          </a>
          <a href="sms:741741&body=HOME" style={{ display: 'block', padding: '14px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, fontSize: '1rem', textDecoration: 'none', textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)' }}>
            Text HOME to 741741 (Crisis Text Line)
          </a>
        </div>
      </div>
    )
  }

  // ── Ready ──
  if (phase === 'ready') {
    return (
      <div>
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '12px 16px', color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{
          padding: 20, borderRadius: 12,
          border: '2px solid #0d9488',
          background: 'rgba(13, 148, 136, 0.1)',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, #0d9488, #14b8a6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: '0.9rem',
            }}>
              {patientName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: '1rem' }}>{patientName}</div>
              <span style={{
                display: 'inline-block', padding: '1px 6px', borderRadius: 4,
                background: sessionType === 'new_patient' ? 'rgba(139,92,246,0.2)' : 'rgba(13,148,136,0.2)',
                color: sessionType === 'new_patient' ? '#a78bfa' : '#5eead4',
                fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase',
              }}>
                {sessionType === 'new_patient' ? 'New Patient' : 'Follow-up'}
              </span>
            </div>
          </div>
          {referralReason && (
            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              <span style={{ fontWeight: 600, color: '#cbd5e1' }}>Referral: </span>
              {referralReason}
            </div>
          )}
        </div>

        <button
          onClick={handleStart}
          style={{
            width: '100%', padding: 14, borderRadius: 10,
            background: '#0d9488', color: '#fff', border: 'none',
            fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
            <path d="M19 10v2a7 7 0 01-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          Start Voice Interview
        </button>
        <p style={{ color: '#64748b', fontSize: '0.75rem', textAlign: 'center', marginTop: 10 }}>
          Requires microphone access. Interview is conducted entirely by voice.
        </p>
      </div>
    )
  }

  // ── Connecting ──
  if (phase === 'connecting') {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(13, 148, 136, 0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
          animation: 'embHistPulse 2s infinite',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
            <path d="M19 10v2a7 7 0 01-14 0v-2" />
          </svg>
        </div>
        <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: '1.125rem' }}>Connecting...</h3>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Setting up your voice interview</p>
        <style>{`
          @keyframes embHistPulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.7; } }
        `}</style>
      </div>
    )
  }

  // ── Saving ──
  if (phase === 'saving') {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px' }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: '3px solid #334155', borderTopColor: '#0d9488',
          animation: 'embHistSpin 1s linear infinite',
          margin: '0 auto 16px',
        }} />
        <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Saving interview data...</p>
        <style>{`@keyframes embHistSpin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ── Active / Ending ──
  return (
    <div>
      {/* Timer bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '12px 0', gap: 12, position: 'relative',
      }}>
        <span style={{ color: '#64748b', fontSize: '0.8rem', fontFamily: 'monospace' }}>
          {formatTime(duration)}
        </span>
        <span style={{
          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
          background: phase === 'active' ? '#22c55e' : '#f59e0b',
          animation: phase === 'active' ? 'embHistBlink 1.5s infinite' : 'none',
        }} />
        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
          {phase === 'ending' ? 'Ending...' : isAiSpeaking ? 'AI Speaking' : isUserSpeaking ? 'Listening' : 'Ready'}
        </span>
        {activeScale && (
          <span
            title={`Administering ${activeScale.abbreviation}`}
            style={{
              padding: '2px 8px', borderRadius: 4,
              background: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.4)',
              color: '#a5b4fc',
              fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.04em',
            }}
          >
            {activeScale.abbreviation}
          </span>
        )}

        {/* Physician differential toggle */}
        <button
          onClick={() => {
            setShowPhysicianPanel(p => !p)
            setAutoShownPhysicianPanel(true)
          }}
          title={showPhysicianPanel ? 'Hide physician differential' : 'Show physician differential'}
          style={{
            position: 'absolute', right: 0,
            padding: '5px 10px', borderRadius: 6,
            border: `1px solid ${showPhysicianPanel ? 'rgba(13,148,136,0.5)' : 'rgba(51,65,85,0.6)'}`,
            background: showPhysicianPanel ? 'rgba(13,148,136,0.1)' : 'transparent',
            color: showPhysicianPanel ? '#5eead4' : '#64748b',
            fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
          </svg>
          {showPhysicianPanel ? 'Hide Dx' : 'Differential'}
          {localizerLoading && (
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#0d9488', animation: 'embHistBlink 1s infinite', flexShrink: 0 }} />
          )}
        </button>
      </div>

      {/* Voice Orb */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0' }}>
        <div style={{
          width: 120, height: 120, borderRadius: '50%',
          background: isAiSpeaking
            ? 'radial-gradient(circle, rgba(13,148,136,0.4) 0%, rgba(13,148,136,0.1) 60%, transparent 100%)'
            : isUserSpeaking
              ? 'radial-gradient(circle, rgba(139,92,246,0.4) 0%, rgba(139,92,246,0.1) 60%, transparent 100%)'
              : 'radial-gradient(circle, rgba(100,116,139,0.2) 0%, rgba(100,116,139,0.05) 60%, transparent 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.3s ease',
          boxShadow: isAiSpeaking
            ? '0 0 40px rgba(13,148,136,0.3), 0 0 80px rgba(13,148,136,0.15)'
            : isUserSpeaking
              ? '0 0 40px rgba(139,92,246,0.3), 0 0 80px rgba(139,92,246,0.15)'
              : 'none',
          animation: (isAiSpeaking || isUserSpeaking) ? 'embHistOrbPulse 1.5s ease-in-out infinite' : 'none',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: isAiSpeaking
              ? 'linear-gradient(135deg, #0d9488, #14b8a6)'
              : isUserSpeaking
                ? 'linear-gradient(135deg, #8B5CF6, #A78BFA)'
                : '#334155',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.3s ease',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isAiSpeaking ? (
                <>
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </>
              ) : (
                <>
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </>
              )}
            </svg>
          </div>
        </div>
      </div>

      {/* Streaming text */}
      {(currentAssistantText || currentUserText) && (
        <div style={{
          padding: 16, borderRadius: 12,
          background: currentAssistantText ? 'rgba(13,148,136,0.1)' : 'rgba(139,92,246,0.1)',
          border: `1px solid ${currentAssistantText ? 'rgba(13,148,136,0.2)' : 'rgba(139,92,246,0.2)'}`,
          marginBottom: 16,
        }}>
          <div style={{
            color: currentAssistantText ? '#5eead4' : '#c4b5fd',
            fontSize: '0.75rem', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase',
          }}>
            {currentAssistantText ? 'AI Historian' : 'You'}
          </div>
          <div style={{
            color: '#e2e8f0',
            fontSize: '0.9rem',
            lineHeight: 1.5,
            // Preserve long words / URLs on small screens.
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          }}>
            {currentAssistantText || currentUserText}
          </div>
        </div>
      )}

      {/* Transcript toggle */}
      <button
        onClick={() => setShowTranscript(!showTranscript)}
        style={{
          background: 'none', border: 'none', color: '#64748b',
          fontSize: '0.8rem', cursor: 'pointer', padding: 8,
          display: 'flex', alignItems: 'center', gap: 4,
          margin: '0 auto',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: showTranscript ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
        {showTranscript ? 'Hide' : 'Show'} Transcript ({transcript.length})
      </button>

      {showTranscript && (
        <div style={{ overflowY: 'auto', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300 }}>
          {transcript.map((entry, i) => (
            <div key={i} style={{
              padding: '10px 14px', borderRadius: 10,
              background: entry.role === 'assistant' ? 'rgba(13,148,136,0.08)' : 'rgba(139,92,246,0.08)',
              borderLeft: `3px solid ${entry.role === 'assistant' ? '#0d9488' : '#8B5CF6'}`,
            }}>
              <div style={{ fontSize: '0.7rem', color: entry.role === 'assistant' ? '#5eead4' : '#c4b5fd', fontWeight: 600, marginBottom: 2 }}>
                {entry.role === 'assistant' ? 'AI Historian' : 'Patient'} - {formatTime(entry.timestamp)}
              </div>
              <div style={{
                color: '#cbd5e1',
                fontSize: '0.85rem',
                lineHeight: 1.4,
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              }}>{entry.text}</div>
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>
      )}

      {/* Physician panel */}
      {showPhysicianPanel && (
        <div style={{ marginTop: 16 }}>
          <LocalizerPanel data={localizerData} isLoading={localizerLoading} />
        </div>
      )}

      {/* End interview button */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
        <button
          onClick={handleEnd}
          disabled={phase === 'ending'}
          style={{
            padding: '14px 32px', borderRadius: 10,
            background: phase === 'ending' ? '#334155' : '#ef4444',
            color: '#fff', border: 'none', fontWeight: 700, fontSize: '1rem',
            cursor: phase === 'ending' ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
          {phase === 'ending' ? 'Ending...' : 'End Interview'}
        </button>
      </div>

      <style>{`
        @keyframes embHistOrbPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes embHistBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  )
}
