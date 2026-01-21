import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClinicalNote from '@/components/ClinicalNote'

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

  // Fetch score history
  const { data: scoreHistory } = await supabase
    .from('clinical_scales')
    .select('*')
    .order('created_at', { ascending: false })

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
