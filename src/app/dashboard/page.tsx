import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClinicalNote from '@/components/ClinicalNote'

// Force dynamic rendering - this page requires auth
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch patient data
  const { data: patients } = await supabase
    .from('patients')
    .select('*')
    .limit(1)
    .single()

  // Fetch current visit with notes
  const { data: currentVisit } = await supabase
    .from('visits')
    .select(`
      *,
      clinical_notes(*),
      clinical_scales(*),
      diagnoses(*)
    `)
    .eq('status', 'in_progress')
    .order('visit_date', { ascending: false })
    .limit(1)
    .single()

  // Fetch prior visits
  const { data: priorVisits } = await supabase
    .from('visits')
    .select(`
      *,
      clinical_notes(ai_summary)
    `)
    .eq('status', 'completed')
    .order('visit_date', { ascending: false })
    .limit(5)

  // Fetch imaging studies
  const { data: imagingStudies } = await supabase
    .from('imaging_studies')
    .select('*')
    .order('study_date', { ascending: false })
    .limit(10)

  // Fetch score history from scale_results (new Smart Scales)
  // Map to format expected by LeftSidebar: { scale_type, score, interpretation, created_at }
  const { data: scaleResults } = await supabase
    .from('scale_results')
    .select('*')
    .eq('patient_id', patients?.id)
    .order('completed_at', { ascending: false })
    .limit(20)

  // Transform scale_results to scoreHistory format
  const scoreHistory = (scaleResults || []).map(result => ({
    id: result.id,
    scale_type: result.scale_id.toUpperCase().replace('PHQ9', 'PHQ-9').replace('GAD7', 'GAD-7').replace('HIT6', 'HIT-6'),
    score: result.raw_score,
    interpretation: result.interpretation,
    created_at: result.completed_at,
  }))

  return (
    <ClinicalNote
      user={user}
      patient={patients}
      currentVisit={currentVisit}
      priorVisits={priorVisits || []}
      imagingStudies={imagingStudies || []}
      scoreHistory={scoreHistory || []}
    />
  )
}
