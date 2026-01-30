'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useRealtimeSession } from '@/hooks/useRealtimeSession'
import { DEMO_SCENARIOS, type DemoScenario, type HistorianStructuredOutput, type HistorianRedFlag, type HistorianTranscriptEntry } from '@/lib/historianTypes'
import { getTenantClient } from '@/lib/tenant'
import HistorianSessionComplete from './HistorianSessionComplete'

type Phase = 'scenario_select' | 'connecting' | 'active' | 'ending' | 'complete' | 'safety_escalation'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function NeurologicHistorian() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const scenarioParam = searchParams.get('scenario')

  const [phase, setPhase] = useState<Phase>('scenario_select')
  const [selectedScenario, setSelectedScenario] = useState<DemoScenario | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const [completionData, setCompletionData] = useState<{
    structuredOutput: HistorianStructuredOutput | null
    narrativeSummary: string | null
    redFlags: HistorianRedFlag[]
    safetyEscalated: boolean
    transcript: HistorianTranscriptEntry[]
    duration: number
    questionCount: number
  } | null>(null)

  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const tenant = getTenantClient()

  const handleComplete = useCallback(async (data: typeof completionData) => {
    if (!data) return
    setCompletionData(data)
    setPhase('complete')

    // Save session to database
    try {
      await fetch('/api/ai/historian/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenant,
          session_type: selectedScenario?.session_type || 'new_patient',
          patient_name: selectedScenario?.patient_name || 'Demo Patient',
          referral_reason: selectedScenario?.referral_reason || null,
          structured_output: data.structuredOutput,
          narrative_summary: data.narrativeSummary,
          transcript: data.transcript,
          red_flags: data.redFlags,
          safety_escalated: data.safetyEscalated,
          duration_seconds: data.duration,
          question_count: data.questionCount,
          status: 'completed',
        }),
      })
    } catch (err) {
      console.error('Failed to save historian session:', err)
    }
  }, [tenant, selectedScenario])

  const handleSafetyEscalation = useCallback(() => {
    setPhase('safety_escalation')
  }, [])

  const {
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
  } = useRealtimeSession({
    sessionType: selectedScenario?.session_type || 'new_patient',
    referralReason: selectedScenario?.referral_reason,
    patientName: selectedScenario?.patient_name,
    onComplete: handleComplete,
    onSafetyEscalation: handleSafetyEscalation,
  })

  // Auto-select scenario from query param
  useEffect(() => {
    if (scenarioParam && !selectedScenario) {
      const found = DEMO_SCENARIOS.find(s => s.id === scenarioParam)
      if (found) {
        setSelectedScenario(found)
      }
    }
  }, [scenarioParam, selectedScenario])

  // Sync hook status to phase
  useEffect(() => {
    if (status === 'connecting') setPhase('connecting')
    else if (status === 'active') setPhase('active')
    else if (status === 'error') setPhase('scenario_select')
    else if (status === 'safety_escalation') setPhase('safety_escalation')
  }, [status])

  // Scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript, currentAssistantText])

  const handleSelectScenario = (scenario: DemoScenario) => {
    setSelectedScenario(scenario)
  }

  const handleStartInterview = async () => {
    if (!selectedScenario) return
    await startSession()
  }

  const handleEndInterview = () => {
    endSession()
  }

  const handleStartAnother = () => {
    setPhase('scenario_select')
    setSelectedScenario(null)
    setCompletionData(null)
    setShowTranscript(false)
  }

  const handleBackToPortal = () => {
    router.push('/patient')
  }

  // ============= RENDER =============

  // Safety Escalation overlay
  if (phase === 'safety_escalation') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #7f1d1d 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        textAlign: 'center',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '24px',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <h1 style={{ color: '#fff', fontSize: '1.75rem', fontWeight: 700, margin: '0 0 16px' }}>
          We Want to Make Sure You&apos;re Safe
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '1.1rem', margin: '0 0 32px', maxWidth: '500px', lineHeight: 1.6 }}>
          If you or someone you know is in crisis, please reach out for help immediately.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '400px', marginBottom: '40px' }}>
          <a href="tel:911" style={{
            display: 'block', padding: '16px 24px', borderRadius: '12px',
            background: '#fff', color: '#991b1b', fontWeight: 700, fontSize: '1.125rem',
            textDecoration: 'none', textAlign: 'center',
          }}>
            Call 911 (Emergency)
          </a>
          <a href="tel:988" style={{
            display: 'block', padding: '16px 24px', borderRadius: '12px',
            background: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, fontSize: '1.125rem',
            textDecoration: 'none', textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)',
          }}>
            Call 988 (Suicide &amp; Crisis Lifeline)
          </a>
          <a href="sms:741741&body=HOME" style={{
            display: 'block', padding: '16px 24px', borderRadius: '12px',
            background: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, fontSize: '1.125rem',
            textDecoration: 'none', textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)',
          }}>
            Text HOME to 741741 (Crisis Text Line)
          </a>
        </div>

        <button
          onClick={handleBackToPortal}
          style={{
            padding: '12px 24px', borderRadius: '8px',
            background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem',
          }}
        >
          Back to Patient Portal
        </button>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid #1e293b',
        background: '#0f172a',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'linear-gradient(135deg, #0d9488, #14b8a6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {/* Brain icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.5 2A5.5 5.5 0 005 7.5c0 .88.21 1.71.58 2.45" />
              <path d="M4.5 12.5C3 13.5 2 15.37 2 17.5 2 20 4 22 6.5 22c1.5 0 2.84-.73 3.67-1.85" />
              <path d="M14.5 2A5.5 5.5 0 0120 7.5c0 .88-.21 1.71-.58 2.45" />
              <path d="M19.5 12.5c1.5 1 2.5 2.87 2.5 5 0 2.5-2 4.5-4.5 4.5-1.5 0-2.84-.73-3.67-1.85" />
              <path d="M12 2v20" />
            </svg>
          </div>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: '1.125rem' }}>AI Neurologic Historian</span>
        </div>
        <button
          onClick={handleBackToPortal}
          style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.875rem', cursor: 'pointer' }}
        >
          Back to Portal
        </button>
      </header>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* ====== SCENARIO SELECT ====== */}
        {phase === 'scenario_select' && (
          <div style={{ maxWidth: '640px', margin: '0 auto', padding: '32px 24px', width: '100%' }}>
            <h2 style={{ color: '#fff', margin: '0 0 4px', fontSize: '1.25rem' }}>
              Start an AI Interview
            </h2>
            <p style={{ color: '#94a3b8', margin: '0 0 24px', fontSize: '0.875rem' }}>
              Select a demo scenario to begin. The AI will conduct a structured neurological intake interview via voice.
            </p>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '8px',
                padding: '12px 16px',
                color: '#fca5a5',
                fontSize: '0.875rem',
                marginBottom: '16px',
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'grid', gap: '12px', marginBottom: '24px' }}>
              {DEMO_SCENARIOS.map(scenario => (
                <button
                  key={scenario.id}
                  onClick={() => handleSelectScenario(scenario)}
                  style={{
                    textAlign: 'left',
                    padding: '16px 20px',
                    borderRadius: '12px',
                    border: selectedScenario?.id === scenario.id
                      ? '2px solid #0d9488'
                      : '1px solid #334155',
                    background: selectedScenario?.id === scenario.id
                      ? 'rgba(13, 148, 136, 0.1)'
                      : '#1e293b',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: scenario.session_type === 'new_patient' ? 'rgba(139,92,246,0.2)' : 'rgba(13,148,136,0.2)',
                      color: scenario.session_type === 'new_patient' ? '#a78bfa' : '#5eead4',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}>
                      {scenario.session_type === 'new_patient' ? 'New' : 'Follow-up'}
                    </span>
                  </div>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.95rem', marginBottom: '4px' }}>
                    {scenario.label}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.4 }}>
                    {scenario.description}
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={handleStartInterview}
              disabled={!selectedScenario}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '10px',
                background: selectedScenario ? '#0d9488' : '#334155',
                color: selectedScenario ? '#fff' : '#64748b',
                border: 'none',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: selectedScenario ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
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

            <p style={{ color: '#64748b', fontSize: '0.75rem', textAlign: 'center', marginTop: '12px' }}>
              Requires microphone access. Interview is conducted entirely by voice.
            </p>
          </div>
        )}

        {/* ====== CONNECTING ====== */}
        {phase === 'connecting' && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 24px',
          }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'rgba(13, 148, 136, 0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '24px',
              animation: 'pulse 2s infinite',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path d="M19 10v2a7 7 0 01-14 0v-2" />
              </svg>
            </div>
            <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: '1.125rem' }}>Connecting...</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Setting up your voice interview</p>
            <style>{`
              @keyframes pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.1); opacity: 0.7; }
              }
            `}</style>
          </div>
        )}

        {/* ====== ACTIVE INTERVIEW ====== */}
        {(phase === 'active' || phase === 'ending') && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            maxWidth: '640px',
            margin: '0 auto',
            width: '100%',
            padding: '0 24px',
          }}>
            {/* Timer */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              gap: '12px',
            }}>
              <span style={{
                color: '#64748b',
                fontSize: '0.8rem',
                fontFamily: 'monospace',
              }}>
                {formatTime(duration)}
              </span>
              <span style={{
                display: 'inline-block',
                width: 8, height: 8, borderRadius: '50%',
                background: phase === 'active' ? '#22c55e' : '#f59e0b',
                animation: phase === 'active' ? 'blink 1.5s infinite' : 'none',
              }} />
              <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                {phase === 'ending' ? 'Ending...' : isAiSpeaking ? 'AI Speaking' : isUserSpeaking ? 'Listening' : 'Ready'}
              </span>
            </div>

            {/* Voice Orb */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 0',
            }}>
              <div style={{
                width: 120,
                height: 120,
                borderRadius: '50%',
                background: isAiSpeaking
                  ? 'radial-gradient(circle, rgba(13,148,136,0.4) 0%, rgba(13,148,136,0.1) 60%, transparent 100%)'
                  : isUserSpeaking
                    ? 'radial-gradient(circle, rgba(139,92,246,0.4) 0%, rgba(139,92,246,0.1) 60%, transparent 100%)'
                    : 'radial-gradient(circle, rgba(100,116,139,0.2) 0%, rgba(100,116,139,0.05) 60%, transparent 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease',
                boxShadow: isAiSpeaking
                  ? '0 0 40px rgba(13,148,136,0.3), 0 0 80px rgba(13,148,136,0.15)'
                  : isUserSpeaking
                    ? '0 0 40px rgba(139,92,246,0.3), 0 0 80px rgba(139,92,246,0.15)'
                    : 'none',
                animation: (isAiSpeaking || isUserSpeaking) ? 'orbPulse 1.5s ease-in-out infinite' : 'none',
              }}>
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: isAiSpeaking
                    ? 'linear-gradient(135deg, #0d9488, #14b8a6)'
                    : isUserSpeaking
                      ? 'linear-gradient(135deg, #8B5CF6, #A78BFA)'
                      : '#334155',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
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
                padding: '16px',
                borderRadius: '12px',
                background: currentAssistantText ? 'rgba(13,148,136,0.1)' : 'rgba(139,92,246,0.1)',
                border: `1px solid ${currentAssistantText ? 'rgba(13,148,136,0.2)' : 'rgba(139,92,246,0.2)'}`,
                marginBottom: '16px',
              }}>
                <div style={{
                  color: currentAssistantText ? '#5eead4' : '#c4b5fd',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  marginBottom: '4px',
                  textTransform: 'uppercase',
                }}>
                  {currentAssistantText ? 'AI Historian' : 'You'}
                </div>
                <div style={{ color: '#e2e8f0', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  {currentAssistantText || currentUserText}
                </div>
              </div>
            )}

            {/* Transcript toggle */}
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '0.8rem',
                cursor: 'pointer',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                alignSelf: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: showTranscript ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
              {showTranscript ? 'Hide' : 'Show'} Transcript ({transcript.length})
            </button>

            {/* Transcript */}
            {showTranscript && (
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px 0',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '300px',
              }}>
                {transcript.map((entry, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      background: entry.role === 'assistant' ? 'rgba(13,148,136,0.08)' : 'rgba(139,92,246,0.08)',
                      borderLeft: `3px solid ${entry.role === 'assistant' ? '#0d9488' : '#8B5CF6'}`,
                    }}
                  >
                    <div style={{
                      fontSize: '0.7rem',
                      color: entry.role === 'assistant' ? '#5eead4' : '#c4b5fd',
                      fontWeight: 600,
                      marginBottom: '2px',
                    }}>
                      {entry.role === 'assistant' ? 'AI Historian' : 'Patient'} - {formatTime(entry.timestamp)}
                    </div>
                    <div style={{ color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.4 }}>
                      {entry.text}
                    </div>
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            )}

            {/* Bottom controls */}
            <div style={{
              padding: '24px 0',
              display: 'flex',
              justifyContent: 'center',
              marginTop: 'auto',
              flexShrink: 0,
            }}>
              <button
                onClick={handleEndInterview}
                disabled={phase === 'ending'}
                style={{
                  padding: '14px 32px',
                  borderRadius: '10px',
                  background: phase === 'ending' ? '#334155' : '#ef4444',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '1rem',
                  cursor: phase === 'ending' ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
                {phase === 'ending' ? 'Ending...' : 'End Interview'}
              </button>
            </div>

            <style>{`
              @keyframes orbPulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
              }
              @keyframes blink {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.3; }
              }
            `}</style>
          </div>
        )}

        {/* ====== COMPLETE ====== */}
        {phase === 'complete' && completionData && (
          <HistorianSessionComplete
            duration={completionData.duration}
            questionCount={completionData.questionCount}
            onStartAnother={handleStartAnother}
            onBackToPortal={handleBackToPortal}
          />
        )}
      </div>
    </div>
  )
}
