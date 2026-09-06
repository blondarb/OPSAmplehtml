/**
 * /launchpad — the internal project index.
 *
 * One row per project with every place the team needs to reach (live app,
 * test page, results, installers, Kiran's dev line), plus each project's
 * still-open roadmap items pulled live from its Asana Portfolio card.
 *
 * Cognito-gated via src/middleware.ts (not in PUBLIC_ROUTES) — same login as
 * the rest of app.neuroplans.app. Inventory: src/data/launchpad.json.
 */

import LaunchpadView from '@/components/launchpad/LaunchpadView'

export const metadata = {
  title: 'Launchpad — Sevaro Labs project index',
}

export default function LaunchpadPage() {
  return <LaunchpadView />
}
