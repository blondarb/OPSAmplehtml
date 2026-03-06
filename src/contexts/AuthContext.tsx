'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

interface AuthUser {
  id: string
  email: string
}

interface UserProfile {
  id: string
  display_name: string | null
  role: string
  organization: string | null
  specialty: string | null
}

interface AuthContextType {
  user: AuthUser | null
  userProfile: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>
  confirmSignUp: (email: string, code: string) => Promise<{ error: string | null }>
  resendCode: (email: string) => Promise<{ error: string | null }>
  forgotPassword: (email: string) => Promise<{ error: string | null }>
  confirmForgotPassword: (email: string, code: string, newPassword: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/profile')
      if (res.ok) {
        const { profile } = await res.json()
        if (profile) setUserProfile(profile)
      }
    } catch {
      // Profile may not exist yet
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const init = async () => {
      const { getCurrentUser, getCurrentSession } = await import('@/lib/cognito/client')
      const currentUser = await getCurrentUser()

      if (mounted) {
        setUser(currentUser)
        if (currentUser) {
          // Refresh the cookie in case the token was refreshed by the SDK
          const session = await getCurrentSession()
          if (session) {
            await fetch('/api/auth/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                idToken: session.getIdToken().getJwtToken(),
                accessToken: session.getAccessToken().getJwtToken(),
                refreshToken: session.getRefreshToken().getToken(),
              }),
            })
          }
          await fetchProfile()
        }
        setLoading(false)
      }
    }

    init()

    return () => { mounted = false }
  }, [fetchProfile])

  const handleSignIn = async (email: string, password: string) => {
    const { signIn } = await import('@/lib/cognito/client')
    const result = await signIn(email, password)

    if (!result.error) {
      const { getCurrentUser } = await import('@/lib/cognito/client')
      const currentUser = await getCurrentUser()
      setUser(currentUser)
      if (currentUser) await fetchProfile()
    }

    return result
  }

  const handleSignUp = async (email: string, password: string) => {
    const { signUp } = await import('@/lib/cognito/client')
    return signUp(email, password)
  }

  const handleConfirmSignUp = async (email: string, code: string) => {
    const mod = await import('@/lib/cognito/client')
    return mod.confirmSignUp(email, code)
  }

  const handleResendCode = async (email: string) => {
    const { resendConfirmationCode } = await import('@/lib/cognito/client')
    return resendConfirmationCode(email)
  }

  const handleForgotPassword = async (email: string) => {
    const mod = await import('@/lib/cognito/client')
    return mod.forgotPassword(email)
  }

  const handleConfirmForgotPassword = async (email: string, code: string, newPassword: string) => {
    const mod = await import('@/lib/cognito/client')
    return mod.confirmForgotPassword(email, code, newPassword)
  }

  const handleSignOut = async () => {
    const { signOut } = await import('@/lib/cognito/client')
    await signOut()
    setUser(null)
    setUserProfile(null)
  }

  return (
    <AuthContext.Provider value={{
      user,
      userProfile,
      loading,
      signIn: handleSignIn,
      signUp: handleSignUp,
      confirmSignUp: handleConfirmSignUp,
      resendCode: handleResendCode,
      forgotPassword: handleForgotPassword,
      confirmForgotPassword: handleConfirmForgotPassword,
      signOut: handleSignOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
