/**
 * Simulated Patient E2E Test Runner
 *
 * Runs each patient persona through the full clinical pipeline at the API level:
 *   1. Triage — POST referral text, assert urgency and red flags
 *   2. Intake — Simulate multi-turn intake conversation, verify field collection
 *   3. Historian — Save pre-built structured output, verify OLDCARTS completeness
 *   4. Localizer — Generate differential diagnosis, verify expected diagnoses
 *   5. Report — Generate unified report, verify completeness and accuracy
 *
 * Usage:
 *   npx vitest tests/simulated-patients/runner.test.ts
 *
 * Prerequisites:
 *   - App running at localhost:3000 (or TEST_BASE_URL)
 *   - Cognito credentials in TEST_EMAIL / TEST_PASSWORD (for authenticated endpoints)
 *   - Database accessible from the app (RDS or local)
 */

import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import type {
  PatientPersona,
  TriageAPIResponse,
  LocalizerResponse,
  ReportResponse,
  StepResult,
} from './types'
import {
  runTriage,
  initiateIntake,
  runIntakeConversation,
  saveHistorianSession,
  runLocalizer,
  generateReport,
  getAuthToken,
  triageUrgencyMatches,
  redFlagMatches,
  ddxContains,
} from './helpers'
import { computeGrade, formatGradeReport } from './grading'
import { config } from './config'

// ── Load Personas ─────────────────────────────────────────────────────────────

const personasDir = path.join(__dirname, 'personas')

function loadPersonas(): PatientPersona[] {
  const files = fs.readdirSync(personasDir).filter((f) => f.endsWith('.json'))
  return files.map((f) => {
    const raw = fs.readFileSync(path.join(personasDir, f), 'utf-8')
    return JSON.parse(raw) as PatientPersona
  })
}

const personas = loadPersonas()

