/**
 * sync-plans.ts
 *
 * Syncs clinical plans from neuro-plans GitHub repository to Supabase.
 * Transforms plans to OPD-only format for outpatient use.
 *
 * Usage:
 *   npm run sync-plans
 *
 * Environment variables required (loaded from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (not anon key - needs insert permissions)
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'

// ============================================
// CONFIGURATION
// ============================================

const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/blondarb/neuro-plans/main/docs/data/plans.json'
const GITHUB_REPO_URL = 'https://github.com/blondarb/neuro-plans'

// ============================================
// TYPES
// ============================================

interface SourceDosingObject {
  doseOptions?: Array<{ text: string; orderSentence: string }>
  route?: string
  instructions?: string
  orderSentence?: string
}

interface SourceRecommendationItem {
  item: string
  rationale?: string
  dosing?: string | SourceDosingObject
  timing?: string
  target?: string
  indication?: string
  contraindications?: string
  monitoring?: string
  ED?: string
  HOSP?: string
  OPD?: string
  ICU?: string
}

interface SourcePlan {
  id: string
  title: string
  version?: string
  icd10: string[]
  scope: string
  notes: string[]
  sections: Record<string, Record<string, SourceRecommendationItem[]>>
  patientInstructions?: string[]
  referrals?: string[]
  differential?: Array<{ diagnosis: string; features: string; tests: string }>
  evidence?: Array<{ recommendation: string; evidenceLevel?: string; level?: string; source: string }>
  monitoring?: Array<{ item: string; frequency: string; action: string }>
  disposition?: Array<{ disposition: string; criteria: string }>
}

interface SourcePlansData {
  [key: string]: SourcePlan
}

interface TargetRecommendationItem {
  item: string
  rationale?: string
  dosing?: string
  timing?: string
  target?: string
  indication?: string
  contraindications?: string
  monitoring?: string
  priority: 'STAT' | 'URGENT' | 'ROUTINE' | 'EXT' | '—'
}

interface TargetPlan {
  plan_key: string
  title: string
  version: string
  icd10_codes: string[]
  scope: string
  notes: string[]
  sections: Record<string, Record<string, TargetRecommendationItem[]>>
  patient_instructions: string[]
  referrals: string[]
  differential: Array<{ diagnosis: string; features: string; tests: string }>
  evidence: Array<{ recommendation: string; evidenceLevel: string; source: string }>
  monitoring: Array<{ item: string; frequency: string; action: string }>
  disposition: Array<{ disposition: string; criteria: string }>
  source_url: string
  synced_at: string
}

// ============================================
// TRANSFORM FUNCTIONS
// ============================================

function flattenDosing(dosing: string | SourceDosingObject | undefined): string | undefined {
  if (!dosing) return undefined
  if (typeof dosing === 'string') return dosing
  if (dosing.orderSentence) return dosing.orderSentence
  if (dosing.instructions) return dosing.instructions
  if (dosing.doseOptions && dosing.doseOptions.length > 0) {
    return dosing.doseOptions[0].orderSentence || dosing.doseOptions[0].text
  }
  return undefined
}

function cleanIcd10Codes(codes: string[]): string[] {
  return codes
    .map(code => code.trim())
    .filter(code => /^[A-Z]\d{2}/.test(code))
    .map(code => {
      const match = code.match(/^([A-Z]\d{2}(\.\d+)?)/)
      return match ? match[1] : code
    })
    .filter((code, index, self) => self.indexOf(code) === index)
}

function transformPlan(sourcePlan: SourcePlan): TargetPlan | null {
  const transformedSections: Record<string, Record<string, TargetRecommendationItem[]>> = {}
  let hasOpdItems = false

  for (const [sectionName, subsections] of Object.entries(sourcePlan.sections)) {
    transformedSections[sectionName] = {}
    for (const [subsectionName, items] of Object.entries(subsections)) {
      const opdItems = items
        .filter(item => item.OPD && item.OPD !== '—')
        .map(item => ({
          item: item.item,
          rationale: item.rationale,
          dosing: flattenDosing(item.dosing),
          timing: item.timing,
          target: item.target,
          indication: item.indication,
          contraindications: item.contraindications,
          monitoring: item.monitoring,
          priority: item.OPD as 'STAT' | 'URGENT' | 'ROUTINE' | 'EXT',
        }))
      if (opdItems.length > 0) {
        transformedSections[sectionName][subsectionName] = opdItems
        hasOpdItems = true
      }
    }
    if (Object.keys(transformedSections[sectionName]).length === 0) {
      delete transformedSections[sectionName]
    }
  }

  if (!hasOpdItems) {
    console.log(`  ⚠ Skipping "${sourcePlan.title}" - no OPD items`)
    return null
  }

  return {
    plan_key: sourcePlan.id,
    title: sourcePlan.title,
    version: sourcePlan.version || '1.0',
    icd10_codes: cleanIcd10Codes(sourcePlan.icd10),
    scope: sourcePlan.scope || '',
    notes: sourcePlan.notes || [],
    sections: transformedSections,
    patient_instructions: sourcePlan.patientInstructions || [],
    referrals: sourcePlan.referrals || [],
    differential: sourcePlan.differential || [],
    evidence: (sourcePlan.evidence || []).map(e => ({
      recommendation: e.recommendation,
      evidenceLevel: e.evidenceLevel || e.level || 'N/A',
      source: e.source,
    })),
    monitoring: sourcePlan.monitoring || [],
    disposition: sourcePlan.disposition || [],
    source_url: `${GITHUB_REPO_URL}/blob/main/docs/plans/${sourcePlan.id}.md`,
    synced_at: new Date().toISOString(),
  }
}

// ============================================
// MAIN SYNC FUNCTION
// ============================================

async function syncPlans() {
  console.log('🔄 Starting clinical plans sync...\n')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing environment variables:')
    if (!supabaseUrl) console.error('   - NEXT_PUBLIC_SUPABASE_URL')
    if (!supabaseServiceKey) console.error('   - SUPABASE_SERVICE_ROLE_KEY')
    console.error('\nNote: Use SUPABASE_SERVICE_ROLE_KEY (not anon key) for write access.')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  })

  console.log(`📥 Fetching plans from GitHub...`)
  console.log(`   ${GITHUB_RAW_URL}\n`)

  let sourcePlans: SourcePlansData
  try {
    const response = await fetch(GITHUB_RAW_URL)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    sourcePlans = await response.json() as SourcePlansData
  } catch (error) {
    console.error(`❌ Failed to fetch plans: ${error}`)
    process.exit(1)
  }

  const planTitles = Object.keys(sourcePlans)
  console.log(`📋 Found ${planTitles.length} plans in source:\n`)
  planTitles.forEach(title => console.log(`   - ${title}`))
  console.log()

  console.log('🔧 Transforming to OPD-only format...\n')
  const transformedPlans: TargetPlan[] = []

  for (const [title, plan] of Object.entries(sourcePlans)) {
    const transformed = transformPlan(plan)
    if (transformed) {
      transformedPlans.push(transformed)
      let totalItems = 0
      for (const section of Object.values(transformed.sections)) {
        for (const items of Object.values(section)) {
          totalItems += items.length
        }
      }
      console.log(`  ✓ ${title} (${totalItems} OPD items)`)
    }
  }

  console.log(`\n📊 ${transformedPlans.length} plans have OPD content\n`)

  if (transformedPlans.length === 0) {
    console.log('⚠ No plans to sync. Exiting.')
    process.exit(0)
  }

  console.log('💾 Upserting to Supabase...\n')

  const { data, error } = await supabase
    .from('clinical_plans')
    .upsert(
      transformedPlans,
      { onConflict: 'plan_key' }
    )
    .select('plan_key, title')

  if (error) {
    console.error(`❌ Supabase error: ${error.message}`)
    console.error(error)
    process.exit(1)
  }

  console.log(`✅ Successfully synced ${transformedPlans.length} plans:\n`)
  transformedPlans.forEach(plan => {
    console.log(`   ✓ ${plan.title} (${plan.icd10_codes.join(', ')})`)
  })

  console.log('\n🎉 Sync complete!\n')
}

syncPlans().catch(error => {
  console.error('❌ Unexpected error:', error)
  process.exit(1)
})
