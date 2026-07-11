'use client'

/**
 * ClaraVoiceTestView — the actual /rnd/clara UI.
 *
 * Mic -> Nova Sonic relay session running Clara's phone-operator persona ->
 * every finalized user turn is independently classified by
 * /api/ai/clara/classify (Gate 0 + Clara's real rulebook) -> routing
 * decision rendered (narrated only — no real Twilio transfer/Synapse write).
 */

import Link from 'next/link'
import { useState } from 'react'
import { Bot, ClipboardList, Mic, Phone, RotateCcw, Square, TriangleAlert } from 'lucide-react'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { useClaraVoiceSession } from '@/hooks/useClaraVoiceSession'
import { URGENCY_COLORS } from '@/lib/clara/routingDisplay'
import { CLARA_PRESET_SCENARIOS, type ClaraPresetScenario } from '@/lib/clara/presetScenarios'
import ClaraDecisionCard from './ClaraDecisionCard'

const ACCENT = '#8B5CF6'

export default function ClaraVoiceTestView() {
  const {
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
  } = useClaraVoiceSession()

  // Which preset scenario (if any) the tester tapped for the CURRENT call —
  // purely a display aid (the script banner while the call is live). Clara
  // still classifies live; this never touches the classify/log pipeline.
  const [activeScenario, setActiveScenario] = useState<ClaraPresetScenario | null>(null)

  const isActive = status === 'active' || status === 'connecting'
  const classifiedTurns = turns
    .map((t, i) => ({ turn: t, index: i }))
    .filter(({ turn }) => turn.role === 'user' && turn.classification)
  const showResults = status === 'idle' && classifiedTurns.length > 0
  // Cold-start state: nothing has run yet this call, chips are front and center.
  const showPresets = status === 'idle' && turns.length === 0

  const startScenario = (scenario: ClaraPresetScenario) => {
    if (status !== 'idle') return
    setActiveScenario(scenario)
    void startSession()
  }

  const startFreeform = () => {
    setActiveScenario(null)
    void startSession()
  }

  const handleTestAnother = () => {
    setActiveScenario(null)
    resetSession()
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)', color: 'white' }}>
      <FeatureSubHeader title="Clara Voice Test" icon={Bot} accentColor={ACCENT} badgeText="R&D" />

      {/* Safety + disclosure chrome — always visible, never hidden by scroll state */}
      <div style={{ padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 720, margin: '0 auto' }}>
        <div style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: 8, padding: 10, color: '#fde68a', fontSize: 13 }}>
          ⚠️ Internal R&amp;D test harness — <strong>synthetic scenarios only, no real PHI.</strong> Clara announces herself as an automated test line at the start of every session. No real 911/STAT transfer happens here — routing decisions are narrated, not executed.
        </div>
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, padding: 10, color: '#fca5a5', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Phone size={16} /> <strong>Real emergency? Call 911.</strong> This is a test harness and cannot connect you to real emergency services.
        </div>

        <Link
          href="/rnd/clara/results"
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, color: '#a78bfa', fontSize: 13, textDecoration: 'none' }}
        >
          <ClipboardList size={15} /> Review past test sessions &amp; feedback
        </Link>

        {emergencyActive && (
          <div
            role="alert"
            style={{
              background: 'rgba(239,68,68,0.22)',
              border: '2px solid #ef4444',
              borderRadius: 10,
              padding: 14,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <TriangleAlert size={22} color="#fca5a5" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, color: '#fca5a5', fontSize: 15 }}>Gate 0 red-flag intercept fired</div>
              <div style={{ fontSize: 13, color: '#fecaca', marginTop: 2 }}>
                In a real call, this would immediately escalate to a 911 / STAT page — no further triage. Deterministic detection, no model call.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preset scenario script — stays visible for the whole call so the tester can read it. */}
      {activeScenario && status !== 'idle' && (
        <div style={{ padding: '0 24px', maxWidth: 720, margin: '0 auto 8px' }}>
          <div
            style={{
              background: 'rgba(139,92,246,0.14)',
              border: '1px solid rgba(139,92,246,0.4)',
              borderRadius: 10,
              padding: 14,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
              Scenario: {activeScenario.label}
            </div>
            <div style={{ fontSize: 15, color: 'white', lineHeight: 1.4 }}>{activeScenario.script}</div>
          </div>
        </div>
      )}

      {/* Live routing/classification summary */}
      {lastClassification && (
        <div style={{ padding: '0 24px', maxWidth: 720, margin: '0 auto' }}>
          <div
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10,
              padding: 14,
              marginBottom: 8,
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span
                style={{
                  background: URGENCY_COLORS[lastClassification.urgencyLevel] || '#64748b',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 6,
                  textTransform: 'uppercase',
                }}
              >
                {lastClassification.urgencyLevel}
              </span>
              <span style={{ fontWeight: 700 }}>{lastClassification.consultType}</span>
              {typeof lastClassification.statLevel === 'number' && (
                <span style={{ color: '#94a3b8' }}>STAT {lastClassification.statLevel}</span>
              )}
              <span style={{ color: '#94a3b8' }}>confidence {Math.round(lastClassification.confidence * 100)}%</span>
            </div>
            <div style={{ color: '#cbd5e1', marginBottom: 6 }}>{lastClassification.rationale}</div>
            <div style={{ color: '#a78bfa', fontWeight: 600 }}>Routing: {lastClassification.routing.label}</div>
            {lastClassification.needsClarification && lastClassification.clarificationQuestions.length > 0 && (
              <div style={{ marginTop: 6, color: '#fde68a' }}>
                Needs clarification: {lastClassification.clarificationQuestions.join(' / ')}
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '0 24px', maxWidth: 720, margin: '0 auto 8px' }}>
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, padding: 10, color: '#fca5a5', fontSize: 13 }}>
            {error}
          </div>
        </div>
      )}

      {/* Post-call results + feedback — every classified turn from the just-ended call, rate each decision. */}
      {showResults && (
        <div style={{ padding: '8px 24px', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Call results</div>
            <button
              onClick={handleTestAnother}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: ACCENT,
                color: 'white',
                border: 'none',
                borderRadius: 10,
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              <RotateCcw size={16} /> Test another scenario
            </button>
          </div>
          {!loggedSessionId && (
            <div style={{ color: '#64748b', fontSize: 12 }}>Logging call…</div>
          )}
          {classifiedTurns.map(({ turn, index }, i) => (
            <ClaraDecisionCard
              key={index}
              heading={`Turn ${i + 1} — "${turn.text.slice(0, 80)}${turn.text.length > 80 ? '…' : ''}"`}
              decision={{
                consultType: turn.classification!.consultType,
                confidence: turn.classification!.confidence,
                rationale: turn.classification!.rationale,
                urgencyLevel: turn.classification!.urgencyLevel,
                statLevel: turn.classification!.statLevel,
                redFlags: turn.classification!.redFlags,
                gate0Fired: !!turn.gate0?.fired,
              }}
              routingActionLabel={turn.classification!.routing?.label}
              sessionId={loggedSessionId}
              turnIndex={index}
            />
          ))}
        </div>
      )}

      {/* One-tap preset scenarios — cold-start demo needs zero improvisation. Tapping a chip
          shows the script (banner above) and starts the mic; Clara still classifies live via
          the real pipeline, this is purely a prompt for the human caller. */}
      {showPresets && (
        <div style={{ padding: '4px 24px 8px', maxWidth: 720, margin: '0 auto' }}>
          <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
            Tap a scenario to start, or tap the mic below for a freeform call.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {CLARA_PRESET_SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                onClick={() => startScenario(scenario)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  minHeight: 48,
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(139,92,246,0.4)',
                  background: 'rgba(139,92,246,0.14)',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  lineHeight: 1.3,
                }}
              >
                {scenario.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Transcript */}
      <div style={{ padding: '8px 24px 150px', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {turns.map((t, i) => (
          <div key={i} style={{ alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
            <div
              style={{
                background: t.role === 'user' ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
                border: t.gate0?.fired ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: '10px 14px',
                fontSize: 15,
                overflowWrap: 'anywhere',
              }}
            >
              {t.text}
            </div>
            {t.role === 'user' && (
              <div style={{ marginTop: 4, fontSize: 12, color: '#94a3b8', display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {t.classifying && <span>classifying…</span>}
                {t.classifyError && <span style={{ color: '#fca5a5' }}>classify error: {t.classifyError}</span>}
                {t.gate0?.fired && (
                  <span style={{ color: '#fca5a5', fontWeight: 600 }}>
                    GATE 0: {t.gate0.category} ({t.gate0.matchedTerms.join(', ')})
                  </span>
                )}
                {t.classification && !t.gate0?.fired && (
                  <span>
                    {t.classification.consultType} · {t.classification.urgencyLevel} · {Math.round(t.classification.confidence * 100)}%
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
        {isAiSpeaking && currentAssistantText && (
          <div style={{ alignSelf: 'flex-start', maxWidth: '90%', color: '#cbd5e1', fontStyle: 'italic' }}>{currentAssistantText}…</div>
        )}
      </div>

      {/* Sticky bottom action bar — thumb-reachable primary control on mobile.
          Three mutually-exclusive states: Stop (mid-call), Test another (just
          finished, results showing), Start (idle, nothing run yet). */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '16px 20px calc(16px + env(safe-area-inset-bottom))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          background: 'linear-gradient(0deg, #0F172A 75%, transparent)',
        }}
      >
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {status === 'idle' && (showResults ? 'Call finished — logged for review' : 'Ready')}
          {status === 'connecting' && 'Connecting to Clara…'}
          {status === 'active' && (isAiSpeaking ? 'Clara is speaking…' : 'Listening…')}
          {status === 'ending' && 'Ending call…'}
          {status === 'error' && 'Session error'}
        </div>

        {showResults ? (
          <button
            onClick={handleTestAnother}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              maxWidth: 340,
              justifyContent: 'center',
              minHeight: 56,
              borderRadius: 14,
              border: 'none',
              background: ACCENT,
              color: 'white',
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            }}
          >
            <RotateCcw size={20} /> Test another scenario
          </button>
        ) : (
          <button
            onClick={isActive ? endSession : startFreeform}
            disabled={status === 'connecting' || status === 'ending'}
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              border: 'none',
              cursor: status === 'connecting' || status === 'ending' ? 'default' : 'pointer',
              background: isActive ? '#ef4444' : ACCENT,
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
              opacity: status === 'connecting' || status === 'ending' ? 0.6 : 1,
            }}
            aria-label={isActive ? 'End test call' : 'Start test call'}
          >
            {isActive ? <Square size={26} /> : <Mic size={26} />}
          </button>
        )}
      </div>
    </div>
  )
}
