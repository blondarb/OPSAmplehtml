'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useCallback } from 'react'

export function useActivityLog() {
  const { user } = useAuth()

  const logActivity = useCallback(
    (action: string, target: string, metadata?: Record<string, unknown>) => {
      if (!user) return

      // Fire-and-forget — don't await, don't block UI
      fetch('/api/activity-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, target, metadata: metadata ?? {} }),
      }).catch(() => {})
    },
    [user]
  )

  return { logActivity }
}
