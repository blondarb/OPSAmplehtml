/**
 * Neuro FAQ Voice — POC sub-page.
 *
 * POC SKELETON — review before any non-internal use.
 * Public route (added to PUBLIC_ROUTES in src/middleware.ts), mirroring /triage.
 */

import FaqVoiceView from '@/components/faq/FaqVoiceView'

export const metadata = {
  title: 'Neuro FAQ Voice (POC) — Sevaro Clinical',
}

export default function FaqPage() {
  return <FaqVoiceView />
}
