'use client'

/**
 * ClaraVoiceTestView — the actual /rnd/clara UI.
 *
 * Mic -> Nova Sonic relay session running Clara's phone-operator persona ->
 * every finalized user turn is independently classified by
 * /api/ai/clara/classify (Gate 0 + Clara's real rulebook) -> routing
 * decision rendered (narrated only — no real Twilio transfer/Synapse write).
 */

import { Bot, Mic, Phone, Square, TriangleAlert } from 'lucide-react'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { useClaraVoiceSession } from '@/hooks/useClaraVoiceSession'

const ACCENT = '#8B5CF6'

const URGENCY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  moderate: '#eab308',
  low: '#22c55e',
}

export default function ClaraVoiceTestView() {
  const {
    status,
    turns,
    currentAssistantText,
    isAiSpeaking,
    error,
    emergencyActive,
    lastClassification,
    startSession,
    endSession,
  } = useClaraVoiceSession()

  const isActive = status === 'active' || status === 'connecting'

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

      {/* Transcript */}
      <div style={{ padding: '8px 24px 140px', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {turns.length === 0 && status === 'idle' && (
          <p style={{ color: '#64748b', fontSize: 14, textAlign: 'center', marginTop: 24 }}>
            Tap the mic to start a test call with Clara.
          </p>
        )}
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

      {/* Control bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: 'linear-gradient(0deg, #0F172A 70%, transparent)' }}>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {status === 'idle' && 'Ready'}
          {status === 'connecting' && 'Connecting to Clara…'}
          {status === 'active' && (isAiSpeaking ? 'Clara is speaking…' : 'Listening…')}
          {status === 'ending' && 'Ending call…'}
          {status === 'error' && 'Session error'}
        </div>
        <button
          onClick={isActive ? endSession : startSession}
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
      </div>
    </div>
  )
}
