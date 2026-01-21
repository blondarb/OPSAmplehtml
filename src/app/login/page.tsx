'use client'

import { useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/dashboard'

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Create client only when needed (not during static generation)
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push(redirectTo)
      router.refresh()
    }
  }

  const handleMagicLink = async () => {
    if (!email) {
      setError('Please enter your email address')
      return
    }

    setLoading(true)
    setError(null)

    // Create client only when needed
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirectTo=${redirectTo}`,
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage('Check your email for the magic link!')
    }
    setLoading(false)
  }

  return (
    <div className="w-full max-w-md p-8 rounded-xl shadow-lg" style={{ background: 'var(--bg-white)' }}>
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg mb-4" style={{ background: 'var(--primary)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Sevaro Clinical</h1>
        <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>Sign in to your account</p>
      </div>

      {/* Error/Message display */}
      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#FEE2E2', color: '#DC2626' }}>
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#D1FAE5', color: '#059669' }}>
          {message}
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleLogin}>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border transition-colors"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--bg-white)',
              color: 'var(--text-primary)',
            }}
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border transition-colors"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--bg-white)',
              color: 'var(--text-primary)',
            }}
            placeholder="••••••••"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg font-medium text-white transition-colors disabled:opacity-50"
          style={{ background: 'var(--primary)' }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center my-6">
        <div className="flex-1 h-px" style={{ background: 'var(--border)' }}></div>
        <span className="px-4 text-sm" style={{ color: 'var(--text-muted)' }}>or</span>
        <div className="flex-1 h-px" style={{ background: 'var(--border)' }}></div>
      </div>

      {/* Magic Link */}
      <button
        onClick={handleMagicLink}
        disabled={loading}
        className="w-full py-3 rounded-lg font-medium border transition-colors disabled:opacity-50"
        style={{
          borderColor: 'var(--border)',
          color: 'var(--primary)',
          background: 'var(--bg-white)',
        }}
      >
        Send Magic Link
      </button>

      {/* Sign up link */}
      <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-medium" style={{ color: 'var(--primary)' }}>
          Sign up
        </Link>
      </p>
    </div>
  )
}

function LoginLoading() {
  return (
    <div className="w-full max-w-md p-8 rounded-xl shadow-lg" style={{ background: 'var(--bg-white)' }}>
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg mb-4" style={{ background: 'var(--primary)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Sevaro Clinical</h1>
        <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-gray)' }}>
      <Suspense fallback={<LoginLoading />}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
