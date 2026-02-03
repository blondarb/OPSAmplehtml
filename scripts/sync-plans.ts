/**
 * sync-plans.ts
 *
 * Syncs clinical plans from the neuro-plans GitHub repository to Supabase.
 * Reads individual JSON files from docs/plans/ and docs/drafts/ (preferring
 * plans/ over drafts/ for duplicates). Transforms to OPD-only format for
 * outpatient use.
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
import * as fs from 'fs'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'

// ============================================
// CONFIGURATION
// ============================================

const GITHUB_TREE_URL = 'https://api.github.com/repos/blondarb/neuro-plans/git/trees/main?recursive=1'
const RAW_BASE_URL = 'https://raw.githubusercontent.com/blondarb/neuro-plans/main'
const OVERRIDES_PATH = path.resolve(__dirname, 'plan-overrides.json')
const CONCURRENCY = 8 // parallel fetches

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

// Matches the Supabase clinical_plans table schema exactly
interface SupabaseRow {
  plan_key: string
  title: string
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

interface GitHubTreeItem {
  path: string
  type: string
}

interface PlanFileInfo {
  slug: string       // e.g. "migraine"
  path: string       // e.g. "docs/plans/migraine.json"
  location: 'plans' | 'drafts'
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
    .map(code => code.replace(/^\*+\s*/, '').trim())   // strip leading ** markdown
    .map(code => {
      const match = code.match(/([A-Z]\d{2}(\.\d+)?)/) // extract ICD-10 anywhere in string
      return match ? match[1] : ''
    })
    .filter(code => code.length > 0)
    .filter((code, index, self) => self.indexOf(code) === index)
}

function transformPlan(sourcePlan: SourcePlan): SupabaseRow | null {
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
    return null
  }

  return {
    plan_key: sourcePlan.id,
    title: sourcePlan.title,
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
  }
}

// ============================================
// FETCH HELPERS
// ============================================

