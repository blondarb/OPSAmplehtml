/**
 * /rnd/historian/simulator — Historian Simulator dashboard (R&D).
 *
 * Synthetic-patient runs against Henry, graded against each persona's hidden
 * ground-truth diagnosis. Cognito-gated by default via src/middleware.ts.
 * Data from /api/ai/historian/sim/runs (historian_sim_runs, migration 059).
 * Synthetic / pre-production data only.
 */

import HistorianSimView from '@/components/historian/HistorianSimView'

export const metadata = {
  title: 'Historian Simulator (R&D) — Sevaro Clinical',
}

export default function HistorianSimulatorPage() {
  return <HistorianSimView />
}
