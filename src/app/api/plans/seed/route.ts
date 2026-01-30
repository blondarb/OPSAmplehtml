import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { OUTPATIENT_PLANS } from '@/lib/recommendationPlans'

// POST /api/plans/seed - Seed clinical_plans table from OUTPATIENT_PLANS
export async function POST() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const plans = Object.entries(OUTPATIENT_PLANS).map(([key, plan]) => ({
    plan_key: plan.id,
    title: plan.title,
    icd10_codes: plan.icd10,
    scope: plan.scope,
    notes: plan.notes,
    sections: plan.sections,
    patient_instructions: plan.patientInstructions,
    referrals: plan.referrals,
    differential: plan.differential || null,
    evidence: plan.evidence || null,
    monitoring: plan.monitoring || null,
    disposition: plan.disposition || null,
    source: 'neuro-plans',
  }))

  // Upsert: ON CONFLICT plan_key DO UPDATE
  const { data, error } = await supabase
    .from('clinical_plans')
    .upsert(plans, { onConflict: 'plan_key' })
    .select('plan_key')

  if (error) {
    console.error('Error seeding clinical plans:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    message: 'Clinical plans seeded successfully',
    count: data?.length || 0,
  }, { status: 201 })
}
