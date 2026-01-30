import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTenantServer } from '@/lib/tenant'

/**
 * Shared server-side data-fetching used by both /dashboard and /physician.
 *
 * Returns all props expected by the <ClinicalNote> component.
 * Redirects to /login if the user is not authenticated.
 */
export async function fetchDashboardData() {
  const supabase = await createClient()
  const tenant = getTenantServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch patient data
  const { data: patients } = await supabase
    .from('patients')
    .select('*')
    .eq('tenant_id', tenant)
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
    .eq('tenant_id', tenant)
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
    .eq('tenant_id', tenant)
    .order('visit_date', { ascending: false })
    .limit(5)

  // Fetch imaging studies
  const { data: imagingStudies } = await supabase
    .from('imaging_studies')
    .select('*')
    .eq('tenant_id', tenant)
    .order('study_date', { ascending: false })
    .limit(10)

  // Fetch score history from scale_results (new Smart Scales)
  const { data: scaleResults } = await supabase
    .from('scale_results')
    .select('*')
    .eq('patient_id', patients?.id)
    .eq('tenant_id', tenant)
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

  // Fetch patient messages for physician view
  let patientMessages: any[] = []
  try {
    const { data: msgs } = await supabase
      .from('patient_messages')
      .select('*')
      .eq('tenant_id', tenant)
      .order('created_at', { ascending: false })
      .limit(10)
    patientMessages = msgs || []
  } catch {
    // Table may not exist yet — ignore
  }

  // Fetch historian sessions for physician view
  let historianSessions: any[] = []
  try {
    const { data: sessions } = await supabase
      .from('historian_sessions')
      .select('*')
      .eq('tenant_id', tenant)
      .order('created_at', { ascending: false })
      .limit(10)
    historianSessions = sessions || []
  } catch {
    // Table may not exist yet — ignore
  }

  return {
    user,
    patient: patients,
    currentVisit,
    priorVisits: priorVisits || [],
    imagingStudies: imagingStudies || [],
    scoreHistory: scoreHistory || [],
    patientMessages,
    historianSessions,
  }
}
