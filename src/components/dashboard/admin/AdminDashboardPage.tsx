'use client'

import React, { useState } from 'react'
import ClinicPulse from './ClinicPulse'
import ProviderPerformancePanel from './ProviderPerformancePanel'
import StaffingPanel from './StaffingPanel'
import PendingActionsOverview from './PendingActionsOverview'
import AlertsPanel from './AlertsPanel'
import ActivityFeed from './ActivityFeed'
import QualitySnapshot from './QualitySnapshot'
import SiteComparison from './SiteComparison'
import DisclaimerBanner from '@/components/command-center/DisclaimerBanner'
import { RefreshCw } from 'lucide-react'

// ── Practice Manager Dashboard Orchestrator ──────────────────────────────────
// 4-zone layout wiring 8 PM sub-components:
//   Zone 1 (top, full width): ClinicPulse metrics bar
//   Zone 2 (left column):     ProviderPerformancePanel, StaffingPanel, PendingActionsOverview
//   Zone 3 (right column):    AlertsPanel, ActivityFeed, QualitySnapshot
//   Zone 4 (bottom, full):    SiteComparison collapsible table
//   + DisclaimerBanner at very bottom

const SITE_OPTIONS = ['All Sites', 'Riverview', 'Lakewood', 'Home']

export default function AdminDashboardPage() {
  const [selectedSite, setSelectedSite] = useState('All Sites')

  return (
    <div
      style={{
        background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)',
        minHeight: '100vh',
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Zone 1: ClinicPulse metrics bar */}
        <ClinicPulse />

        {/* Controls row: site selector + last updated */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Left: Site selector */}
          <select
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              color: '#CBD5E1',
              fontSize: 13,
              fontWeight: 500,
              padding: '6px 12px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {SITE_OPTIONS.map((site) => (
              <option key={site} value={site} style={{ background: '#1E293B', color: '#CBD5E1' }}>
                {site}
              </option>
            ))}
          </select>

          {/* Right: Last updated + refresh icon */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                color: '#64748B',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              Last updated: 9:40 AM
            </span>
            <button
              type="button"
              aria-label="Refresh"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                color: '#64748B',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#94A3B8'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#64748B'
              }}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Zones 2 + 3: Two-column grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
            gap: 16,
          }}
        >
          {/* Zone 2: Left column — stacked vertically */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ProviderPerformancePanel />
            <StaffingPanel />
            <PendingActionsOverview />
          </div>

          {/* Zone 3: Right column — stacked vertically */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <AlertsPanel />
            <ActivityFeed />
            <QualitySnapshot />
          </div>
        </div>

        {/* Zone 4: SiteComparison — full width, collapsible */}
        <SiteComparison />
      </div>

      {/* Disclaimer banner — very bottom */}
      <div
        style={{
          maxWidth: 1400,
          margin: '16px auto 0 auto',
        }}
      >
        <DisclaimerBanner />
      </div>
    </div>
  )
}
