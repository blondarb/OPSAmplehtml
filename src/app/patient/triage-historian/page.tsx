import { Suspense } from 'react'
import NeurologicHistorian from '@/components/NeurologicHistorian'

export const dynamic = 'force-dynamic'

// Dedicated entry into the triage → historian handoff story (referred mode),
// so it can be opened directly as its own demo beat instead of relying on
// scoring a referral on /triage first. Already public — middleware's
// PUBLIC_ROUTES includes '/patient' and matches any '/patient/...' path, so
// no middleware change is needed here.
//
// `initialMode="referred"` only sets intent for this route's cold-open copy;
// actual referred-mode rendering is still driven by whether a triage handoff
// is present in sessionStorage (see NeurologicHistorian's `referredMode`).
// A cold open here (no handoff loaded) falls through to the same picker
// /patient/historian shows, plus one route-specific hint.
export default function TriageHistorianPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        background: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a3b8',
      }}>
        Loading...
      </div>
    }>
      <NeurologicHistorian initialMode="referred" />
    </Suspense>
  )
}
