'use client'

import RoleChooserPage from '@/components/dashboard/RoleChooserPage'
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
        <RoleChooserPage />
      </div>
    </PlatformShell>
  )
}
