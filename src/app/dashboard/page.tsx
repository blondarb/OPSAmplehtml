'use client'

import CommandCenterPage from '@/components/command-center/CommandCenterPage'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { LayoutDashboard } from 'lucide-react'

export default function DashboardPage() {
  return (
    <PlatformShell>
      <FeatureSubHeader
        title="Operations Dashboard"
        icon={LayoutDashboard}
        accentColor="#4F46E5"
        showDemo={true}
      />
      <div style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)', minHeight: '100vh' }}>
        <div className="px-6 pt-4">
          <div className="mx-auto flex max-w-6xl items-center gap-2 rounded-lg border border-sky-900/60 bg-sky-950/40 px-4 py-2.5 text-xs text-slate-400">
            <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-sky-300">Concept</span>
            <span>
              Where this dashboard is heading: role-based views. The nurse role is drafted — see the{' '}
              <a href="/concepts/triage-nurse/outpatient-triage-nurse-demo.html" className="font-medium text-sky-300 underline hover:text-sky-200">
                Triage Nurse working demo
              </a>{' '}
              and its{' '}
              <a href="/concepts/triage-nurse/mvp-workflow.html" className="font-medium text-sky-300 underline hover:text-sky-200">
                Epic-hybrid MVP workflow
              </a>.
            </span>
          </div>
        </div>
        <CommandCenterPage />
      </div>
    </PlatformShell>
  )
}
