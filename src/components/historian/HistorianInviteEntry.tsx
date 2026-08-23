'use client'

import { useEffect, useState, type FormEvent } from 'react'
import NeurologicHistorian from '@/components/NeurologicHistorian'
import type { HistorianInvitationPublicContext } from '@/lib/historian/invitationStore'
import {
  formatDateOfBirthInput,
  parseDateOfBirthInput,
} from '@/lib/historian/dateOfBirthInput'

type InviteState =
  | { status: 'loading' }
  | { status: 'verify'; token: string }
  | { status: 'verifying'; token: string }
  | { status: 'ready'; context: HistorianInvitationPublicContext }
  | { status: 'error'; message: string }

async function readResponseMessage(response: Response, fallback: string): Promise<string> {
  const data = await response.json().catch(() => ({}))
  return typeof data?.error === 'string' && data.error.trim() ? data.error : fallback
}

export default function HistorianInviteEntry() {
  const [state, setState] = useState<InviteState>({ status: 'loading' })
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [verificationError, setVerificationError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function openInvitation() {
      try {
        const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        const token = params.get('token')

        // Remove the bearer token from the visible URL before any subsequent
        // navigation, analytics, or support screenshot can capture it.
        if (window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
        }

        if (token) {
          if (!cancelled) setState({ status: 'verify', token })
          return
        }

        const response = await fetch('/api/ai/historian/invites/context', {
          method: 'GET',
          cache: 'no-store',
        })

        if (!response.ok) {
          throw new Error(
            await readResponseMessage(
              response,
              'This interview link is invalid or has expired. Please ask the clinic for a new link.',
            ),
          )
        }
        const data = await response.json()
        if (!data?.context) throw new Error('The interview link returned no session context.')
        if (!cancelled) setState({ status: 'ready', context: data.context })
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'This interview link could not be opened. Please ask the clinic for a new link.',
          })
        }
      }
    }

    void openInvitation()
    return () => {
      cancelled = true
    }
  }, [])

  async function verifyIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedDateOfBirth = parseDateOfBirthInput(dateOfBirth)
    if (state.status !== 'verify' || !normalizedDateOfBirth) return
    const token = state.token
    setVerificationError('')
    setState({ status: 'verifying', token })
    try {
      const response = await fetch('/api/ai/historian/invites/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, dateOfBirth: normalizedDateOfBirth }),
      })
      if (!response.ok) {
        throw new Error(
          await readResponseMessage(
            response,
            'The link or date of birth could not be verified. Check the date or ask the clinic for a new link.',
          ),
        )
      }
      const data = await response.json()
      if (!data?.context) throw new Error('The interview link returned no session context.')
      if (data.context.interviewStatus === 'in_progress') {
        throw new Error(
          'This interview was interrupted and cannot be restarted safely. Please ask the clinic to revoke it and send a new link.',
        )
      }
      if (data.context.interviewStatus === 'completed') {
        throw new Error('This interview has already been completed. Your clinic has the saved report.')
      }
      setState({ status: 'ready', context: data.context })
    } catch (error) {
      setVerificationError(
        error instanceof Error
          ? error.message
          : 'The link or date of birth could not be verified. Ask the clinic for a new link.',
      )
      setState({ status: 'verify', token })
    }
  }

  if (state.status === 'ready') {
    return <NeurologicHistorian invitation={state.context} />
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'linear-gradient(180deg, #f8fafc 0%, #ecfeff 100%)',
        color: '#0f172a',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <section
        aria-live="polite"
        style={{
          width: '100%',
          maxWidth: 480,
          border: '1px solid #cbd5e1',
          borderRadius: 18,
          background: '#fff',
          boxShadow: '0 20px 50px rgba(15, 23, 42, 0.08)',
          padding: 32,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto 16px',
            borderRadius: '50%',
            background: state.status === 'error' ? '#fef2f2' : '#ccfbf1',
            color: state.status === 'error' ? '#b91c1c' : '#0f766e',
            fontSize: 24,
            fontWeight: 800,
          }}
        >
          {state.status === 'error' ? '!' : state.status === 'verify' || state.status === 'verifying' ? 'ID' : '✓'}
        </div>
        <h1 style={{ margin: '0 0 10px', fontSize: 24 }}>
          {state.status === 'error'
            ? 'Interview link unavailable'
            : state.status === 'verify' || state.status === 'verifying'
              ? 'Verify your identity'
              : 'Opening your neurologic history interview'}
        </h1>
        {state.status === 'verify' || state.status === 'verifying' ? (
          <form onSubmit={verifyIdentity} style={{ display: 'grid', gap: 14, textAlign: 'left' }}>
            <p style={{ margin: 0, color: '#475569', lineHeight: 1.6, textAlign: 'center' }}>
              Enter your date of birth before any visit details are displayed.
            </p>
            <label style={{ color: '#334155', fontSize: 14, fontWeight: 700 }}>
              Date of birth (MM/DD/YYYY)
              <input
                type="text"
                inputMode="numeric"
                autoComplete="bday"
                placeholder="MM/DD/YYYY"
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(formatDateOfBirthInput(event.target.value))}
                disabled={state.status === 'verifying'}
                maxLength={10}
                pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
                aria-describedby="historian-dob-format"
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  marginTop: 7,
                  padding: '12px 13px',
                  borderRadius: 9,
                  border: '1px solid #94a3b8',
                  background: '#fff',
                  color: '#0f172a',
                  fontSize: 16,
                }}
              />
            </label>
            <p
              id="historian-dob-format"
              style={{ margin: '-6px 0 0', color: '#64748b', fontSize: 13 }}
            >
              Type eight numbers; the slashes are added automatically.
            </p>
            {verificationError && (
              <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: 13, lineHeight: 1.5 }}>
                {verificationError}
              </p>
            )}
            <button
              type="submit"
              disabled={state.status === 'verifying' || !parseDateOfBirthInput(dateOfBirth)}
              style={{
                padding: '13px 18px',
                border: 0,
                borderRadius: 9,
                background: '#0f766e',
                color: '#fff',
                fontSize: 16,
                fontWeight: 800,
                cursor: state.status === 'verifying' ? 'wait' : 'pointer',
                opacity: !parseDateOfBirthInput(dateOfBirth) ? 0.55 : 1,
              }}
            >
              {state.status === 'verifying' ? 'Verifying…' : 'Continue securely'}
            </button>
          </form>
        ) : (
          <p style={{ margin: 0, color: '#475569', lineHeight: 1.6 }}>
            {state.status === 'error'
              ? state.message
              : 'We are securely verifying the one-time link from your clinic.'}
          </p>
        )}
      </section>
    </main>
  )
}
