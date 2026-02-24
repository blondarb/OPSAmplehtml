import CommandCenterDashboard from '@/components/CommandCenterDashboard'

// Force dynamic rendering - this page requires auth
export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  return <CommandCenterDashboard />
}
