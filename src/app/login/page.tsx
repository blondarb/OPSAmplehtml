'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import PlatformShell from '@/components/layout/PlatformShell'
import { redirectToLogin } from '@/lib/cognito/client'

function LoginContent() {
  const searchParams = useSearchParams()
  const rawRedirect = searchParams.get('redirect')
  const returnTo = rawRedirect && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : undefined

  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  const errorHeadline =
    error === 'no_code' ? 'Authorization failed.'
    : error === 'token_exchange' ? 'Authentication failed.'
    : error === 'access_denied' ? 'Sign-in was cancelled.'
    : error ? 'Sign-in error.'
    : null

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4" style={{ background: '#F8FAFC' }}>
      <div className="w-full max-w-md">
        <div className="bg-white p-8 rounded-xl shadow-lg">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg mb-4 bg-teal-600">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Welcome to Sevaro Ambulatory</h1>
            <p className="mt-1 text-sm text-slate-500">Sign in to your account to continue</p>
          </div>

          {errorHeadline && (
            <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 border border-red-200 text-red-700">
              <p className="font-medium">{errorHeadline}</p>
              {errorDescription && <p className="mt-1 text-red-600">{errorDescription}</p>}
              <p className="mt-2 text-xs text-red-600">
                If this keeps happening, contact your Sevaro administrator for access.
              </p>
            </div>
          )}

          <div className="mb-6 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">
            Your privacy matters. We use your login only to personalize your experience
            and remember where you left off. No marketing emails. No third-party tracking.
          </div>

          <button
            onClick={() => redirectToLogin(returnTo)}
            className="w-full py-2.5 rounded-lg font-medium text-white bg-teal-600 hover:bg-teal-700 transition-colors flex items-center justify-center gap-2"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            Sign In with Sevaro SSO
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <PlatformShell>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-teal-600 border-t-transparent animate-spin" /></div>}>
        <LoginContent />
      </Suspense>
    </PlatformShell>
  )
}
