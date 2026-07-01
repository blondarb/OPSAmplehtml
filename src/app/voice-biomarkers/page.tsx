'use client'

/**
 * Demo / test-harness page for the acoustic speech-biomarker battery.
 *
 * Phase A scaffold (2026-06-30). Standalone runner so the capability is testable
 * in test week without first deciding final placement (SDNE panel vs Physical
 * Exams tab — open question in the spec). Requires VOICE_BIOMARKERS_ENABLED on
 * the server; the route returns 503 otherwise.
 *
 * See docs/plans/2026-06-30-acoustic-speech-biomarkers-spec.md.
 */

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { VoiceTaskCapture } from '@/components/voice/VoiceTaskCapture'
import { Mic } from 'lucide-react'

export default function VoiceBiomarkersPage() {
  return (
    <Suspense
      fallback={
        <PlatformShell>
          <FeatureSubHeader title="Speech Biomarkers" icon={Mic} accentColor="#1E40AF" />
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        </PlatformShell>
      }
    >
      <Inner />
    </Suspense>
  )
}

function Inner() {
  const searchParams = useSearchParams()
  const patientId = searchParams.get('patient') || undefined
  const visitId = searchParams.get('visit') || undefined

  return (
    <PlatformShell>
      <FeatureSubHeader title="Speech Biomarkers" icon={Mic} accentColor="#1E40AF" />
      <div style={{ padding: 24 }}>
        <VoiceTaskCapture patientId={patientId} visitId={visitId} />
      </div>
    </PlatformShell>
  )
}
