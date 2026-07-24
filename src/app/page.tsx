'use client'

import Link from 'next/link'
import { Bot, ClipboardList, Workflow, Layers, Sparkles, Orbit, Gauge, Receipt } from 'lucide-react'
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

      <div className="bg-slate-950 px-6 py-12">
        <div className="mx-auto max-w-4xl">
          <div className="mb-5 flex items-center gap-2">
            <span className="rounded bg-sky-500/20 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-sky-300">
              Concepts
            </span>
            <span className="text-xs text-slate-400">
              Design explorations &amp; MVP thinking — trial and error, not product
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <a
              href="/concepts/synapse-3/unified-surface.html"
              className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-5 py-4 transition hover:border-orange-500 hover:bg-slate-800"
            >
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-orange-500/15">
                <Orbit size={20} className="text-orange-300" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">Synapse 3.0 — One Surface</span>
                <span className="block text-xs text-slate-400">
                  Acute, rounds, EEG reads, clinic, triage, MA &amp; manager as role lenses on one time-spine. Working switcher, new &ldquo;Daylight&rdquo; design language.
                </span>
              </span>
            </a>
            <a
              href="/concepts/triage-nurse/outpatient-triage-nurse-demo.html"
              className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-5 py-4 transition hover:border-sky-500 hover:bg-slate-800"
            >
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-sky-500/15">
                <ClipboardList size={20} className="text-sky-300" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">Outpatient Triage Nurse — working demo</span>
                <span className="block text-xs text-slate-400">
                  Clickable queue, pathway, and dispositions in the Synapse 2.0 chrome. Fictional patients.
                </span>
              </span>
            </a>
            <a
              href="/concepts/triage-nurse/mvp-workflow.html"
              className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-5 py-4 transition hover:border-sky-500 hover:bg-slate-800"
            >
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-teal-500/15">
                <Workflow size={20} className="text-teal-300" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">Triage Nurse MVP — Epic-hybrid workflow</span>
                <span className="block text-xs text-slate-400">
                  No integrations: Epic is record + contact, ours is tracking + intelligence. Paste is the bridge.
                </span>
              </span>
            </a>
            <a
              href="/concepts/outpatient-design/outpatient-mockups.html"
              className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-5 py-4 transition hover:border-sky-500 hover:bg-slate-800"
            >
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500/15">
                <Layers size={20} className="text-indigo-300" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">Outpatient Synapse — tab redesign</span>
                <span className="block text-xs text-slate-400">
                  Exam, imaging/results &amp; scales series from the 7/15 working session, with the decisions ledger.
                </span>
              </span>
            </a>
            <a
              href="/concepts/synapse-3-0.html"
              className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-5 py-4 transition hover:border-amber-500 hover:bg-slate-800"
            >
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/15">
                <Sparkles size={20} className="text-amber-300" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">Synapse 3.0?</span>
                <span className="block text-xs text-slate-400">
                  The parked acute time-rail exploration that seeded One Surface — kept for provenance.
                </span>
              </span>
            </a>
            <a
              href="/concepts/oppe/outpatient-oppe.html"
              className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-5 py-4 transition hover:border-emerald-500 hover:bg-slate-800"
            >
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                <Gauge size={20} className="text-emerald-300" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">Outpatient OPPE</span>
                <span className="block text-xs text-slate-400">
                  Continuous, exception-based practice evaluation instead of a periodic chart-pull. Placeholder — frame only.
                </span>
              </span>
            </a>
            <a
              href="/concepts/billing-coding/billing-and-coding.html"
              className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-5 py-4 transition hover:border-rose-500 hover:bg-slate-800"
            >
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-rose-500/15">
                <Receipt size={20} className="text-rose-300" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">Billing &amp; Coding</span>
                <span className="block text-xs text-slate-400">
                  Code capture and documentation sufficiency at the point of care. Placeholder — frame only.
                </span>
              </span>
            </a>
          </div>
        </div>
      </div>

      <Footer />
    </PlatformShell>
  )
}
