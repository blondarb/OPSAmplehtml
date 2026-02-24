'use client'

import { useState, Suspense } from 'react'
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

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()
  const searchParams = useSearchParams()
  const { signIn } = useAuth()

  const rawRedirect = searchParams.get('redirect')
  // Prevent open redirect attacks — only allow relative paths
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

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4" style={{ background: '#F8FAFC' }}>
      <div className="w-full max-w-md">
        {/* Redirect message */}
        {cardName && (
          <div className="mb-4 p-3 rounded-lg bg-teal-50 border border-teal-200 text-sm text-teal-800 text-center">
            Sign in to explore <strong>{cardName}</strong>
          </div>
        )}

        <div className="bg-white p-8 rounded-xl shadow-lg">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Welcome to Sevaro Ambulatory</h1>
            <p className="mt-1 text-sm text-slate-500">Sign in to your account</p>
          </div>

          {/* Privacy message */}
          <div className="mb-6 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">
            Your privacy matters. We use your login only to personalize your experience
            and remember where you left off. No marketing emails. No third-party tracking.
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 border border-red-200 text-red-700">
              {error}
            </div>
          )}

          {/* Form */}
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

            <div className="mb-6">
              <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Sign up link */}
          <p className="mt-6 text-center text-sm text-slate-500">
            New here?{' '}
            <Link href={redirect ? `/signup?redirect=${encodeURIComponent(redirect)}` : '/signup'} className="font-medium text-teal-600 hover:text-teal-700">
              Create an account
            </Link>
          </p>
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
