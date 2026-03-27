'use client'

import PlatformShell from '@/components/layout/PlatformShell'
import { redirectToLogin } from '@/lib/cognito/client'

/**
 * Signup is now handled by Cognito Hosted UI at auth.neuroplans.app.
 * This page redirects to the SSO login flow.
 */
export default function SignupPage() {
  return (
    <PlatformShell>
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4" style={{ background: '#F8FAFC' }}>
        <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-lg text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg mb-4 bg-teal-600">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Join Sevaro Ambulatory</h1>
          <p className="text-sm text-slate-500 mb-6">
            Account registration is handled through our secure sign-in portal.
          </p>
          <button
            onClick={() => redirectToLogin()}
            className="w-full py-2.5 rounded-lg font-medium text-white bg-teal-600 hover:bg-teal-700 transition-colors"
          >
            Continue to Sign In
          </button>
        </div>
      </div>
    </PlatformShell>
  )
}
