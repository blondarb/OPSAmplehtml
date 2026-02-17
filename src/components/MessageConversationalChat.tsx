'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

interface MessageConversationalChatProps {
  onComplete: (data: { patient_name: string; date_of_birth: string; subject: string; body: string }) => void
  onCancel: () => void
}

const REQUIRED_FIELDS = ['patient_name', 'date_of_birth', 'body'] as const

export default function MessageConversationalChat({ onComplete, onCancel }: MessageConversationalChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: "Hello! 👋 I can help you send a message to your doctor's office. Let me get a couple of details first.\n\nWhat is your full name?" }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messageData, setMessageData] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [reviewMode, setReviewMode] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const fieldsCollected = REQUIRED_FIELDS.filter(
    f => messageData[f] && String(messageData[f]).trim() !== ''
  ).length

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async (overrideMessage?: string) => {
    const text = overrideMessage || input.trim()
    if (!text || loading) return

    const userMessage = text
    const newMessages: Message[] = [...messages, { role: 'user', text: userMessage }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/ai/message/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: messages,
          currentData: messageData,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      const { nextQuestion, extractedData, isComplete, readyForReview, requiresEmergencyCare } = data

      const updatedData = extractedData ? { ...messageData, ...extractedData } : messageData
      if (extractedData) {
        setMessageData(updatedData)
      }

      if (requiresEmergencyCare) {
        setError('⚠️ Based on what you described, please seek immediate emergency care by calling 911 or going to the nearest emergency room.')
      }

      const questionText = nextQuestion || 'Could you tell me more about what you need?'
      setMessages([...newMessages, { role: 'assistant', text: questionText }])

      if (readyForReview && !reviewMode) {
        setReviewMode(true)
      }

      if (isComplete) {
        onComplete({
          patient_name: updatedData.patient_name || '',
          date_of_birth: updatedData.date_of_birth || '',
          subject: updatedData.subject || 'Patient Message',
          body: updatedData.body || '',
        })
      }
    } catch (err) {
      setError('Sorry, something went wrong. Please try again or switch to the form.')
      console.error('Message chat error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={{
      background: '#0f172a',
      borderRadius: '12px',
      border: '1px solid #334155',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '460px',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #334155',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #8B5CF6, #A78BFA)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
          </div>
          <span style={{ fontWeight: 600, fontSize: '14px', color: 'white' }}>
            AI Message Assistant
          </span>
        </div>
        <button
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '13px',
            textDecoration: 'underline',
          }}
        >
          Switch to Form
        </button>
      </div>

      {/* Progress indicator */}
      <div
        role="status"
        aria-live="polite"
        style={{
          padding: '8px 20px',
          borderBottom: '1px solid #334155',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <div style={{
          flex: 1,
          height: '6px',
          borderRadius: '3px',
          background: '#1e293b',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${(fieldsCollected / REQUIRED_FIELDS.length) * 100}%`,
            height: '100%',
            borderRadius: '3px',
            background: fieldsCollected === REQUIRED_FIELDS.length
              ? '#22c55e'
              : 'linear-gradient(90deg, #8B5CF6, #A78BFA)',
            transition: 'width 0.4s ease',
          }} />
        </div>
        <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
          {fieldsCollected} of {REQUIRED_FIELDS.length} items
        </span>
      </div>

      {/* Messages */}
      <div
        role="log"
        aria-live="polite"
        aria-label="Message conversation"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div style={{
              maxWidth: '80%',
              padding: '12px 16px',
              borderRadius: '12px',
              background: msg.role === 'user' ? '#8B5CF6' : '#1e293b',
              color: 'white',
              fontSize: '14px',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
            }}>
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '12px 16px',
              borderRadius: '12px',
              background: '#1e293b',
              color: '#94a3b8',
              fontSize: '14px',
            }}>
              Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error message */}
      {error && (
        <div style={{
          padding: '12px 20px',
          background: 'rgba(239,68,68,0.15)',
          borderTop: '1px solid rgba(239,68,68,0.3)',
          color: '#fca5a5',
          fontSize: '13px',
        }}>
          {error}
        </div>
      )}

      {/* Quick actions when in review mode */}
      {reviewMode && !loading && (
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid #334155',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
        }}>
          <button
            onClick={() => handleSend('Looks good, send it!')}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              background: '#22c55e',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
            }}
          >
            ✓ Send it!
          </button>
          <button
            onClick={() => {
              setInput('I want to change: ')
              const inputEl = document.querySelector<HTMLInputElement>('input[aria-label="Type your message"]')
              if (inputEl) {
                setTimeout(() => inputEl.focus(), 50)
              }
            }}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              background: '#334155',
              color: '#e2e8f0',
              border: '1px solid #475569',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '13px',
            }}
          >
            ✏️ Make a change
          </button>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid #334155',
        display: 'flex',
        gap: '12px',
      }}>
        <input
          type="text"
          aria-label="Type your message"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={reviewMode ? 'Type a change or say "send it"...' : 'Type your answer...'}
          disabled={loading}
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: '8px',
            background: '#1e293b',
            border: '1px solid #334155',
            color: 'white',
            fontSize: '14px',
            outline: 'none',
          }}
        />
        <button
          aria-label="Send"
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          style={{
            padding: '12px 24px',
            borderRadius: '8px',
            background: loading || !input.trim() ? '#334155' : '#8B5CF6',
            color: 'white',
            border: 'none',
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            fontSize: '14px',
          }}
        >
          {loading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  )
}
