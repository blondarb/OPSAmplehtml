'use client'

import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { Activity } from 'lucide-react'

// The SDNE dashboard is deployed and maintained in the SDNE repo.
// We embed it here via iframe so OPSAmplehtml always shows the latest
// without duplicating code or data across repos.
const SDNE_DASHBOARD_URL = 'https://dashboard-five-puce-49.vercel.app'

export default function SDNEPage() {
  return (
    <PlatformShell>
      <FeatureSubHeader
        title="Digital Neurological Exam"
        icon={Activity}
        accentColor="#1E40AF"
      />
      <div style={{
        minHeight: 'calc(100vh - 112px)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      }}>
        {/* Iframe — fills remaining viewport */}
        <iframe
          src={SDNE_DASHBOARD_URL}
          style={{
            flex: 1,
            width: '100%',
            border: 'none',
          }}
          title="SDNE Dashboard"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </PlatformShell>
  )
}