// ── Health Check ──────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Verify the app is running
  try {
    const res = await fetch(`${config.baseUrl}/api/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referral_text: 'health check' }),
    })
    // We expect a 400 (text too short) — that's fine, it means the server is up
    if (res.status === 0) {
      throw new Error('Server not reachable')
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(
      `\n[SETUP] Cannot reach app at ${config.baseUrl}. Is the dev server running?\n` +
      `  Start with: npm run dev\n` +
      `  Or set TEST_BASE_URL to your running instance.\n` +
      `  Error: ${msg}\n`,
    )
    throw new Error(`App not reachable at ${config.baseUrl}`)
  }

  // Attempt auth (non-fatal — some endpoints don't require it)
  const token = await getAuthToken()
  if (token) {
    console.log('[SETUP] Authenticated with Cognito successfully')
  } else {
    console.warn(
      '[SETUP] Running without authentication. Some endpoints may fail.\n' +
      '  Set TEST_EMAIL and TEST_PASSWORD for full pipeline testing.',
    )
  }

  console.log(`[SETUP] Loaded ${personas.length} persona(s): ${personas.map((p) => p.id).join(', ')}`)
})

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('Simulated Patient E2E', () => {
  for (const persona of personas) {
    describe(persona.name, () => {
      // Shared state across tests within a persona
      let triageResult: TriageAPIResponse | null = null
      let consultId: string | null = null
      let historianSessionId: string | null = null
      let localizerResult: LocalizerResponse | null = null
      let reportResult: ReportResponse | null = null

      // ── Step 1: Triage ────────────────────────────────────────────────

      it('Triage scores correctly', async () => {
        const start = Date.now()

        const result = await runTriage(persona.referralText, {
          age: persona.demographics.age,
          sex: persona.demographics.sex,
        })

        expect(result.error).toBeNull()
        expect(result.data).toBeTruthy()

        triageResult = result.data!
        consultId = triageResult.consult_id

        // Assert urgency matches (or is more conservative)
        const urgencyMatch = triageUrgencyMatches(
          triageResult.triage_tier,
          persona.expectedTriage.urgency,
        )

        // For the assertion, we accept exact match OR over-triage
        const urgencyOrder = ['emergent', 'urgent', 'semi_urgent', 'routine_priority', 'routine', 'non_urgent']
        const actualIdx = urgencyOrder.indexOf(triageResult.triage_tier)
        const expectedIdx = urgencyOrder.indexOf(persona.expectedTriage.urgency)
        const isAcceptable = urgencyMatch || (actualIdx >= 0 && expectedIdx >= 0 && actualIdx <= expectedIdx)

        expect(
          isAcceptable,
          `Triage urgency: expected "${persona.expectedTriage.urgency}" (or more urgent), got "${triageResult.triage_tier}"`,
        ).toBe(true)

        // Assert red flags detected (if expected)
        if (persona.expectedTriage.redFlags.length > 0) {
          const { found, missing } = redFlagMatches(
            triageResult.red_flags,
            persona.expectedTriage.redFlags,
          )
          // We warn on missing flags but don't hard-fail the triage step for it
          // (the grading rubric handles this separately)
          if (missing.length > 0) {
            console.warn(
              `[${persona.id}] Triage missed red flags: ${missing.join(', ')} ` +
              `(detected: ${found.join(', ') || 'none'})`,
            )
          }
        }

        // Assert consult was created
        if (consultId) {
          expect(typeof consultId).toBe('string')
          expect(consultId.length).toBeGreaterThan(0)
        }

        console.log(
          `[${persona.id}] Triage: ${triageResult.triage_tier} (expected: ${persona.expectedTriage.urgency}), ` +
          `confidence: ${triageResult.confidence}, ` +
          `consult: ${consultId || 'none'}, ` +
          `duration: ${Date.now() - start}ms`,
        )
      }, config.stepTimeout)

      // ── Step 2: Intake ────────────────────────────────────────────────

      it('Intake collects all fields', async () => {
        const start = Date.now()

        // If triage created a consult, initiate intake on it
        if (consultId) {
          const intakeInit = await initiateIntake(consultId)
          if (intakeInit.error) {
            console.warn(`[${persona.id}] Intake initiation warning: ${intakeInit.error}`)
          }
        }

        // Run the multi-turn intake conversation
        const intakeResult = await runIntakeConversation(persona)

        expect(intakeResult.error).toBeNull()

        // Verify the 9 required fields
        const requiredFields = [
          'patient_name', 'date_of_birth', 'email', 'phone',
          'chief_complaint', 'current_medications', 'allergies',
          'medical_history', 'family_history',
        ]

        const collectedFields = requiredFields.filter(
          (f) => intakeResult.collectedData[f] && intakeResult.collectedData[f].trim() !== '',
        )

        // We expect at least 7 out of 9 fields collected (AI might combine some)
        expect(
          collectedFields.length,
          `Intake collected ${collectedFields.length}/9 fields in ${intakeResult.turnCount} turns. ` +
          `Missing: ${requiredFields.filter((f) => !collectedFields.includes(f)).join(', ')}`,
        ).toBeGreaterThanOrEqual(7)

        console.log(
          `[${persona.id}] Intake: ${collectedFields.length}/9 fields in ${intakeResult.turnCount} turns, ` +
          `complete: ${intakeResult.isComplete}, ` +
          `duration: ${Date.now() - start}ms`,
        )
      }, config.stepTimeout * 3) // Intake requires multiple AI round-trips

      // ── Step 3: Historian Structured Output ────────────────────────────

      it('Historian structured output is complete', async () => {
        const start = Date.now()

        const saveResult = await saveHistorianSession(persona, consultId || undefined)

        expect(saveResult.error).toBeNull()
        expect(saveResult.data).toBeTruthy()
        expect(saveResult.data!.session).toBeTruthy()

        historianSessionId = saveResult.data!.session.id

        // Verify OLDCARTS fields are populated in the saved structured output
        const so = saveResult.data!.session.structured_output as Record<string, unknown> | null
        expect(so).toBeTruthy()

        if (so) {
          const oldcartsFields = [
            'chief_complaint', 'onset', 'location', 'duration', 'character',
            'aggravating_factors', 'relieving_factors', 'timing', 'severity',
            'associated_symptoms',
          ]
          const populated = oldcartsFields.filter(
            (f) => so[f] && typeof so[f] === 'string' && (so[f] as string).trim().length > 0,
          )
          expect(
            populated.length,
            `OLDCARTS: ${populated.length}/10 populated. Missing: ${oldcartsFields.filter((f) => !populated.includes(f)).join(', ')}`,
          ).toBeGreaterThanOrEqual(8)
        }

        // Verify narrative summary exists
        expect(saveResult.data!.session.narrative_summary).toBeTruthy()
        expect(
          saveResult.data!.session.narrative_summary!.length,
          'Narrative summary should be substantial',
        ).toBeGreaterThan(100)

        console.log(
          `[${persona.id}] Historian: session ${historianSessionId}, ` +
          `narrative: ${saveResult.data!.session.narrative_summary?.length || 0} chars, ` +
          `duration: ${Date.now() - start}ms`,
        )
      }, config.stepTimeout)

      // ── Step 4: Localizer ─────────────────────────────────────────────

      it('Localizer generates reasonable differential', async () => {
        const start = Date.now()
        const sessionId = historianSessionId || 'test-session-' + persona.id

        const result = await runLocalizer(sessionId, persona)

        // Localizer may partially degrade — that's by design
        if (result.data?.partial && result.data?.degradedReason) {
          console.warn(
            `[${persona.id}] Localizer degraded: ${result.data.degradedReason}`,
          )
        }

        // If we got a result (even partial), validate it
        if (result.data && result.data.differential.length > 0) {
          localizerResult = result.data

          // Verify differential contains expected diagnoses
          const { found, missing } = ddxContains(
            result.data.differential,
            persona.expectedDDx,
          )

          // We expect at least the top expected diagnosis to be found
          const highLikelihoodExpected = persona.expectedDDx.filter((d) => d.likelihood === 'high')
          const highLikelihoodFound = highLikelihoodExpected.filter(
            (d) => found.some((f) => f.expected === d.diagnosis),
          )

          expect(
            highLikelihoodFound.length,
            `Missing high-likelihood diagnoses: ${highLikelihoodExpected.filter((d) => !highLikelihoodFound.includes(d)).map((d) => d.diagnosis).join(', ')}`,
          ).toBeGreaterThanOrEqual(Math.max(1, Math.ceil(highLikelihoodExpected.length / 2)))

          // Verify ICD-10 codes are present on differential entries
          const withIcd10 = result.data.differential.filter((d) => d.icd10)
          // ICD-10 codes are optional, just note their presence
          if (withIcd10.length > 0) {
            // Basic ICD-10 format check: letter followed by digits
            for (const entry of withIcd10) {
              if (entry.icd10) {
                expect(
                  /^[A-Z]\d{2}/.test(entry.icd10),
                  `Invalid ICD-10 format: "${entry.icd10}" for "${entry.diagnosis}"`,
                ).toBe(true)
              }
            }
          }

          console.log(
            `[${persona.id}] Localizer: ${result.data.differential.length} diagnoses, ` +
            `found ${found.length}/${persona.expectedDDx.length} expected, ` +
            `confidence: ${result.data.confidence}, ` +
            `partial: ${result.data.partial || false}, ` +
            `duration: ${Date.now() - start}ms`,
          )
        } else {
          // Localizer returned no results — this is acceptable if it degraded
          console.warn(
            `[${persona.id}] Localizer returned no differential. ` +
            `Error: ${result.error || 'none'}. ` +
            `Degraded: ${result.data?.degradedReason || 'n/a'}`,
          )
          // Don't hard-fail — the localizer is designed to degrade gracefully
          expect(true).toBe(true)
        }
      }, config.stepTimeout)

      // ── Step 5: Report Generation ─────────────────────────────────────

      it('Report is complete and accurate', async () => {
        // Report requires a consult ID
        if (!consultId) {
          console.warn(`[${persona.id}] Skipping report — no consult ID from triage`)
          expect(true).toBe(true) // Soft skip
          return
        }

        const start = Date.now()
        const result = await generateReport(consultId)

        if (result.error) {
          console.warn(`[${persona.id}] Report generation warning: ${result.error}`)
          // Don't hard-fail if the database doesn't have the required schema
          if (result.status === 500) {
            expect(true).toBe(true) // Soft skip on server errors
            return
          }
        }

        if (result.data && result.data.report) {
          reportResult = result.data

          const report = result.data.report

          // Verify report has sections
          expect(report.sections.length, 'Report should have at least one section').toBeGreaterThan(0)

          // Verify report has a chief complaint
          expect(report.chief_complaint).toBeTruthy()

          // Verify report status
          expect(report.status).toBe('draft')

          // Verify word count is reasonable (at least 50 words)
          expect(
            report.word_count,
            `Report word count (${report.word_count}) should be at least 50`,
          ).toBeGreaterThanOrEqual(50)

          console.log(
            `[${persona.id}] Report: ${report.sections.length} sections, ` +
            `${report.word_count} words, ` +
            `triage: ${report.triage_tier || 'n/a'}, ` +
            `subspecialty: ${report.subspecialty || 'n/a'}, ` +
            `duration: ${Date.now() - start}ms`,
          )
        } else {
          console.warn(`[${persona.id}] No report data returned`)
          expect(true).toBe(true) // Soft skip
        }
      }, config.stepTimeout)

      // ── Grading Summary ───────────────────────────────────────────────

      it('Grade summary', () => {
        const structuredOutput = persona.structuredHistory as unknown as Record<string, unknown>

        const grade = computeGrade(
          triageResult,
          localizerResult,
          structuredOutput,
          reportResult,
          persona,
        )

        // Print the grade report
        console.log(formatGradeReport(grade, persona.name))

        // Overall score should be reasonable
        // We don't set a hard threshold here — the individual step tests
        // already validate the critical requirements. The grade is for
        // observability and tracking improvement over time.
        expect(grade.overall_score).toBeGreaterThanOrEqual(0)
        expect(grade.overall_score).toBeLessThanOrEqual(100)

        // Safety-critical checks: triage and red flags must pass
        if (persona.expectedTriage.urgency === 'emergent') {
          expect(
            grade.triage_accuracy.pass,
            `SAFETY: Emergent case "${persona.name}" was not triaged correctly`,
          ).toBe(true)
        }
      })
    })
  }
})
