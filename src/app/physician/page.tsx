import ClinicalNote from '@/components/ClinicalNote'
import { fetchDashboardData } from '@/lib/dashboardData'

// Force dynamic rendering - this page requires auth
export const dynamic = 'force-dynamic'

export default async function PhysicianPage() {
  const data = await fetchDashboardData()

  return (
    <ClinicalNote
      user={data.user}
      patient={data.patient}
      currentVisit={data.currentVisit}
      priorVisits={data.priorVisits}
      imagingStudies={data.imagingStudies}
      scoreHistory={data.scoreHistory}
      patientMessages={data.patientMessages}
    />
  )
}
