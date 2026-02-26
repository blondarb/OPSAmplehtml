'use client'

import React, { useState, useMemo } from 'react'
import { DEMO_PROVIDERS } from '@/lib/dashboard/demoProviders'
import { DEMO_PATIENTS } from '@/lib/dashboard/demoPatients'
import { DEMO_MA_TASKS } from '@/lib/dashboard/demoTasks'
import ProviderStatusStrip from './ProviderStatusStrip'
import PatientFlowBoard from './PatientFlowBoard'
import MATaskQueue from './MATaskQueue'
import DisclaimerBanner from '@/components/command-center/DisclaimerBanner'

// ── MA Dashboard Orchestrator ─────────────────────────────────────────────────
// Wires ProviderStatusStrip, PatientFlowBoard, MATaskQueue, and DisclaimerBanner
// together with shared state for provider selection and block toggle.

export default function MADashboardPage() {
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [block, setBlock] = useState<'morning' | 'afternoon'>('morning')

  // Filter patients by selected provider
  const filteredPatients = useMemo(() => {
    if (!selectedProviderId) return DEMO_PATIENTS
    return DEMO_PATIENTS.filter((p) => p.provider_id === selectedProviderId)
  }, [selectedProviderId])

  // Filter tasks by selected provider
  const filteredTasks = useMemo(() => {
    if (!selectedProviderId) return DEMO_MA_TASKS
    return DEMO_MA_TASKS.filter((t) => t.provider_id === selectedProviderId)
  }, [selectedProviderId])

  return (
    <div
      style={{
        backgroundColor: '#F8FAFC',
        minHeight: '100vh',
      }}
    >
      {/* Provider status strip — sticky at top */}
      <ProviderStatusStrip
        providers={DEMO_PROVIDERS}
        selectedProviderId={selectedProviderId}
        onProviderSelect={setSelectedProviderId}
      />

      {/* Main content area */}
      <div
        style={{
          maxWidth: 1400,
          margin: '0 auto',
          padding: '24px 24px 0 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Patient Flow Board — main scrollable area */}
        <PatientFlowBoard
          providers={DEMO_PROVIDERS}
          patients={filteredPatients}
          tasks={filteredTasks}
          selectedProviderId={selectedProviderId}
          block={block}
          onBlockChange={setBlock}
        />

        {/* Task Queue — collapsible bottom panel */}
        <MATaskQueue
          tasks={filteredTasks}
          providers={DEMO_PROVIDERS}
          patients={filteredPatients}
          selectedProviderId={selectedProviderId}
        />
      </div>

      {/* Disclaimer banner — bottom */}
      <div
        style={{
          maxWidth: 1400,
          margin: '20px auto 0 auto',
        }}
      >
        <DisclaimerBanner />
      </div>
    </div>
  )
}
