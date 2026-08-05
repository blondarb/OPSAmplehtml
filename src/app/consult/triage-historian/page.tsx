import { Suspense } from 'react'
import NeurologicHistorian from '@/components/NeurologicHistorian'

/**
 * Clinician mirror of the referred-from-triage historian interview.
 *
 * Same interview as /patient/triage-historian, plus the physician
 * differential panel that the Localizer drives (updating on its own cadence
 * as the history develops). The patient route must never show that content —
 * redesign brief Part 4 — so the mirror lives here instead, under /consult,
 * which is NOT in middleware's PUBLIC_ROUTES and therefore requires a login.
 *
 * `clinicianMirror` is a prop rather than a query param on the patient route
 * precisely so a patient cannot enable diagnostic content by editing a URL.
 */
export const metadata = {
  title: 'Referred Intake — Clinician View | Sevaro',
}

export default function ConsultTriageHistorianPage() {
  return (
    <Suspense fallback={null}>
      <NeurologicHistorian initialMode="referred" clinicianMirror />
    </Suspense>
  )
}
