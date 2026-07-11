/**
 * Clara Results & Feedback — review/history page for the Clara voice test
 * harness (see src/app/rnd/clara/page.tsx).
 *
 * Same password gate as /rnd/clara (src/lib/clara/testGate.ts) — added to
 * PUBLIC_ROUTES in src/middleware.ts alongside the main test page so it
 * works standalone. Internal / synthetic use ONLY.
 */

import { cookies } from 'next/headers'
import { CLARA_GATE_COOKIE, verifyGateToken, isGateConfigured } from '@/lib/clara/testGate'
import ClaraPasswordGate from '@/components/clara/ClaraPasswordGate'
import ClaraResultsHistoryView from '@/components/clara/ClaraResultsHistoryView'

export const metadata = {
  title: 'Clara Results & Feedback (R&D) — Sevaro Clinical',
}

export default async function ClaraResultsPage() {
  const cookieStore = await cookies()
  const authed = verifyGateToken(cookieStore.get(CLARA_GATE_COOKIE)?.value)

  if (!authed) {
    return <ClaraPasswordGate configured={isGateConfigured()} />
  }

  return <ClaraResultsHistoryView />
}
