'use client'

import AdminDashboardPage from '@/components/dashboard/admin/AdminDashboardPage'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { BarChart3 } from 'lucide-react'

export default function AdminDashboardRoute() {
  return (
    <PlatformShell>
      <FeatureSubHeader
        title="Practice Manager Dashboard"
        icon={BarChart3}
        accentColor="#4F46E5"
        showDemo={true}
      />
      <AdminDashboardPage />
    </PlatformShell>
  )
}
