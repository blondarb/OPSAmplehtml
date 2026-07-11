'use client'

import { useState, type FormEvent } from 'react'
import { Lock } from 'lucide-react'

interface ClaraPasswordGateProps {
  /** False when CLARA_TEST_PASSWORD is unset server-side — surfaced as a config error, not a wrong-password prompt. */
  configured: boolean
}

export default function ClaraPasswordGate({ configured }: ClaraPasswordGateProps) {
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!configured || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/clara/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error || 'Incorrect password.')
        setSubmitting(false)
        return
      }
      // Cookie is set — reload so the server component re-checks it.
      window.location.reload()
    } catch {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)',
        color: 'white',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          padding: 32,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(139,92,246,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <Lock size={22} color="#a78bfa" />
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Clara Voice Test</h1>
        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>
          Internal R&amp;D surface. Synthetic use only — enter the access password to continue.
        </p>

        {!configured ? (
          <div
            style={{
              background: 'rgba(234,179,8,0.12)',
              border: '1px solid rgba(234,179,8,0.4)',
              borderRadius: 8,
              padding: 10,
              color: '#fde68a',
              fontSize: 13,
            }}
          >
            This page isn&apos;t configured yet — <code>CLARA_TEST_PASSWORD</code> is unset. Ask an admin to set it.
          </div>
        ) : (
          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              aria-label="Password"
              style={{
                height: 44,
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.06)',
                color: 'white',
                padding: '0 14px',
                fontSize: 15,
                outline: 'none',
              }}
            />
            {error && <div style={{ color: '#fca5a5', fontSize: 13 }}>{error}</div>}
            <button
              type="submit"
              disabled={!password.trim() || submitting}
              style={{
                height: 44,
                borderRadius: 10,
                border: 'none',
                cursor: password.trim() ? 'pointer' : 'default',
                background: password.trim() ? '#8B5CF6' : 'rgba(255,255,255,0.1)',
                color: 'white',
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              {submitting ? 'Checking…' : 'Enter'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
