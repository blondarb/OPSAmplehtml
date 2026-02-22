'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type {
  PatientScenario,
  DashboardUpdate,
  EscalationFlag,
  TranscriptEntry,
  FollowUpMessageResponse,
} from '@/lib/follow-up/types'
import MessageBubble from './MessageBubble'

interface ChatConversationProps {
  scenario: PatientScenario
  onDashboardUpdate: (update: DashboardUpdate) => void
  onConversationComplete: (sessionId: string) => void
  onEscalation: (flag: EscalationFlag) => void
}

export default function ChatConversation({
  scenario,
  onDashboardUpdate,
  onConversationComplete,
  onEscalation,
}: ChatConversationProps) {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationComplete, setConversationComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Use refs for values needed in the initial greeting to avoid stale closures
  const sessionIdRef = useRef<string | null>(null)
  const conversationHistoryRef = useRef<Array<{ role: string; content: string }>>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const startTimeRef = useRef<number>(Date.now())

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [transcript, scrollToBottom])

  // Auto-initiate conversation on mount / scenario change
  useEffect(() => {
    let cancelled = false

    async function initiateGreeting() {
      // Reset state for new scenario
      setTranscript([])
      setInputText('')
      setConversationComplete(false)
      setError(null)
      sessionIdRef.current = null
      conversationHistoryRef.current = []
      startTimeRef.current = Date.now()
      setLoading(true)

      try {
        const res = await fetch('/api/follow-up/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: null,
            patient_message: '',
            patient_context: scenario,
            conversation_history: [],
          }),
        })

        if (!res.ok) {
          throw new Error(`API error: ${res.status}`)
        }

        const data: FollowUpMessageResponse = await res.json()

        if (cancelled) return

        sessionIdRef.current = data.session_id

        // Add agent greeting to conversation history
        conversationHistoryRef.current = [
          { role: 'assistant', content: data.agent_response },
        ]

        // Add to transcript
        const agentEntry: TranscriptEntry = {
          role: 'agent',
          text: data.agent_response,
          timestamp: Date.now() - startTimeRef.current,
        }
        setTranscript([agentEntry])

        // Update dashboard
        onDashboardUpdate(data.dashboard_update)

        if (data.escalation_triggered && data.escalation_details) {
          onEscalation(data.escalation_details)
        }

        if (data.conversation_complete) {
          setConversationComplete(true)
          onConversationComplete(data.session_id)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to start conversation')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    initiateGreeting()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario.id])

  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || loading || conversationComplete) return

    // Add patient message to transcript
    const patientEntry: TranscriptEntry = {
      role: 'patient',
      text,
      timestamp: Date.now() - startTimeRef.current,
    }
    setTranscript(prev => [...prev, patientEntry])
    setInputText('')
    setLoading(true)
    setError(null)

    // Update conversation history with user message
    const updatedHistory = [
      ...conversationHistoryRef.current,
      { role: 'user', content: text },
    ]

    try {
      const res = await fetch('/api/follow-up/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          patient_message: text,
          patient_context: scenario,
          conversation_history: updatedHistory,
        }),
      })

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`)
      }

      const data: FollowUpMessageResponse = await res.json()

      sessionIdRef.current = data.session_id

      // Update conversation history with both user and agent
      conversationHistoryRef.current = [
        ...updatedHistory,
        { role: 'assistant', content: data.agent_response },
      ]

      // Add agent response to transcript
      const agentEntry: TranscriptEntry = {
        role: 'agent',
        text: data.agent_response,
        timestamp: Date.now() - startTimeRef.current,
      }
      setTranscript(prev => [...prev, agentEntry])

      // Update dashboard
      onDashboardUpdate(data.dashboard_update)

      if (data.escalation_triggered && data.escalation_details) {
        onEscalation(data.escalation_details)
      }

      if (data.conversation_complete) {
        setConversationComplete(true)
        onConversationComplete(data.session_id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
      // Revert conversation history on failure
      conversationHistoryRef.current = updatedHistory.slice(0, -1)
    } finally {
      setLoading(false)
    }
  }, [inputText, loading, conversationComplete, scenario, onDashboardUpdate, onEscalation, onConversationComplete])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
    }}>
      {/* Scrollable message area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}>
        {transcript.map((entry, i) => (
          <MessageBubble
            key={i}
            entry={entry}
            isLatest={i === transcript.length - 1}
          />
        ))}

        {/* Loading indicator */}
        {loading && transcript.length > 0 && (
          <div style={{
            alignSelf: 'flex-start',
            maxWidth: '80%',
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
              display: 'flex',
              gap: '4px',
              alignItems: 'center',
            }}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: '#94a3b8',
                    display: 'inline-block',
                    animation: `followUpTyping 1.4s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
              <style>{`
                @keyframes followUpTyping {
                  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
                  40% { opacity: 1; transform: scale(1); }
                }
              `}</style>
            </div>
          </div>
        )}

        {/* Initial loading state */}
        {loading && transcript.length === 0 && (
          <div style={{
            alignSelf: 'center',
            color: '#94a3b8',
            fontSize: '13px',
            padding: '20px',
          }}>
            Starting conversation...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error message */}
      {error && (
        <div style={{
          padding: '10px 20px',
          background: 'rgba(239,68,68,0.12)',
          borderTop: '1px solid rgba(239,68,68,0.3)',
          color: '#fca5a5',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          {error}
        </div>
      )}

      {/* Conversation complete banner */}
      {conversationComplete && (
        <div style={{
          padding: '10px 20px',
          background: 'rgba(22,163,74,0.12)',
          borderTop: '1px solid rgba(22,163,74,0.3)',
          color: '#22C55E',
          fontSize: '13px',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Conversation complete
        </div>
      )}

      {/* Input bar */}
      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid #334155',
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
      }}>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={conversationComplete ? 'Conversation ended' : 'Type a response...'}
          disabled={loading || conversationComplete}
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: '8px',
            background: '#1e293b',
            border: '1px solid #334155',
            color: 'white',
            fontSize: '14px',
            outline: 'none',
            opacity: (loading || conversationComplete) ? 0.6 : 1,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#16A34A'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#334155'
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !inputText.trim() || conversationComplete}
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '8px',
            background: (loading || !inputText.trim() || conversationComplete) ? '#334155' : '#16A34A',
            color: 'white',
            border: 'none',
            cursor: (loading || !inputText.trim() || conversationComplete) ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 0.15s ease',
          }}
        >
          {loading ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
              <path d="M21 12a9 9 0 11-6.219-8.56" />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
