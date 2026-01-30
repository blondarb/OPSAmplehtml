import { redirect } from 'next/navigation'
import { getAppMode } from '@/lib/appMode'
import LandingPage from '@/components/LandingPage'

export default function Home() {
  const mode = getAppMode()

  if (mode === 'physician_only') {
    // Backwards-compatible: behave like the old redirect but go to /physician
    redirect('/physician')
  }

  // full_demo mode: show the role-selection landing page
  return <LandingPage />
}
