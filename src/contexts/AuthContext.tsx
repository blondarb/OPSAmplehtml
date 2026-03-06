'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'

interface UserProfile {
  id: string
  display_name: string | null
  role: string
  organization: string | null
  specialty: string | null
}

interface AuthContextType {
  user: User | null
  session: Session | null
  userProfile: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (_userId: string) => {
    try {
      const res = await fetch('/api/auth/profile')
      if (res.ok) {
        const { profile } = await res.json()
        if (profile) setUserProfile(profile)
      }
    } catch {
      // Profile may not exist yet (trigger hasn't fired)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    let unsubscribe: (() => void) | undefined

    const init = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      // Get initial session
      const { data: { session: initialSession } } = await supabase.auth.getSession()
      if (mounted) {
        setSession(initialSession)
        setUser(initialSession?.user ?? null)
        if (initialSession?.user) {
          await fetchProfile(initialSession.user.id)
        }
        setLoading(false)
      }

      // Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (_event, newSession) => {
          if (mounted) {
            setSession(newSession)
            setUser(newSession?.user ?? null)
            if (newSession?.user) {
              await fetchProfile(newSession.user.id)
            } else {
              setUserProfile(null)
            }
          }
        }
      )

      unsubscribe = () => subscription.unsubscribe()
    }

    init()

    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [fetchProfile])

  const signIn = async (email: string, password: string) => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signUp = async (email: string, password: string) => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) return { error: error.message, needsConfirmation: false }
    // If user exists but no session, email confirmation is needed
    const needsConfirmation = !!(data.user && !data.session)
    return { error: null, needsConfirmation }
  }

  const signOut = async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setUserProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, session, userProfile, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
