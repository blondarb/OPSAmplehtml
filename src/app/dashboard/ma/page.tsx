'use client'

import MADashboardPage from '@/components/dashboard/ma/MADashboardPage'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { Users } from 'lucide-react'

export default function MADashboardRoute() {
  return (
    <PlatformShell>
      <FeatureSubHeader
        title="MA Dashboard"
        icon={Users}
        accentColor="#0D9488"
        showDemo={true}
      />
      <MADashboardPage />
    </PlatformShell>
  )
}
