import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DIAGNOSIS_CATEGORIES } from '@/lib/diagnosisData'
import { OUTPATIENT_PLANS } from '@/lib/recommendationPlans'

// Build a map of diagnosis ID to ALL ICD-10 codes (primary + alternates)
const diagnosisToIcd10Map: Record<string, string[]> = {}
DIAGNOSIS_CATEGORIES.forEach(category => {
  category.diagnoses.forEach(diag => {
    const codes = [diag.icd10]
    if (diag.alternateIcd10) {
      diag.alternateIcd10.forEach(alt => {
        if (!codes.includes(alt.code)) {
          codes.push(alt.code)
        }
      })
    }
    diagnosisToIcd10Map[diag.id] = codes
  })
})

// Helper: check if any code in a list matches any plan ICD-10 code
// Uses exact 3-character category match (e.g., G43 matches G43.709)
// to prevent false positives across different ICD-10 categories
function codesMatch(planCodes: string[], diagCodes: string[]): boolean {
  return planCodes.some(planCode => {
    // Extract the 3-character base (letter + 2 digits), e.g., G43 from G43.709
    const planBase = planCode.substring(0, 3)
    return diagCodes.some(diagCode => {
      const diagBase = diagCode.substring(0, 3)
      // Exact full code match, or same 3-character ICD-10 category
      return planCode === diagCode || planBase === diagBase
    })
  })
}

// Scored matching: exact full-code matches rank far above prefix-only matches
function matchScore(planCodes: string[], diagCodes: string[]): number {
  let exactMatches = 0
  let prefixMatches = 0
  for (const planCode of planCodes) {
    const planBase = planCode.substring(0, 3)
    for (const diagCode of diagCodes) {
      if (planCode === diagCode) {
        exactMatches++
      } else if (planBase === diagCode.substring(0, 3)) {
        prefixMatches++
      }
    }
  }
  if (exactMatches === 0 && prefixMatches === 0) return 0
  return exactMatches * 1000 + prefixMatches
}

