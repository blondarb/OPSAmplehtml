'use client'

import { useState, useEffect, useCallback } from 'react'

export interface NotificationCounts {
  total: number
  critical: number
  wearableAlerts: number
  patientMessages: number
  consultRequests: number
  incompleteDocs: number
  labResults: number
  refillRequests: number
  careGaps: number
  prepStatus: number
  system: number
}

const EMPTY_COUNTS: NotificationCounts = {
  total: 0,
  critical: 0,
  wearableAlerts: 0,
  patientMessages: 0,
  consultRequests: 0,
  incompleteDocs: 0,
  labResults: 0,
  refillRequests: 0,
  careGaps: 0,
  prepStatus: 0,
  system: 0,
}

// Demo counts for prototype - replace with real API calls when backend is wired
const DEMO_COUNTS: NotificationCounts = {
  total: 14,
  critical: 2,
  wearableAlerts: 2,
  patientMessages: 4,
  consultRequests: 2,
  incompleteDocs: 3,
  labResults: 1,
  refillRequests: 1,
  careGaps: 1,
  prepStatus: 0,
  system: 0,
}

export function useNotificationCounts(pollIntervalMs = 30000) {
  const [counts, setCounts] = useState<NotificationCounts>(DEMO_COUNTS)
  const [loading, setLoading] = useState(false)

  const fetchCounts = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/notifications?status=unread&limit=200')
      if (!res.ok) {
        // Fall back to demo counts if API not available
        setCounts(DEMO_COUNTS)
        return
      }

      const { notifications } = await res.json()
      if (!notifications || notifications.length === 0) {
        // Use demo counts when no real data
        setCounts(DEMO_COUNTS)
        return
      }

      const newCounts: NotificationCounts = { ...EMPTY_COUNTS }

      for (const n of notifications) {
        newCounts.total++
        if (n.priority === 'critical') newCounts.critical++

        switch (n.source_type) {
          case 'wearable_alert': newCounts.wearableAlerts++; break
          case 'patient_message': newCounts.patientMessages++; break
          case 'consult_request': newCounts.consultRequests++; break
          case 'incomplete_doc': newCounts.incompleteDocs++; break
          case 'lab_result': newCounts.labResults++; break
          case 'refill_request': newCounts.refillRequests++; break
          case 'care_gap': newCounts.careGaps++; break
          case 'prep_status': newCounts.prepStatus++; break
          case 'system': newCounts.system++; break
        }
      }

      setCounts(newCounts)
    } catch {
      // Network error — keep demo counts
      setCounts(DEMO_COUNTS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCounts()
    const interval = setInterval(fetchCounts, pollIntervalMs)
    return () => clearInterval(interval)
  }, [fetchCounts, pollIntervalMs])

  return { counts, loading, refresh: fetchCounts }
}
