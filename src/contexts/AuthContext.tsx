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
  signOut: () => void
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
      try {
        const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
        if (res.ok && mounted) {
          const currentUser = await res.json()
          setUser(currentUser)
          await fetchProfile()
        }
      } catch {
        // Not authenticated
      }
      if (mounted) setLoading(false)
    }

    init()

    // Proactive token refresh every 50 minutes (tokens expire in 1 hour)
    const refreshInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'same-origin',
        })
        if (res.ok) {
          const refreshedUser = await res.json()
          setUser(refreshedUser)
        }
      } catch {
        // Refresh failed — user will need to re-login when token expires
      }
    }, 50 * 60 * 1000)

    return () => {
      mounted = false
      clearInterval(refreshInterval)
    }
  }, [fetchProfile])

  const handleSignOut = () => {
    window.location.href = '/api/auth/logout'
  }

  return (
    <AuthContext.Provider value={{
      user,
      userProfile,
      loading,
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
