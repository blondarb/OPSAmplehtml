/**
 * Synthetic Audio Pipeline Test
 *
 * End-to-end test that:
 * 1. Authenticates with Supabase
 * 2. Uploads chart prep audio → transcribe API → chart-prep API
 * 3. Uploads visit audio → visit-ai API (transcription + clinical extraction)
 * 4. Validates outputs at each step
 *
 * Prerequisites:
 * - Generated audio files in tests/audio/generated/ (run generate-visit-audio.sh first)
 * - Dev server running on localhost:3000 (npm run dev)
 * - .env.local with valid Supabase and OpenAI credentials
 *
 * Usage:
 *   npx tsx tests/audio/run-pipeline-test.ts
 *
 * Environment variables (or will read from .env.local):
 *   TEST_EMAIL - Supabase user email (default: demo@sevaro.health)
 *   TEST_PASSWORD - Supabase user password
 *   BASE_URL - API base URL (default: http://localhost:3000)
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load env
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const TEST_EMAIL = process.env.TEST_EMAIL || 'demo@sevaro.health'
const TEST_PASSWORD = process.env.TEST_PASSWORD || ''

const AUDIO_DIR = path.resolve(__dirname, 'generated')
const CHART_PREP_AUDIO = path.join(AUDIO_DIR, 'chart-prep-migraine.aiff')
const VISIT_AUDIO = path.join(AUDIO_DIR, 'visit-migraine.aiff')

// Colors for terminal output
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'

function log(msg: string) { console.log(msg) }
function pass(msg: string) { console.log(`${GREEN}  ✓ ${msg}${RESET}`) }
function fail(msg: string) { console.log(`${RED}  ✗ ${msg}${RESET}`) }
function warn(msg: string) { console.log(`${YELLOW}  ⚠ ${msg}${RESET}`) }
function section(msg: string) { console.log(`\n${BOLD}${CYAN}━━━ ${msg} ━━━${RESET}`) }
function detail(msg: string) { console.log(`${DIM}    ${msg}${RESET}`) }

interface TestResult {
  name: string
  passed: boolean
  duration: number
  details?: string
  error?: string
}

const results: TestResult[] = []

async function authenticate(): Promise<string> {
  section('Authentication')

  if (!TEST_PASSWORD) {
    fail('TEST_PASSWORD environment variable not set')
    log(`\n  Set it with: TEST_PASSWORD=yourpassword npx tsx tests/audio/run-pipeline-test.ts`)
    log(`  Or add TEST_PASSWORD to .env.local`)
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  })

  if (error || !data.session) {
    fail(`Authentication failed: ${error?.message || 'No session returned'}`)
    process.exit(1)
  }

  pass(`Authenticated as ${TEST_EMAIL}`)
  detail(`Access token: ${data.session.access_token.substring(0, 20)}...`)

  return data.session.access_token
}

function buildCookie(accessToken: string): string {
  // Supabase SSR expects the session in specific cookie format
  // The Next.js middleware reads sb-<ref>-auth-token cookie
  const ref = SUPABASE_URL.match(/https:\/\/(.+?)\.supabase\.co/)?.[1] || 'unknown'
  return `sb-${ref}-auth-token=${accessToken}`
}

async function testTranscribeAPI(accessToken: string): Promise<string> {
  section('Step 1: Transcribe Chart Prep Audio')

  const start = Date.now()

  if (!fs.existsSync(CHART_PREP_AUDIO)) {
    const msg = `Audio file not found: ${CHART_PREP_AUDIO}`
    fail(msg)
    results.push({ name: 'Transcribe Chart Prep', passed: false, duration: 0, error: msg })
    return ''
  }

  const audioBuffer = fs.readFileSync(CHART_PREP_AUDIO)
  detail(`Audio file: ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB`)

  const formData = new FormData()
  const blob = new Blob([audioBuffer], { type: 'audio/aiff' })
  formData.append('audio', blob, 'chart-prep-migraine.aiff')

  try {
    const response = await fetch(`${BASE_URL}/api/ai/transcribe`, {
      method: 'POST',
      headers: {
        'Cookie': buildCookie(accessToken),
        'Authorization': `Bearer ${accessToken}`,
      },
      body: formData,
    })

    const duration = Date.now() - start
    const data = await response.json()

    if (!response.ok) {
      const msg = `HTTP ${response.status}: ${data.error || 'Unknown error'}`
      fail(msg)
      results.push({ name: 'Transcribe Chart Prep', passed: false, duration, error: msg })
      return ''
    }

    if (!data.text || data.text.length < 50) {
      const msg = `Transcription too short: "${data.text?.substring(0, 100)}"`
      fail(msg)
      results.push({ name: 'Transcribe Chart Prep', passed: false, duration, error: msg })
      return data.text || ''
    }

    pass(`Transcription succeeded (${duration}ms, ${data.text.length} chars)`)
    detail(`First 200 chars: "${data.text.substring(0, 200)}..."`)

    // Validate key medical terms survived transcription
    const keyTerms = ['migraine', 'sumatriptan', 'MRI']
    const foundTerms = keyTerms.filter(t => data.text.toLowerCase().includes(t.toLowerCase()))
    const missingTerms = keyTerms.filter(t => !data.text.toLowerCase().includes(t.toLowerCase()))

    if (foundTerms.length === keyTerms.length) {
      pass(`All key medical terms found: ${foundTerms.join(', ')}`)
    } else {
      warn(`Missing terms: ${missingTerms.join(', ')} (found: ${foundTerms.join(', ')})`)
    }

    results.push({
      name: 'Transcribe Chart Prep',
      passed: true,
      duration,
      details: `${data.text.length} chars, ${foundTerms.length}/${keyTerms.length} key terms`,
    })

    return data.text
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    fail(`Network error: ${msg}`)
    results.push({ name: 'Transcribe Chart Prep', passed: false, duration: Date.now() - start, error: msg })
    return ''
  }
}

async function testChartPrepAPI(accessToken: string, transcription: string): Promise<Record<string, unknown>> {
  section('Step 2: Chart Prep AI Summary')

  const start = Date.now()

  if (!transcription) {
    warn('Skipping — no transcription from previous step')
    results.push({ name: 'Chart Prep Summary', passed: false, duration: 0, error: 'No transcription input' })
    return {}
  }

  try {
    const response = await fetch(`${BASE_URL}/api/ai/chart-prep`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': buildCookie(accessToken),
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        transcription,
        patientContext: {
          name: 'Sarah Chen',
          age: 33,
          gender: 'Female',
        },
      }),
    })

    const duration = Date.now() - start
    const data = await response.json()

    if (!response.ok) {
      const msg = `HTTP ${response.status}: ${data.error || 'Unknown error'}`
      fail(msg)
      results.push({ name: 'Chart Prep Summary', passed: false, duration, error: msg })
      return {}
    }

    // Validate the response has expected sections
    const sections = data.sections || data
    const hasSummary = !!(sections.summary || sections.patientSummary)
    const hasAlerts = !!(sections.alerts || sections.keyConsiderations)

    if (hasSummary) {
      pass(`Summary generated (${duration}ms)`)
      const summaryText = sections.summary || sections.patientSummary || ''
      detail(`Summary: "${String(summaryText).substring(0, 150)}..."`)
    } else {
      warn('No summary field in response')
    }

    if (hasAlerts) {
      pass('Alerts/key considerations generated')
      const alertsText = sections.alerts || sections.keyConsiderations || ''
      detail(`Alerts: "${String(alertsText).substring(0, 150)}..."`)
    } else {
      warn('No alerts field in response')
    }

    // Check for suggested fields
    const suggestedFields = ['suggestedHPI', 'suggestedAssessment', 'suggestedPlan']
    const foundSuggestions = suggestedFields.filter(f => sections[f])
    if (foundSuggestions.length > 0) {
      pass(`Found ${foundSuggestions.length} suggested fields: ${foundSuggestions.join(', ')}`)
    }

    results.push({
      name: 'Chart Prep Summary',
      passed: hasSummary,
      duration,
      details: `summary: ${hasSummary}, alerts: ${hasAlerts}, suggestions: ${foundSuggestions.length}`,
    })

    return sections
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    fail(`Network error: ${msg}`)
    results.push({ name: 'Chart Prep Summary', passed: false, duration: Date.now() - start, error: msg })
    return {}
  }
}

async function testVisitAIAPI(accessToken: string): Promise<Record<string, unknown>> {
  section('Step 3: Visit AI — Transcription + Clinical Extraction')

  const start = Date.now()

  if (!fs.existsSync(VISIT_AUDIO)) {
    const msg = `Audio file not found: ${VISIT_AUDIO}`
    fail(msg)
    results.push({ name: 'Visit AI Pipeline', passed: false, duration: 0, error: msg })
    return {}
  }

  const audioBuffer = fs.readFileSync(VISIT_AUDIO)
  detail(`Audio file: ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB`)

  const formData = new FormData()
  const blob = new Blob([audioBuffer], { type: 'audio/aiff' })
  formData.append('audio', blob, 'visit-migraine.aiff')

  try {
    const response = await fetch(`${BASE_URL}/api/ai/visit-ai`, {
      method: 'POST',
      headers: {
        'Cookie': buildCookie(accessToken),
        'Authorization': `Bearer ${accessToken}`,
      },
      body: formData,
    })

    const duration = Date.now() - start
    const data = await response.json()

    if (!response.ok) {
      const msg = `HTTP ${response.status}: ${data.error || 'Unknown error'}`
      fail(msg)
      results.push({ name: 'Visit AI Pipeline', passed: false, duration, error: msg })
      return {}
    }

    pass(`Visit AI completed (${duration}ms)`)

    // Check for clinical extraction fields
    const clinicalFields = ['hpiFromVisit', 'rosFromVisit', 'examFromVisit', 'assessmentFromVisit', 'planFromVisit']
    const foundFields = clinicalFields.filter(f => data[f])
    const missingFields = clinicalFields.filter(f => !data[f])

    if (foundFields.length > 0) {
      pass(`Clinical extraction: ${foundFields.length}/${clinicalFields.length} fields populated`)
      for (const field of foundFields) {
        detail(`${field}: "${String(data[field]).substring(0, 100)}..."`)
      }
    }

    if (missingFields.length > 0) {
      warn(`Missing fields: ${missingFields.join(', ')}`)
    }

    // Check transcript segments (diarization)
    if (data.transcriptSegments && Array.isArray(data.transcriptSegments)) {
      const speakers = new Set(data.transcriptSegments.map((s: { speaker: string }) => s.speaker))
      pass(`Diarization: ${data.transcriptSegments.length} segments, ${speakers.size} speakers (${[...speakers].join(', ')})`)
    } else if (data.transcript) {
      pass(`Raw transcript: ${String(data.transcript).length} chars`)
      detail(`First 200: "${String(data.transcript).substring(0, 200)}..."`)
    }

    // Validate clinical content quality
    const clinicalKeywords = ['migraine', 'sumatriptan', 'erenumab', 'headache']
    const allContent = clinicalFields.map(f => String(data[f] || '')).join(' ').toLowerCase()
    const foundKeywords = clinicalKeywords.filter(k => allContent.includes(k))

    if (foundKeywords.length >= 2) {
      pass(`Clinical content quality: ${foundKeywords.length}/${clinicalKeywords.length} key terms (${foundKeywords.join(', ')})`)
    } else {
      warn(`Low clinical content quality: only ${foundKeywords.length} key terms found`)
    }

    results.push({
      name: 'Visit AI Pipeline',
      passed: foundFields.length >= 3,
      duration,
      details: `${foundFields.length}/${clinicalFields.length} fields, ${foundKeywords.length} key terms`,
    })

    return data
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    fail(`Network error: ${msg}`)
    results.push({ name: 'Visit AI Pipeline', passed: false, duration: Date.now() - start, error: msg })
    return {}
  }
}

function printSummary() {
  section('Test Summary')

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)

  for (const r of results) {
    const icon = r.passed ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`
    const time = r.duration > 0 ? ` (${(r.duration / 1000).toFixed(1)}s)` : ''
    const info = r.details || r.error || ''
    console.log(`  ${icon} ${r.name}${time} ${DIM}${info}${RESET}`)
  }

  console.log()
  const color = failed === 0 ? GREEN : RED
  console.log(`${color}${BOLD}  ${passed} passed, ${failed} failed${RESET} ${DIM}(${(totalDuration / 1000).toFixed(1)}s total)${RESET}`)
  console.log()
}

async function main() {
  console.log(`\n${BOLD}Synthetic Audio Pipeline Test${RESET}`)
  console.log(`${DIM}Target: ${BASE_URL}${RESET}`)
  console.log(`${DIM}Audio dir: ${AUDIO_DIR}${RESET}`)

  // Check audio files exist
  if (!fs.existsSync(CHART_PREP_AUDIO)) {
    fail(`Chart prep audio not found. Run: bash tests/audio/scripts/generate-visit-audio.sh`)
    process.exit(1)
  }
  if (!fs.existsSync(VISIT_AUDIO)) {
    fail(`Visit audio not found. Run: bash tests/audio/scripts/generate-visit-audio.sh`)
    process.exit(1)
  }

  // Authenticate
  const accessToken = await authenticate()

  // Run pipeline tests
  const transcription = await testTranscribeAPI(accessToken)
  await testChartPrepAPI(accessToken, transcription)
  await testVisitAIAPI(accessToken)

  // Print summary
  printSummary()

  // Exit with appropriate code
  const failed = results.filter(r => !r.passed).length
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
