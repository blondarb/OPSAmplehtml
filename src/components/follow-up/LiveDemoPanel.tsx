'use client'

import { useState } from 'react'
import { DEMO_SCENARIOS } from '@/lib/follow-up/demoScenarios'
import { Smartphone, Send, Shield } from 'lucide-react'

interface LiveDemoPanelProps {
  onSessionStarted: (sessionId: string) => void
}

export default function LiveDemoPanel({ onSessionStarted }: LiveDemoPanelProps) {
  const [phone, setPhone] = useState('')
  const [scenarioId, setScenarioId] = useState(DEMO_SCENARIOS[0].id)
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSend() {
    if (!phone.trim()) return
    setStatus('sending')
    setErrorMsg('')

    try {
      const res = await fetch('/api/follow-up/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: phone, scenario_id: scenarioId }),
      })
      const data = await res.json()

      if (!res.ok) {
        setStatus('error')
        setErrorMsg(data.error || 'Failed to send SMS')
        return
      }

      setStatus('sent')
      onSessionStarted(data.session_id)
    } catch {
      setStatus('error')
      setErrorMsg('Network error. Please try again.')
    }
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      border: '1px solid #334155',
      borderRadius: 12,
      padding: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'linear-gradient(135deg, #16A34A, #22C55E)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Smartphone size={18} color="white" />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#fff' }}>
            Try It Live on Your Phone
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
            Get a real text message from the AI agent
          </p>
        </div>
      </div>

      {status !== 'sent' ? (
        <>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Scenario</span>
            <select
              value={scenarioId}
              onChange={e => setScenarioId(e.target.value)}
              disabled={status === 'sending'}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                background: '#334155', color: '#fff', border: '1px solid #475569',
                fontSize: 14, cursor: 'pointer',
              }}
            >
              {DEMO_SCENARIOS.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.diagnosis}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'block', marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Your Phone Number</span>
            <input
              type="tel"
              placeholder="(555) 123-4567"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              disabled={status === 'sending'}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                background: '#334155', color: '#fff', border: '1px solid #475569',
                fontSize: 14, boxSizing: 'border-box',
              }}
            />
          </label>

          {status === 'error' && (
            <div style={{ color: '#F87171', fontSize: 13, marginBottom: 12 }}>
              {errorMsg}
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={!phone.trim() || status === 'sending'}
            style={{
              width: '100%', padding: '12px', borderRadius: 8,
              background: status === 'sending' ? '#334155' : '#16A34A',
              color: '#fff', border: 'none', fontSize: 14, fontWeight: 600,
              cursor: status === 'sending' ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Send size={16} />
            {status === 'sending' ? 'Sending...' : 'Send Me a Text'}
          </button>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginTop: 12, fontSize: 11, color: '#64748b',
          }}>
            <Shield size={12} />
            Your number is used only for this demo and automatically deleted after 24 hours.
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 16px', borderRadius: 8,
            background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80',
            fontSize: 14, fontWeight: 500, marginBottom: 12,
          }}>
            SMS sent! Check your phone.
          </div>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: '8px 0 0' }}>
            Reply to the text to continue the conversation. The clinician dashboard on the right will update in real-time.
          </p>
        </div>
      )}
    </div>
  )
}
