/**
 * /rnd/historian — Historian Runs dashboard (R&D).
 *
 * The SDNE-runhub analog for the AI Neurologic Historian: a read surface over
 * every interview run, so we can watch completion depth (the "cuts off ~Q14"
 * pattern), review the full captured history + medications, the differential
 * with reasoning, scale results, and the transcript.
 *
 * Cognito-gated by default via src/middleware.ts (not in PUBLIC_ROUTES).
 * Data comes from /api/ai/historian/runs. Pre-production / non-real data only.
 */

import HistorianRunsView from '@/components/historian/HistorianRunsView'

export const metadata = {
  title: 'Historian Runs (R&D) — Sevaro Clinical',
}

export default function HistorianRunsPage() {
  return <HistorianRunsView />
}
