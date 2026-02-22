'use client'

import { useRef, useEffect, useCallback } from 'react'
import { useFollowUpRealtimeSession } from '@/hooks/useFollowUpRealtimeSession'
import MessageBubble from './MessageBubble'
import type { PatientScenario, DashboardUpdate, EscalationFlag } from '@/lib/follow-up/types'

interface VoiceConversationProps {
  scenario: PatientScenario
  onDashboardUpdate: (update: DashboardUpdate) => void
  onConversationComplete: (sessionId: string) => void
  onEscalation: (flag: EscalationFlag) => void
}

export default function VoiceConversation({
  scenario,
  onDashboardUpdate,
  onConversationComplete,
  onEscalation,
}: VoiceConversationProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleEscalation = useCallback((flag: EscalationFlag) => {
    onEscalation(flag)
    // Also push a dashboard update with the escalation
    onDashboardUpdate({
      status: 'in_progress',
      currentModule: 'symptoms',
      flags: [flag],
      medicationStatus: [],
      functionalStatus: null,
      functionalDetails: null,
      patientQuestions: [],
      caregiverInfo: { isCaregiver: false, name: null, relationship: null },
    })
  }, [onEscalation, onDashboardUpdate])

  const handleComplete = useCallback((data: {
    transcript: { role: 'agent' | 'patient'; text: string; timestamp: number }[]
    duration: number
    escalationFlags: EscalationFlag[]
  }) => {
    // Generate a session ID based on timestamp
    const sessionId = `voice-${Date.now()}`

    // Push final dashboard update
    onDashboardUpdate({
      status: 'completed',
      currentModule: 'wrapup',
      flags: data.escalationFlags,
      medicationStatus: [],
      functionalStatus: null,
      functionalDetails: null,
      patientQuestions: [],
      caregiverInfo: { isCaregiver: false, name: null, relationship: null },
    })

    onConversationComplete(sessionId)
  }, [onDashboardUpdate, onConversationComplete])

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
  } = useFollowUpRealtimeSession({
    scenario,
    onSafetyEscalation: () => {
      onEscalation({
        tier: 'urgent',
        triggerText: 'Safety keyword detected in voice',
        category: 'suicidal_ideation',
        aiAssessment: 'Safety keyword match triggered escalation',
        recommendedAction: 'Provide 988 Lifeline. Immediate clinician notification.',
        timestamp: new Date().toISOString(),
      })
    },
    onEscalation: handleEscalation,
    onComplete: handleComplete,
  })

  // Auto-scroll to bottom on transcript updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [transcript, currentAssistantText, currentUserText])

  // Format duration as MM:SS
  const formatDuration = (secs: number): string => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#0f172a',
      borderRadius: '12px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid #334155',
        background: '#1e293b',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <div style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: status === 'active' ? '#16A34A' : status === 'error' || status === 'safety_escalation' ? '#ef4444' : '#94a3b8',
          }} />
          <span style={{ color: 'white', fontSize: '15px', fontWeight: 600 }}>
            Voice Session
          </span>
        </div>
        {status === 'active' && (
          <span style={{ color: '#94a3b8', fontSize: '13px', fontFamily: 'monospace' }}>
            {formatDuration(duration)}
          </span>
        )}
      </div>

      {/* Transcript area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {transcript.map((entry, i) => (
          <MessageBubble
            key={i}
            entry={entry}
            isLatest={i === transcript.length - 1 && status === 'active'}
          />
        ))}

        {/* Current streaming agent text */}
        {currentAssistantText && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            maxWidth: '80%',
            alignSelf: 'flex-start',
          }}>
            <div style={{
              fontSize: '11px',
              color: '#64748b',
              marginBottom: '4px',
              paddingLeft: '4px',
            }}>
              AI Agent
            </div>
            <div style={{
              padding: '12px 16px',
              borderRadius: '12px',
              background: '#334155',
              color: '#94a3b8',
              fontSize: '14px',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {currentAssistantText}
              <span style={{
                display: 'inline-flex',
                gap: '3px',
                marginLeft: '8px',
                verticalAlign: 'middle',
              }}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: '5px',
                      height: '5px',
                      borderRadius: '50%',
                      background: '#94a3b8',
                      display: 'inline-block',
                      animation: `voicePulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
                <style>{`
                  @keyframes voicePulse {
                    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
                    40% { opacity: 1; transform: scale(1); }
                  }
                `}</style>
              </span>
            </div>
          </div>
        )}

        {/* Current streaming user text */}
        {currentUserText && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            maxWidth: '80%',
            alignSelf: 'flex-end',
          }}>
            <div style={{
              fontSize: '11px',
              color: '#64748b',
              marginBottom: '4px',
              paddingRight: '4px',
            }}>
              Patient
            </div>
            <div style={{
              padding: '12px 16px',
              borderRadius: '12px',
              background: '#16A34A',
              color: 'white',
              fontSize: '14px',
              lineHeight: '1.5',
              opacity: 0.7,
              fontStyle: 'italic',
            }}>
              {currentUserText}
            </div>
          </div>
        )}

        {/* Empty state */}
        {transcript.length === 0 && !currentAssistantText && !currentUserText && status !== 'connecting' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            gap: '12px',
            color: '#64748b',
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
            }}>
              {'\uD83C\uDFA4'}
            </div>
            <span style={{ fontSize: '14px' }}>
              {status === 'idle' ? 'Press Start to begin the voice follow-up' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Safety escalation banner */}
      {status === 'safety_escalation' && (
        <div style={{
          padding: '12px 20px',
          background: '#7f1d1d',
          color: '#fca5a5',
          fontSize: '14px',
          fontWeight: 600,
          textAlign: 'center',
          borderTop: '2px solid #ef4444',
        }}>
          Safety concern detected -- session paused. Please contact clinical staff.
        </div>
      )}

      {/* Voice status bar */}
      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid #334155',
        background: '#1e293b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {/* Status indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flex: 1,
        }}>
          {status === 'idle' && (
            <span style={{ color: '#94a3b8', fontSize: '14px' }}>
              Press Start to begin voice session
            </span>
          )}

          {status === 'connecting' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid #334155',
                borderTopColor: '#16A34A',
                borderRadius: '50%',
                animation: 'voiceSpin 1s linear infinite',
              }} />
              <style>{`
                @keyframes voiceSpin {
                  to { transform: rotate(360deg); }
                }
              `}</style>
              <span style={{ color: '#94a3b8', fontSize: '14px' }}>Connecting...</span>
            </div>
          )}

          {status === 'active' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Mic icon */}
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: isUserSpeaking ? '#16A34A' : '#334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s',
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </div>
              <span style={{ color: '#94a3b8', fontSize: '14px' }}>
                {isUserSpeaking ? 'Listening...' : isAiSpeaking ? 'AI speaking...' : 'Ready'}
              </span>
            </div>
          )}

          {status === 'complete' && (
            <span style={{ color: '#16A34A', fontSize: '14px', fontWeight: 500 }}>
              Session complete
            </span>
          )}

          {status === 'error' && (
            <span style={{ color: '#ef4444', fontSize: '14px' }}>
              {error || 'An error occurred'}
            </span>
          )}

          {status === 'safety_escalation' && (
            <span style={{ color: '#ef4444', fontSize: '14px', fontWeight: 600 }}>
              Safety concern detected
            </span>
          )}

          {status === 'ending' && (
            <span style={{ color: '#94a3b8', fontSize: '14px' }}>
              Ending session...
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {(status === 'idle' || status === 'error') && (
            <button
              onClick={startSession}
              style={{
                padding: '10px 24px',
                background: '#16A34A',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Start Session
            </button>
          )}

          {status === 'active' && (
            <button
              onClick={endSession}
              style={{
                padding: '10px 24px',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              End Session
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
