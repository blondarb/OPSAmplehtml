'use client'

import Link from 'next/link'
import { Bot } from 'lucide-react'
import PlatformShell from '@/components/layout/PlatformShell'
import HeroSection from '@/components/homepage/HeroSection'
import JourneyTrack from '@/components/homepage/JourneyTrack'
import { clinicianTrack, patientTrack, ongoingCareTrack } from '@/components/homepage/journeyData'
import ByTheNumbers from '@/components/homepage/ByTheNumbers'
import Footer from '@/components/homepage/Footer'

// Feature flag — default OFF. When off, the homepage renders byte-identical
// to before this section existed. Flip in Amplify env vars (or .env.local)
// to surface internal-only R&D links; each linked page has its own
// independent gate (password, feature flag, etc) on top of this one.
const RND_SECTION_ENABLED = process.env.NEXT_PUBLIC_RND_SECTION_ENABLED === 'true'

export default function Home() {
  return (
    <PlatformShell>
      <HeroSection />

      <div id="journey" className="bg-slate-50">
        <JourneyTrack track={clinicianTrack} />
        <JourneyTrack track={patientTrack} />
        <JourneyTrack track={ongoingCareTrack} />
      </div>

      <ByTheNumbers />

      {RND_SECTION_ENABLED && (
        <div className="bg-slate-900 px-6 py-10">
          <div className="mx-auto max-w-4xl">
            <div className="mb-4 flex items-center gap-2">
              <span className="rounded bg-amber-500/20 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-amber-300">
                R&amp;D / Internal Testing
              </span>
              <span className="text-xs text-slate-400">Not part of the product demo — internal use only</span>
            </div>
            <Link
              href="/rnd/clara"
              className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-5 py-4 transition hover:border-violet-500 hover:bg-slate-800"
            >
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-violet-500/15">
                <Bot size={20} className="text-violet-300" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">Clara Voice Test</span>
                <span className="block text-xs text-slate-400">
                  Password-gated browser mic test against Clara&apos;s neuro-triage classification rulebook. Synthetic scenarios only.
                </span>
              </span>
            </Link>
          </div>
        </div>
      )}

      <Footer />
    </PlatformShell>
  )
}
