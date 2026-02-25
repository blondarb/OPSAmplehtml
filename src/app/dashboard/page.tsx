import CommandCenterPage from '@/components/command-center/CommandCenterPage'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { LayoutDashboard } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  return (
    <PlatformShell>
      <FeatureSubHeader
        title="Command Center"
        icon={LayoutDashboard}
        accentColor="#4F46E5"
        showDemo={true}
      />
      <div style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)', minHeight: '100vh' }}>
        <CommandCenterPage />
      </div>
    </PlatformShell>
  )
}
