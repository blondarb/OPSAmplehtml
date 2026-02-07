#!/usr/bin/env npx ts-node
/**
 * Audio Fixtures Test Runner
 *
 * Tests pre-recorded audio files against the transcription API
 * to validate expected outputs.
 *
 * Usage:
 *   npx ts-node scripts/test-audio-fixtures.ts [fixture-name]
 *
 * Examples:
 *   npx ts-node scripts/test-audio-fixtures.ts                    # Run all tests
 *   npx ts-node scripts/test-audio-fixtures.ts simple-sentence    # Run specific test
 *   npx ts-node scripts/test-audio-fixtures.ts --chart-prep       # Test Chart Prep flow
 */

import * as fs from 'fs'
import * as path from 'path'

const FIXTURES_DIR = path.join(__dirname, '../qa/fixtures')
const AUDIO_DIR = path.join(FIXTURES_DIR, 'audio')
const EXPECTED_DIR = path.join(FIXTURES_DIR, 'expected-outputs')

// Base URL for API - use preview URL or localhost
const API_BASE = process.env.API_BASE || 'http://localhost:3000'

interface ExpectedOutput {
  fixture: string
  expectedText: string
  rawText?: string
  allowedVariations?: string[]
  requiredTerms?: string[]
  expectedSections?: Record<string, any>
  audioFormat: string
  duration_seconds: number
  testCases: string[]
  notes?: string
}

interface TestResult {
  fixture: string
  passed: boolean
  actualText?: string
  expectedText?: string
  matchType?: 'exact' | 'variation' | 'partial' | 'terms'
  error?: string
  duration_ms?: number
}

async function loadExpectedOutput(fixtureName: string): Promise<ExpectedOutput | null> {
  const jsonPath = path.join(EXPECTED_DIR, `${fixtureName}.json`)
  if (!fs.existsSync(jsonPath)) {
    console.warn(`No expected output file for ${fixtureName}`)
    return null
  }
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
}

async function transcribeAudio(audioPath: string): Promise<{ text: string; rawText: string } | { error: string }> {
  const audioBuffer = fs.readFileSync(audioPath)
  const fileName = path.basename(audioPath)
  const mimeType = fileName.endsWith('.m4a') ? 'audio/mp4' :
                   fileName.endsWith('.wav') ? 'audio/wav' :
                   fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/mp4'

  const formData = new FormData()
  const blob = new Blob([audioBuffer], { type: mimeType })
  formData.append('audio', blob, fileName)

  try {
    const response = await fetch(`${API_BASE}/api/ai/transcribe`, {
      method: 'POST',
      body: formData,
    })

    const data = await response.json()

    if (data.error) {
      return { error: data.error }
    }

    return { text: data.text, rawText: data.rawText || data.text }
  } catch (err: any) {
    return { error: err.message }
  }
}

function checkMatch(actual: string, expected: ExpectedOutput): { passed: boolean; matchType: string } {
  const normalizedActual = actual.toLowerCase().trim()
  const normalizedExpected = expected.expectedText.toLowerCase().trim()

  // Exact match
  if (normalizedActual === normalizedExpected) {
    return { passed: true, matchType: 'exact' }
  }

  // Check allowed variations
  if (expected.allowedVariations) {
    for (const variation of expected.allowedVariations) {
      if (normalizedActual === variation.toLowerCase().trim()) {
        return { passed: true, matchType: 'variation' }
      }
      // Partial match - actual contains variation or vice versa
      if (normalizedActual.includes(variation.toLowerCase()) ||
          variation.toLowerCase().includes(normalizedActual)) {
        return { passed: true, matchType: 'partial' }
      }
    }
  }

  // Check required terms (all must be present)
  if (expected.requiredTerms) {
    const allTermsPresent = expected.requiredTerms.every(term =>
      normalizedActual.includes(term.toLowerCase())
    )
    if (allTermsPresent) {
      return { passed: true, matchType: 'terms' }
    }
  }

  // Fuzzy match - check if most words are present
  const expectedWords = normalizedExpected.split(/\s+/)
  const actualWords = normalizedActual.split(/\s+/)
  const matchingWords = expectedWords.filter(word =>
    actualWords.some(aw => aw.includes(word) || word.includes(aw))
  )
  const matchRatio = matchingWords.length / expectedWords.length

  if (matchRatio > 0.8) {
    return { passed: true, matchType: 'partial' }
  }

  return { passed: false, matchType: 'none' }
}

async function runTest(fixtureName: string): Promise<TestResult> {
  const audioFiles = fs.readdirSync(AUDIO_DIR)
  const audioFile = audioFiles.find(f => f.startsWith(fixtureName))

  if (!audioFile) {
    return {
      fixture: fixtureName,
      passed: false,
      error: `Audio file not found for ${fixtureName}`
    }
  }

  const expected = await loadExpectedOutput(fixtureName)
  if (!expected) {
    return {
      fixture: fixtureName,
      passed: false,
      error: `Expected output not found for ${fixtureName}`
    }
  }

  const audioPath = path.join(AUDIO_DIR, audioFile)
  const startTime = Date.now()

  console.log(`  Testing ${fixtureName}...`)

  const result = await transcribeAudio(audioPath)
  const duration_ms = Date.now() - startTime

  if ('error' in result) {
    return {
      fixture: fixtureName,
      passed: false,
      error: result.error,
      duration_ms
    }
  }

  const { passed, matchType } = checkMatch(result.text, expected)

  return {
    fixture: fixtureName,
    passed,
    actualText: result.text,
    expectedText: expected.expectedText,
    matchType,
    duration_ms
  }
}

async function runAllTests(): Promise<void> {
  console.log('\n🎤 Audio Fixtures Test Runner\n')
  console.log(`API Base: ${API_BASE}`)
  console.log(`Audio Dir: ${AUDIO_DIR}\n`)

  const audioFiles = fs.readdirSync(AUDIO_DIR)
    .filter(f => f.endsWith('.m4a') || f.endsWith('.wav') || f.endsWith('.mp3'))

  console.log(`Found ${audioFiles.length} audio fixtures\n`)

  const results: TestResult[] = []

  for (const audioFile of audioFiles) {
    const fixtureName = path.parse(audioFile).name
    const result = await runTest(fixtureName)
    results.push(result)
  }

  // Print results
  console.log('\n📊 Results:\n')

  const passed = results.filter(r => r.passed)
  const failed = results.filter(r => !r.passed)

  for (const result of results) {
    const icon = result.passed ? '✅' : '❌'
    const matchInfo = result.matchType ? ` (${result.matchType})` : ''
    const timeInfo = result.duration_ms ? ` [${result.duration_ms}ms]` : ''

    console.log(`${icon} ${result.fixture}${matchInfo}${timeInfo}`)

    if (!result.passed) {
      if (result.error) {
        console.log(`   Error: ${result.error}`)
      } else {
        console.log(`   Expected: ${result.expectedText?.substring(0, 60)}...`)
        console.log(`   Actual:   ${result.actualText?.substring(0, 60)}...`)
      }
    }
  }

  console.log(`\n📈 Summary: ${passed.length}/${results.length} passed\n`)

  if (failed.length > 0) {
    process.exit(1)
  }
}

// Run specific fixture or all
const targetFixture = process.argv[2]

if (targetFixture && !targetFixture.startsWith('--')) {
  runTest(targetFixture).then(result => {
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.passed ? 0 : 1)
  })
} else {
  runAllTests()
}
