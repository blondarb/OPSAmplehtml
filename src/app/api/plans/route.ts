import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DIAGNOSIS_CATEGORIES } from '@/lib/diagnosisData'

// Build a map of diagnosis ID to ICD-10 code for quick lookup
const diagnosisToIcd10Map: Record<string, string> = {}
DIAGNOSIS_CATEGORIES.forEach(category => {
  category.diagnoses.forEach(diag => {
    diagnosisToIcd10Map[diag.id] = diag.icd10
  })
})

// GET /api/plans - Get all clinical plans or a specific plan for a diagnosis
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const diagnosisId = searchParams.get('diagnosisId')
    const listAll = searchParams.get('list') === 'true'

    // If listing all plans - query the table directly
    if (listAll) {
      const { data, error } = await supabase
        .from('clinical_plans')
        .select('plan_key, title, icd10_codes')
        .order('title')

      if (error) {
        console.error('Error fetching all plans:', error)
        return NextResponse.json({ error: 'Failed to fetch plans' }, { status: 500 })
      }

      // Transform to include plan_id and compute linked_diagnoses from ICD-10 codes
      const plans = (data || []).map(plan => {
        // Find all diagnosis IDs that match this plan's ICD-10 codes
        const linkedDiagnoses: string[] = []
        const planIcd10s = plan.icd10_codes || []

        Object.entries(diagnosisToIcd10Map).forEach(([diagId, icd10]) => {
          // Check if any of the plan's ICD-10 codes match this diagnosis
          if (planIcd10s.some((code: string) => icd10.startsWith(code.replace(/\.\d+$/, '')) || code.startsWith(icd10.replace(/\.\d+$/, '')) || icd10 === code)) {
            linkedDiagnoses.push(diagId)
          }
        })

        return {
          plan_id: plan.plan_key,
          title: plan.title,
          icd10_codes: planIcd10s,
          linked_diagnoses: linkedDiagnoses
        }
      })

      return NextResponse.json({ plans })
    }

    // If fetching plan for a specific diagnosis
    if (diagnosisId) {
      // Get the ICD-10 code for this diagnosis
      const diagnosisIcd10 = diagnosisToIcd10Map[diagnosisId]

      if (!diagnosisIcd10) {
        return NextResponse.json({ plan: null, message: 'Diagnosis not found' })
      }

      // Find plans that include this ICD-10 code (or a matching prefix)
      const { data: allPlans, error } = await supabase
        .from('clinical_plans')
        .select('*')
        .order('title')

      if (error) {
        console.error('Error fetching plans:', error)
        return NextResponse.json({ error: 'Failed to fetch plans' }, { status: 500 })
      }

      // Find the first plan that matches this diagnosis's ICD-10
      const matchingPlan = (allPlans || []).find(plan => {
        const planIcd10s = plan.icd10_codes || []
        return planIcd10s.some((code: string) => {
          const codeBase = code.replace(/\.\d+$/, '')
          const diagBase = diagnosisIcd10.replace(/\.\d+$/, '')
          return code === diagnosisIcd10 || codeBase === diagBase || diagnosisIcd10.startsWith(codeBase) || code.startsWith(diagBase)
        })
      })

      if (!matchingPlan) {
        return NextResponse.json({ plan: null, message: 'No plan found for this diagnosis' })
      }

      // Transform to match the ClinicalPlan interface
      const transformedPlan = {
        id: matchingPlan.plan_key,
        title: matchingPlan.title,
        icd10: matchingPlan.icd10_codes || [],
        scope: matchingPlan.scope || '',
        notes: matchingPlan.notes || [],
        sections: matchingPlan.sections || {},
        patientInstructions: matchingPlan.patient_instructions || [],
        referrals: matchingPlan.referrals || [],
        differential: matchingPlan.differential || [],
        evidence: matchingPlan.evidence || [],
        monitoring: matchingPlan.monitoring || [],
        disposition: matchingPlan.disposition || [],
        isGeneric: false
      }

      return NextResponse.json({ plan: transformedPlan })
    }

    // If no params, return all plans with full data
    const { data, error } = await supabase
      .from('clinical_plans')
      .select('*')
      .order('title')

    if (error) {
      console.error('Error fetching plans:', error)
      return NextResponse.json({ error: 'Failed to fetch plans' }, { status: 500 })
    }

    // Transform to match expected interface
    const transformedPlans = (data || []).map(plan => ({
      id: plan.plan_key,
      title: plan.title,
      icd10: plan.icd10_codes || [],
      scope: plan.scope || '',
      notes: plan.notes || [],
      sections: plan.sections || {},
      patientInstructions: plan.patient_instructions || [],
      referrals: plan.referrals || [],
      differential: plan.differential || [],
      evidence: plan.evidence || [],
      monitoring: plan.monitoring || [],
      disposition: plan.disposition || [],
      isGeneric: false
    }))

    return NextResponse.json({ plans: transformedPlans })
  } catch (error) {
    console.error('Error in plans API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
