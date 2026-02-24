'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useCallback } from 'react'

export function useActivityLog() {
  const { user } = useAuth()

  const logActivity = useCallback(
    (action: string, target: string, metadata?: Record<string, unknown>) => {
      if (!user) return

      // Fire-and-forget — don't await, don't block UI
      import('@/lib/supabase/client').then(({ createClient }) => {
        const supabase = createClient()
        supabase
          .from('user_activity_log')
          .insert({ user_id: user.id, action, target, metadata: metadata ?? {} })
          .then(() => {})
          .catch(() => {})
      })
    },
    [user]
  )

  return { logActivity }
}