// Fallback: convert OUTPATIENT_PLANS to the DB row shape for consistent handling
function getFallbackPlans() {
  return Object.values(OUTPATIENT_PLANS).map(plan => ({
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
  }))
}

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
    const planKey = searchParams.get('planKey')
    const listAll = searchParams.get('list') === 'true'
    const searchQuery = searchParams.get('search')?.trim().toLowerCase()

    // If searching plans by keyword — returns matching plans with linked_diagnoses
    if (searchQuery) {
      const { data, error } = await supabase
        .from('clinical_plans')
        .select('plan_key, title, icd10_codes, scope')
        .order('title')

      const plansData = error ? getFallbackPlans() : (data || [])
      if (error) {
        console.warn('clinical_plans table query failed, using fallback:', error.message)
      }

      // Search across title, ICD-10 codes, and scope
      const matchingPlans = plansData.filter(plan => {
        const title = (plan.title || '').toLowerCase()
        const scope = (plan.scope || '').toLowerCase()
        const codes = (plan.icd10_codes || []).map((c: string) => c.toLowerCase())

        return title.includes(searchQuery) ||
          scope.includes(searchQuery) ||
          codes.some((c: string) => c.includes(searchQuery))
      })

      // Build linked_diagnoses and diagnosis_scores for each matching plan
      const plans = matchingPlans.map(plan => {
        const linkedDiagnoses: string[] = []
        const diagnosisScores: Record<string, number> = {}
        const planIcd10s = plan.icd10_codes || []
        Object.entries(diagnosisToIcd10Map).forEach(([diagId, diagCodes]) => {
          if (codesMatch(planIcd10s, diagCodes)) {
            linkedDiagnoses.push(diagId)
            diagnosisScores[diagId] = matchScore(planIcd10s, diagCodes)
          }
        })
        return {
          plan_id: plan.plan_key,
          title: plan.title,
          icd10_codes: planIcd10s,
          linked_diagnoses: linkedDiagnoses,
          diagnosis_scores: diagnosisScores,
        }
      })

      return NextResponse.json({ plans })
    }

    // If listing all plans - query the table directly
    if (listAll) {
      const { data, error } = await supabase
        .from('clinical_plans')
        .select('plan_key, title, icd10_codes')
        .order('title')

      // Fallback to hardcoded data if Supabase query fails
      const plansData = error ? getFallbackPlans() : (data || [])
      if (error) {
        console.warn('clinical_plans table query failed, using fallback:', error.message)
      }

      // Transform to include plan_id, linked_diagnoses, and diagnosis_scores
      const plans = plansData.map(plan => {
        const linkedDiagnoses: string[] = []
        const diagnosisScores: Record<string, number> = {}
        const planIcd10s = plan.icd10_codes || []

        Object.entries(diagnosisToIcd10Map).forEach(([diagId, diagCodes]) => {
          if (codesMatch(planIcd10s, diagCodes)) {
            linkedDiagnoses.push(diagId)
            diagnosisScores[diagId] = matchScore(planIcd10s, diagCodes)
          }
        })

        return {
          plan_id: plan.plan_key,
          title: plan.title,
          icd10_codes: planIcd10s,
          linked_diagnoses: linkedDiagnoses,
          diagnosis_scores: diagnosisScores
        }
      })

      return NextResponse.json({ plans })
    }

    // If fetching plan by its plan_key directly
    if (planKey) {
      const { data: planRow, error } = await supabase
        .from('clinical_plans')
        .select('*')
        .eq('plan_key', planKey)
        .single()

      // Fallback to hardcoded data
      let matchedPlan = planRow
      if (error) {
        console.warn('clinical_plans query failed, trying fallback:', error.message)
        const fallback = getFallbackPlans().find(p => p.plan_key === planKey)
        matchedPlan = fallback || null
      }

      if (!matchedPlan) {
        return NextResponse.json({ plan: null, message: 'Plan not found' })
      }

      const transformedPlan = {
        id: matchedPlan.plan_key,
        title: matchedPlan.title,
        icd10: matchedPlan.icd10_codes || [],
        scope: matchedPlan.scope || '',
        notes: matchedPlan.notes || [],
        sections: matchedPlan.sections || {},
        patientInstructions: matchedPlan.patient_instructions || [],
        referrals: matchedPlan.referrals || [],
        differential: matchedPlan.differential || [],
        evidence: matchedPlan.evidence || [],
        monitoring: matchedPlan.monitoring || [],
        disposition: matchedPlan.disposition || [],
        isGeneric: false
      }

      return NextResponse.json({ plan: transformedPlan })
    }

    // If fetching plan for a specific diagnosis
    if (diagnosisId) {
      // Get ALL ICD-10 codes for this diagnosis (primary + alternates)
      const diagnosisCodes = diagnosisToIcd10Map[diagnosisId]

      if (!diagnosisCodes || diagnosisCodes.length === 0) {
        return NextResponse.json({ plan: null, message: 'Diagnosis not found' })
      }

      // Find plans that match any of this diagnosis's ICD-10 codes
      const { data: allPlans, error } = await supabase
        .from('clinical_plans')
        .select('*')
        .order('title')

      // Fallback to hardcoded data if Supabase query fails
      const allPlansData = error ? getFallbackPlans() : (allPlans || [])
      if (error) {
        console.warn('clinical_plans table query failed, using fallback:', error.message)
      }

      // Score all plans and pick the best match (exact ICD-10 match >> prefix match)
      let bestPlan: (typeof allPlansData)[number] | null = null
      let bestScore = 0
      for (const plan of allPlansData) {
        const planIcd10s = plan.icd10_codes || []
        const score = matchScore(planIcd10s, diagnosisCodes)
        if (score > bestScore) {
          bestScore = score
          bestPlan = plan
        }
      }
      const matchingPlan = bestPlan

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

    // Fallback to hardcoded data if Supabase query fails
    const allData = error ? getFallbackPlans() : (data || [])
    if (error) {
      console.warn('clinical_plans table query failed, using fallback:', error.message)
    }

    // Transform to match expected interface
    const transformedPlans = allData.map(plan => ({
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
