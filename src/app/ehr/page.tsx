import EhrPageWrapper from '@/components/EhrPageWrapper'
import { fetchDashboardData } from '@/lib/dashboardData'

export const dynamic = 'force-dynamic'

export default async function EhrPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>
}) {
  const params = await searchParams
  const data = await fetchDashboardData(params.patient)

  return (
    <EhrPageWrapper
      user={data.user}
      patient={data.patient}
      currentVisit={data.currentVisit}
      priorVisits={data.priorVisits}
      imagingStudies={data.imagingStudies}
      scoreHistory={data.scoreHistory}
      patientMessages={data.patientMessages}
      patientIntakeForms={data.patientIntakeForms}
      historianSessions={data.historianSessions}
    />
  )
}