async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url)
    if (response.ok) return response
    if (response.status === 429 || response.status >= 500) {
      const delay = Math.pow(2, attempt) * 500
      console.log(`    ⏳ Retry ${attempt + 1} for ${url.split('/').pop()} in ${delay}ms...`)
      await new Promise(r => setTimeout(r, delay))
      continue
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`)
  }
  throw new Error(`Failed after ${retries + 1} attempts: ${url}`)
}

async function fetchInBatches<T>(
  items: T[],
  fn: (item: T) => Promise<unknown>,
  batchSize: number
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    await Promise.all(batch.map(fn))
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

  // -----------------------------------------------
  // Step 1: Get existing plans from Supabase
  // -----------------------------------------------
  console.log('📊 Fetching existing plans from Supabase...')
  const { data: existingPlans, error: existingError } = await supabase
    .from('clinical_plans')
    .select('plan_key, title')
    .order('plan_key')

  const existingKeys = new Set<string>()
  if (!existingError && existingPlans) {
    existingPlans.forEach(p => existingKeys.add(p.plan_key))
    console.log(`   Found ${existingKeys.size} existing plans\n`)
  } else {
    console.warn(`   ⚠ Could not fetch existing plans: ${existingError?.message}\n`)
  }

  // -----------------------------------------------
  // Step 2: Discover JSON files in the GitHub repo
  // -----------------------------------------------
  console.log('📥 Discovering plan files from GitHub...')
  console.log(`   ${GITHUB_TREE_URL}\n`)

  let tree: GitHubTreeItem[]
  try {
    const response = await fetchWithRetry(GITHUB_TREE_URL)
    const data = await response.json() as { tree: GitHubTreeItem[] }
    tree = data.tree
  } catch (error) {
    console.error(`❌ Failed to fetch repo tree: ${error}`)
    process.exit(1)
  }

  // Collect JSON files from plans/ and drafts/
  const planFiles = new Map<string, PlanFileInfo>() // slug -> info (plans/ preferred)

  for (const item of tree) {
    if (item.type !== 'blob' || !item.path.endsWith('.json')) continue

    let location: 'plans' | 'drafts' | null = null
    if (item.path.startsWith('docs/plans/')) location = 'plans'
    else if (item.path.startsWith('docs/drafts/')) location = 'drafts'
    else continue

    const slug = item.path.split('/').pop()!.replace('.json', '')
    const existing = planFiles.get(slug)

    // Prefer plans/ over drafts/
    if (!existing || (existing.location === 'drafts' && location === 'plans')) {
      planFiles.set(slug, { slug, path: item.path, location })
    }
  }

  const fileList = Array.from(planFiles.values())
  const fromPlans = fileList.filter(f => f.location === 'plans').length
  const fromDrafts = fileList.filter(f => f.location === 'drafts').length
  console.log(`   Found ${fileList.length} unique plan files (${fromPlans} from plans/, ${fromDrafts} from drafts/)\n`)

  // -----------------------------------------------
  // Step 3: Fetch and transform each plan file
  // -----------------------------------------------
  console.log('🔧 Fetching and transforming plans...\n')

  const transformedPlans: SupabaseRow[] = []
  const skippedNoOpd: string[] = []
  const fetchErrors: string[] = []

  await fetchInBatches(fileList, async (fileInfo) => {
    const url = `${RAW_BASE_URL}/${fileInfo.path}`
    try {
      const response = await fetchWithRetry(url)
      const sourcePlan = await response.json() as SourcePlan
      const transformed = transformPlan(sourcePlan)

      if (transformed) {
        transformedPlans.push(transformed)
        let totalItems = 0
        for (const section of Object.values(transformed.sections)) {
          for (const items of Object.values(section)) {
            totalItems += items.length
          }
        }
        const isNew = !existingKeys.has(transformed.plan_key)
        const tag = isNew ? '🆕' : '✓'
        console.log(`  ${tag} ${transformed.title} (${totalItems} OPD items, ${transformed.icd10_codes.length} ICD-10) [${fileInfo.location}]`)
      } else {
        skippedNoOpd.push(fileInfo.slug)
      }
    } catch (error) {
      fetchErrors.push(`${fileInfo.slug}: ${error}`)
      console.error(`  ✗ ${fileInfo.slug}: ${error}`)
    }
  }, CONCURRENCY)

  console.log(`\n📊 Transform summary:`)
  console.log(`   ✓ ${transformedPlans.length} plans with OPD content`)
  if (skippedNoOpd.length > 0) {
    console.log(`   ⚠ ${skippedNoOpd.length} skipped (no OPD items): ${skippedNoOpd.join(', ')}`)
  }
  if (fetchErrors.length > 0) {
    console.log(`   ✗ ${fetchErrors.length} fetch errors`)
  }

  if (transformedPlans.length === 0) {
    console.log('\n⚠ No plans to sync. Exiting.')
    process.exit(0)
  }

  // -----------------------------------------------
  // Step 4: Apply local overrides
  // -----------------------------------------------
  if (fs.existsSync(OVERRIDES_PATH)) {
    try {
      const raw = fs.readFileSync(OVERRIDES_PATH, 'utf-8')
      const overrides: Record<string, Record<string, unknown>> = JSON.parse(raw)
      let overrideCount = 0
      for (const plan of transformedPlans) {
        const override = overrides[plan.plan_key]
        if (override && typeof override === 'object' && !('_comment' in override && Object.keys(override).length === 1)) {
          const { _comment, ...fields } = override as Record<string, unknown>
          Object.assign(plan, fields)
          overrideCount++
          console.log(`\n  🔧 Override applied: ${plan.plan_key}`)
        }
      }
      if (overrideCount > 0) {
        console.log(`\n📝 ${overrideCount} override(s) applied from plan-overrides.json`)
      }
    } catch (err) {
      console.warn(`\n⚠ Could not load overrides: ${err}`)
    }
  }

  // -----------------------------------------------
  // Step 5: Upsert to Supabase
  // -----------------------------------------------
  console.log('\n💾 Upserting to Supabase...\n')

  // Sort for consistent output
  transformedPlans.sort((a, b) => a.plan_key.localeCompare(b.plan_key))

  const { error } = await supabase
    .from('clinical_plans')
    .upsert(transformedPlans, { onConflict: 'plan_key' })

  if (error) {
    console.error(`❌ Supabase error: ${error.message}`)
    console.error(error)
    process.exit(1)
  }

  // -----------------------------------------------
  // Step 6: Report
  // -----------------------------------------------
  const newPlans = transformedPlans.filter(p => !existingKeys.has(p.plan_key))
  const updatedPlans = transformedPlans.filter(p => existingKeys.has(p.plan_key))

  console.log(`✅ Sync complete!`)
  console.log(`   ${transformedPlans.length} total plans synced`)
  console.log(`   🆕 ${newPlans.length} new plans added`)
  console.log(`   🔄 ${updatedPlans.length} existing plans updated`)

  if (newPlans.length > 0) {
    console.log(`\n   New plans:`)
    newPlans.forEach(p => console.log(`     + ${p.title} (${p.plan_key})`))
  }

  // Verify final count
  const { count } = await supabase
    .from('clinical_plans')
    .select('*', { count: 'exact', head: true })

  console.log(`\n📊 Total plans in Supabase: ${count}`)
  console.log('\n🎉 Done!\n')
}

syncPlans().catch(error => {
  console.error('❌ Unexpected error:', error)
  process.exit(1)
})
