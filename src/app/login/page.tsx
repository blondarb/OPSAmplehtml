'use client'

import { useState, Suspense, type InputHTMLAttributes } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import PlatformShell from '@/components/layout/PlatformShell'
import { useAuth } from '@/contexts/AuthContext'

// Card name mapping from routes
const routeNames: Record<string, string> = {
  '/triage': 'AI-Powered Triage',
  '/physician': 'Physician Workspace',
  '/sdne': 'Digital Neurological Exam',
  '/follow-up': 'AI Follow-Up Agent',
  '/wearable': 'Wearable Monitoring',
  '/dashboard': 'Clinician Command Center',
  '/patient': 'Patient Portal',
}

type Mode = 'login' | 'forgotPassword' | 'confirmReset'

function PasswordInput({ value, onChange, id, placeholder = '••••••••', ...props }: { value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; id: string; placeholder?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        {...props}
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        className="w-full px-4 py-2.5 pr-11 rounded-lg border border-slate-300 text-slate-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors"
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        )}
      </button>
    </div>
  )
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('login')

  const router = useRouter()
  const searchParams = useSearchParams()
  const { signIn, forgotPassword, confirmForgotPassword } = useAuth()

  const rawRedirect = searchParams.get('redirect')
  const redirect = rawRedirect && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : null
  const cardName = redirect ? routeNames[redirect] ?? null : null

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: signInError } = await signIn(email, password)
    if (signInError) {
      setError(signInError)
      setLoading(false)
    } else {
      router.push(redirect ?? '/')
      router.refresh()
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: fpError } = await forgotPassword(email)
    if (fpError) {
      setError(fpError)
      setLoading(false)
    } else {
      setMessage('Check your email for a verification code.')
      setMode('confirmReset')
      setLoading(false)
    }
  }

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: crError } = await confirmForgotPassword(email, code, newPassword)
    if (crError) {
      setError(crError)
      setLoading(false)
    } else {
      setMessage('Password reset successfully. Please sign in.')
      setMode('login')
      setCode('')
      setNewPassword('')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4" style={{ background: '#F8FAFC' }}>
      <div className="w-full max-w-md">
        {cardName && (
          <div className="mb-4 p-3 rounded-lg bg-teal-50 border border-teal-200 text-sm text-teal-800 text-center">
            Sign in to explore <strong>{cardName}</strong>
          </div>
        )}

        <div className="bg-white p-8 rounded-xl shadow-lg">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-slate-900">
              {mode === 'login' && 'Welcome to Sevaro Ambulatory'}
              {mode === 'forgotPassword' && 'Reset Password'}
              {mode === 'confirmReset' && 'Enter Reset Code'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {mode === 'login' && 'Sign in to your account'}
              {mode === 'forgotPassword' && 'Enter your email to receive a reset code'}
              {mode === 'confirmReset' && 'Enter the 6-digit code sent to your email'}
            </p>
          </div>

          {mode === 'login' && (
            <div className="mb-6 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">
              Your privacy matters. We use your login only to personalize your experience
              and remember where you left off. No marketing emails. No third-party tracking.
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 border border-red-200 text-red-700">
              {error}
            </div>
          )}

          {message && (
            <div className="mb-4 p-3 rounded-lg text-sm bg-emerald-50 border border-emerald-200 text-emerald-700">
              {message}
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin}>
              <div className="mb-4">
                <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="mb-2">
                <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <PasswordInput
                  id="login-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="mb-6 text-right">
                <button
                  type="button"
                  onClick={() => { setMode('forgotPassword'); setError(null); setMessage(null) }}
                  className="text-sm text-teal-600 hover:text-teal-700"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg font-medium text-white bg-teal-600 hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}

          {mode === 'forgotPassword' && (
            <form onSubmit={handleForgotPassword}>
              <div className="mb-6">
                <label htmlFor="reset-email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg font-medium text-white bg-teal-600 hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send Reset Code'}
              </button>

              <p className="mt-4 text-center text-sm text-slate-500">
                <button type="button" onClick={() => { setMode('login'); setError(null); setMessage(null) }} className="font-medium text-teal-600 hover:text-teal-700">
                  Back to sign in
                </button>
              </p>
            </form>
          )}

          {mode === 'confirmReset' && (
            <form onSubmit={handleConfirmReset}>
              <div className="mb-4">
                <label htmlFor="reset-code" className="block text-sm font-medium text-slate-700 mb-1">Verification Code</label>
                <input
                  id="reset-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-center text-2xl tracking-[0.5em] focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors"
                  placeholder="000000"
                  required
                />
              </div>

              <div className="mb-6">
                <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
                <PasswordInput
                  id="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg font-medium text-white bg-teal-600 hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>

              <p className="mt-4 text-center text-sm text-slate-500">
                <button type="button" onClick={() => { setMode('login'); setError(null); setMessage(null) }} className="font-medium text-teal-600 hover:text-teal-700">
                  Back to sign in
                </button>
              </p>
            </form>
          )}

          {mode === 'login' && (
            <p className="mt-6 text-center text-sm text-slate-500">
              New here?{' '}
              <Link href={redirect ? `/signup?redirect=${encodeURIComponent(redirect)}` : '/signup'} className="font-medium text-teal-600 hover:text-teal-700">
                Create an account
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <PlatformShell>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-teal-600 border-t-transparent animate-spin" /></div>}>
        <LoginForm />
      </Suspense>
    </PlatformShell>
  )
}
