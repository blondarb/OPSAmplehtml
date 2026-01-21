'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const router = useRouter()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    try {
      // Dynamically import to avoid build-time issues
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        setError(error.message)
        setLoading(false)
      } else if (data.user && !data.session) {
        setMessage('Check your email to confirm your account!')
        setLoading(false)
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F9FAFB' }}>
      <div className="w-full max-w-md p-8 rounded-xl shadow-lg" style={{ background: '#FFFFFF' }}>
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg mb-4" style={{ background: '#0D9488' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#111827' }}>Create Account</h1>
          <p className="mt-2" style={{ color: '#6B7280' }}>Start your free trial of Sevaro Clinical</p>
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

        {/* Signup Form */}
        <form onSubmit={handleSignup}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2" style={{ color: '#6B7280' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border transition-colors"
              style={{
                borderColor: '#E5E7EB',
                background: '#FFFFFF',
                color: '#111827',
              }}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2" style={{ color: '#6B7280' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border transition-colors"
              style={{
                borderColor: '#E5E7EB',
                background: '#FFFFFF',
                color: '#111827',
              }}
              placeholder="••••••••"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2" style={{ color: '#6B7280' }}>
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border transition-colors"
              style={{
                borderColor: '#E5E7EB',
                background: '#FFFFFF',
                color: '#111827',
              }}
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg font-medium text-white transition-colors disabled:opacity-50"
            style={{ background: '#0D9488' }}
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        {/* Sign in link */}
        <p className="mt-6 text-center text-sm" style={{ color: '#6B7280' }}>
          Already have an account?{' '}
          <Link href="/login" className="font-medium" style={{ color: '#0D9488' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
