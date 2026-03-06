'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import PlatformShell from '@/components/layout/PlatformShell'
import { useAuth } from '@/contexts/AuthContext'

type Mode = 'signup' | 'confirm'

function SignupForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('signup')

  const router = useRouter()
  const searchParams = useSearchParams()
  const { signUp, confirmSignUp, signIn, resendCode } = useAuth()

  const rawRedirect = searchParams.get('redirect')
  const redirect = rawRedirect && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : null

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      setLoading(false)
      return
    }

    const { error: signUpError, needsConfirmation } = await signUp(email, password)
    if (signUpError) {
      setError(signUpError)
      setLoading(false)
    } else if (needsConfirmation) {
      setMessage('Check your email for a 6-digit verification code.')
      setMode('confirm')
      setLoading(false)
    } else {
      router.push(redirect ?? '/')
      router.refresh()
    }
  }

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: confirmError } = await confirmSignUp(email, code)
    if (confirmError) {
      setError(confirmError)
      setLoading(false)
      return
    }

    // Auto sign-in after confirmation
    const { error: signInError } = await signIn(email, password)
    if (signInError) {
      setMessage('Account confirmed! Please sign in.')
      router.push(redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login')
    } else {
      router.push(redirect ?? '/')
      router.refresh()
    }
  }

  const handleResendCode = async () => {
    setError(null)
    const { error: resendError } = await resendCode(email)
    if (resendError) {
      setError(resendError)
    } else {
      setMessage('A new code has been sent to your email.')
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4" style={{ background: '#F8FAFC' }}>
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-lg">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg mb-4 bg-teal-600">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {mode === 'signup' ? 'Join Sevaro Ambulatory' : 'Verify Your Email'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {mode === 'signup' ? 'Create your account' : 'Enter the 6-digit code sent to your email'}
          </p>
        </div>

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

        {mode === 'signup' && (
          <form onSubmit={handleSignup}>
            <div className="mb-4">
              <label htmlFor="signup-email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors"
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="mb-4">
              <label htmlFor="signup-password" className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors"
                placeholder="••••••••"
                required
              />
            </div>

            <div className="mb-6">
              <label htmlFor="signup-confirm-password" className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
              <input
                id="signup-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-medium text-white bg-teal-600 hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        )}

        {mode === 'confirm' && (
          <form onSubmit={handleConfirm}>
            <div className="mb-6">
              <label htmlFor="confirm-code" className="block text-sm font-medium text-slate-700 mb-1">Verification Code</label>
              <input
                id="confirm-code"
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

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-medium text-white bg-teal-600 hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify & Sign In'}
            </button>

            <p className="mt-4 text-center text-sm text-slate-500">
              Didn&apos;t get the code?{' '}
              <button type="button" onClick={handleResendCode} className="font-medium text-teal-600 hover:text-teal-700">
                Resend code
              </button>
            </p>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link href={redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login'} className="font-medium text-teal-600 hover:text-teal-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <PlatformShell>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-teal-600 border-t-transparent animate-spin" /></div>}>
        <SignupForm />
      </Suspense>
    </PlatformShell>
  )
}
