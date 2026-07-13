/**
 * Clara Voice Test — R&D sub-page.
 *
 * Internal / synthetic use ONLY. Password-gated (see src/lib/clara/testGate.ts)
 * — NOT gated by Cognito (added to PUBLIC_ROUTES in src/middleware.ts) so it
 * works as a standalone test link independent of app login state. Linked
 * from the homepage only when NEXT_PUBLIC_CLARA_TEST_ENABLED=true (see
 * src/app/page.tsx).
 */

import { cookies } from 'next/headers'
import { CLARA_GATE_COOKIE, verifyGateToken, isGateConfigured } from '@/lib/clara/testGate'
import ClaraPasswordGate from '@/components/clara/ClaraPasswordGate'
import ClaraVoiceTestView from '@/components/clara/ClaraVoiceTestView'

export const metadata = {
  title: 'Clara Voice Test (R&D) — Sevaro Clinical',
}

export default async function ClaraTestPage() {
  const cookieStore = await cookies()
  const authed = verifyGateToken(cookieStore.get(CLARA_GATE_COOKIE)?.value)

  if (!authed) {
    return <ClaraPasswordGate configured={isGateConfigured()} />
  }

  return <ClaraVoiceTestView />
}
