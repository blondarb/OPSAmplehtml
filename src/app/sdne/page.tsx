'use client'

import { Suspense, useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import SDNEResultsBanner from '@/components/SDNEResultsBanner'
import { Activity } from 'lucide-react'

// The SDNE dashboard is deployed and maintained in the SDNE repo.
// We embed it here via iframe so OPSAmplehtml always shows the latest
// without duplicating code or data across repos.
const SDNE_DASHBOARD_URL = process.env.NEXT_PUBLIC_SDNE_URL || 'https://main.d1ld38tyw8bl1b.amplifyapp.com'

// Allowed origins for postMessage validation
const ALLOWED_ORIGINS = [
  new URL(SDNE_DASHBOARD_URL).origin,
  'https://main.d1ld38tyw8bl1b.amplifyapp.com',
]

interface SDNESessionResult {
  sdne_session_id: string
  session_flag: string
  domain_flags: Record<string, unknown>
  detected_patterns: string[]
  completed_at?: string
}

export default function SDNEPage() {
  return (
    <Suspense fallback={
      <PlatformShell>
        <FeatureSubHeader title="Digital Neurological Exam" icon={Activity} accentColor="#1E40AF" />
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
      </PlatformShell>
    }>
      <SDNEPageInner />
    </Suspense>
  )
}

function SDNEPageInner() {
  const searchParams = useSearchParams()
  const consultId = searchParams.get('consult')
  const patientId = searchParams.get('patient')

  const [sdneResult, setSdneResult] = useState<SDNESessionResult | null>(null)
  const [linkStatus, setLinkStatus] = useState<'idle' | 'linking' | 'linked' | 'error'>('idle')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const toastTimeout = useRef<NodeJS.Timeout>()

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    if (toastTimeout.current) clearTimeout(toastTimeout.current)
    toastTimeout.current = setTimeout(() => setToast(null), 5000)
  }, [])

  // Link SDNE results to consult if a consult context exists
  const linkToConsult = useCallback(async (result: SDNESessionResult) => {
    if (!consultId) return

    setLinkStatus('linking')
    setLinkError(null)

    try {
      const res = await fetch(`/api/neuro-consults/${consultId}/sdne`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdne_session_id: result.sdne_session_id,
          session_flag: result.session_flag,
          domain_flags: result.domain_flags,
          detected_patterns: result.detected_patterns,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to link SDNE results' }))
        throw new Error(data.error || 'Failed to link SDNE results')
      }

      setLinkStatus('linked')
      showToast('SDNE results linked to consult successfully', 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to link SDNE results'
      setLinkStatus('error')
      setLinkError(message)
      showToast(message, 'error')
    }
  }, [consultId, showToast])

  // Listen for postMessage events from the SDNE iframe
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Validate origin for security
      if (!ALLOWED_ORIGINS.includes(event.origin)) {
        return
      }

      const data = event.data
      if (!data || typeof data !== 'object') return

      // SDNE sends session results with a specific message type
      if (data.type === 'sdne:session-complete' || data.type === 'sdne:results') {
        const result: SDNESessionResult = {
          sdne_session_id: data.sdne_session_id || data.sessionId || '',
          session_flag: data.session_flag || data.sessionFlag || 'normal',
          domain_flags: data.domain_flags || data.domainFlags || {},
          detected_patterns: data.detected_patterns || data.detectedPatterns || [],
          completed_at: data.completed_at || new Date().toISOString(),
        }

        if (!result.sdne_session_id) {
          console.warn('[SDNE] Received session result without session ID')
          return
        }

        setSdneResult(result)

        // Store in sessionStorage for EHR display
        const storageKey = patientId
          ? `sdne-results-patient-${patientId}`
          : consultId
            ? `sdne-results-consult-${consultId}`
            : `sdne-results-latest`
        sessionStorage.setItem(storageKey, JSON.stringify(result))

        // If a consult context exists, link the results
        if (consultId) {
          linkToConsult(result)
        } else {
          showToast('SDNE session results received', 'success')
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [consultId, patientId, linkToConsult, showToast])

  // Build iframe URL with patient/consult context
  const iframeSrc = (() => {
    const url = new URL(SDNE_DASHBOARD_URL)
    if (patientId) url.searchParams.set('patient', patientId)
    if (consultId) url.searchParams.set('consult', consultId)
    return url.toString()
  })()

  return (
    <PlatformShell>
      <FeatureSubHeader
        title="Digital Neurological Exam"
        icon={Activity}
        accentColor="#1E40AF"
      />

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '80px',
          right: '24px',
          zIndex: 9999,
          padding: '12px 20px',
          borderRadius: '10px',
          background: toast.type === 'success' ? '#16a34a' : '#ef4444',
          color: 'white',
          fontSize: '14px',
          fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          animation: 'slideIn 0.2s ease-out',
        }}>
          {toast.message}
        </div>
      )}

      {/* Results banner when SDNE data is available */}
      {sdneResult && (
        <SDNEResultsBanner
          result={sdneResult}
          consultId={consultId}
          linkStatus={linkStatus}
          linkError={linkError}
        />
      )}

      <div style={{
        minHeight: 'calc(100vh - 112px)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      }}>
        {/* Iframe -- fills remaining viewport */}
        <iframe
          src={iframeSrc}
          style={{
            flex: 1,
            width: '100%',
            border: 'none',
          }}
          title="SDNE Dashboard"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          allow="clipboard-read; clipboard-write; camera; microphone"
        />
      </div>
    </PlatformShell>
  )
}
