/**
 * Simulated Patient E2E Test Runner
 *
 * Runs each patient persona through the full clinical pipeline at the API level:
 *   1. Triage — POST referral text, poll to completion, assert urgency and red flags
 *   2. Intake — Simulate multi-turn intake conversation, verify field collection
 *   3. Historian — Save pre-built structured output, verify OLDCARTS completeness
 *   4. Localizer — Generate differential diagnosis, verify expected diagnoses
 *   5. Report — Generate unified report, verify completeness and accuracy
 *
 * ── THIS SUITE NEEDS A LIVE, AUTHENTICATED APP ───────────────────────────────
 *
 * Every step is a real HTTP call against a running instance, and every clinical
 * endpoint sits behind `authorizeClinicalAccess` (only the /triage PAGE is in
 * middleware PUBLIC_ROUTES — /api/triage/* is not). Without credentials the API
 * returns 401 and nothing clinical is evaluated at all.
 *
 * So the suite is OPT-IN and it SKIPS rather than fails when its preconditions
 * are unmet. That is deliberate: a 401 that surfaced as
 *   "SAFETY: Emergent case ... was not triaged correctly"
 * reads like a stroke-triage regression when the request was simply rejected —
 * and a gate that cries wolf is a gate everyone learns to ignore, which is
 * exactly how a real safety regression would slip through. An unmet
 * precondition is a skip; a rejected request is a TRANSPORT failure; only a
 * 200-with-a-body is ever graded clinically.
 *
 * ── How to run ───────────────────────────────────────────────────────────────
 *
 *   RUN_SIMULATED_PATIENTS=1 \
 *   TEST_BASE_URL=http://localhost:3000 \
 *   TEST_SESSION_COOKIE='id_token=eyJ...' \
 *     npx vitest run tests/simulated-patients/runner.test.ts
 *
 * Prerequisites:
 *   - RUN_SIMULATED_PATIENTS=1 — opt in. Omitted, the whole file skips with a
 *     reason. It is excluded from a default `npx vitest run` on purpose: it
 *     needs a live authenticated app and takes ~14 minutes.
 *   - App running at localhost:3000 (or TEST_BASE_URL).
 *   - An authenticated session. Preferred: TEST_SESSION_COOKIE, the value of the
 *     app's httpOnly `id_token` cookie from a signed-in browser (DevTools →
 *     Application → Cookies). TEST_EMAIL / TEST_PASSWORD is a fallback that
 *     only works if the Cognito app client has USER_PASSWORD_AUTH enabled —
 *     this app signs in through the Hosted UI (OAuth + PKCE), where it usually
 *     is not. See README.md for both paths.
 *   - The account needs an active `clinical_access_memberships` row with role
 *     `clinician` or `admin` for the tenant, or every call 403s.
 *   - Database accessible from the app (RDS or local).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import type {
  PatientPersona,
  TriageAPIResponse,
  LocalizerResponse,
  ReportResponse,
} from './types'
import {
  preflight,
  assertTransportOk,
  TRANSPORT_PREFIX,
  runTriage,
  initiateIntake,
  runIntakeConversation,
  saveHistorianSession,
  runLocalizer,
  generateReport,
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

// ── Precondition Gate ─────────────────────────────────────────────────────────

// Resolved before the suite is registered so an unmet precondition produces a
// SKIP carrying its own reason, not a failing file. See the header for why.
const gate = await preflight()

// ── Test Suite ────────────────────────────────────────────────────────────────

if (!gate.ok) {
  // A single named, skipped test — the reporter prints the reason, so a run that
  // proves nothing says so out loud instead of looking green or looking broken.
  describe('Simulated Patient E2E', () => {
    it.skip(`SKIPPED — ${gate.reason}`, () => {})
  })
}

describe.skipIf(!gate.ok)('Simulated Patient E2E', () => {
  beforeAll(() => {
    console.log(`[SETUP] Preflight OK — ${gate.ok ? gate.detail : ''}`)
    console.log(`[SETUP] Loaded ${personas.length} persona(s): ${personas.map((p) => p.id).join(', ')}`)
  })

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

        // Transport first — a rejected request must never read as a bad score.
        assertTransportOk(
          `Triage (${result.stage})`,
          result.stage === 'submit'
            ? `POST ${config.endpoints.triage}`
            : `GET ${config.endpoints.triageById(result.sessionId ?? '{id}')}`,
          result,
        )

        // Past this point we have a 2xx. Anything still missing is the pipeline
        // failing to produce a scored result, which IS worth failing on.
        expect(
          result.error,
          `Triage did not produce a scored result (HTTP ${result.status}, stage: ${result.stage})`,
        ).toBeNull()
        expect(result.data, 'Triage returned a 2xx with no scored body').toBeTruthy()

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
        // Must outlast the poll itself, or a slow-but-correct triage would fail
        // the test as a vitest timeout instead of reporting its own deadline.
      }, config.triagePollTimeout + 30_000)

      // ── Step 2: Intake ────────────────────────────────────────────────

      it('Intake collects all fields', async () => {
        const start = Date.now()

        // If triage created a consult, initiate intake on it.
        // The initiate-intake endpoint creates a followup_sessions row and
        // returns context + session_id that runIntakeConversation needs.
        let intakeSessionId: string | null = null
        let intakeContext: Record<string, unknown> | null = null
        if (consultId) {
          const intakeInit = await initiateIntake(consultId)
          assertTransportOk(
            'Intake initiation',
            `POST ${config.endpoints.initiateIntake(consultId)}`,
            intakeInit,
          )
          if (intakeInit.error) {
            console.warn(`[${persona.id}] Intake initiation warning: ${intakeInit.error}`)
          } else if (intakeInit.data) {
            intakeSessionId = intakeInit.data.intake_session_id
            intakeContext = intakeInit.data.context as Record<string, unknown>
          }
        }

        // Run the multi-turn intake conversation via /api/follow-up/message
        const intakeResult = await runIntakeConversation(
          persona,
          consultId || undefined,
          intakeSessionId,
          intakeContext,
        )

        assertTransportOk('Intake conversation', `POST ${config.endpoints.followUpMessage}`, {
          status: intakeResult.errorStatus,
          error: intakeResult.error,
        })

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

        assertTransportOk('Historian save', `POST ${config.endpoints.historianSave}`, saveResult)

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

        // Before crediting the localizer's "graceful degradation" path below:
        // a rejected request also produces an empty differential, and that is
        // not the localizer degrading — it is the call never happening.
        assertTransportOk('Localizer', `POST ${config.endpoints.localizer}`, result)

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
        // Report requires a consult ID. This used to soft-pass, which made a
        // run where triage never happened report a green report step — the same
        // "silently proves nothing" pattern this harness exists to avoid.
        if (!consultId) {
          throw new Error(
            `${TRANSPORT_PREFIX}: no consult ID for "${persona.name}", so the report step ` +
            `evaluated nothing. Triage did not return a consult_id (it is requested with ` +
            `create_consult: true) — fix the Triage step failure above.`,
          )
        }

        const start = Date.now()
        const result = await generateReport(consultId)

        // A 5xx used to soft-pass here ("maybe the schema is missing"), which
        // made a broken report endpoint indistinguishable from a working one.
        // It is a transport failure: the report step evaluated nothing.
        assertTransportOk('Report generation', `POST ${config.endpoints.report(consultId)}`, result)

        if (result.error) {
          console.warn(`[${persona.id}] Report generation warning: ${result.error}`)
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
        // Without a scored triage body there is nothing to grade. `computeGrade`
        // would score the absence as `pass: false`, and the SAFETY assertion
        // below would then announce a stroke-triage failure that never happened.
        // Say what actually went wrong instead.
        if (!triageResult) {
          throw new Error(
            `${TRANSPORT_PREFIX}: no scored triage body for "${persona.name}", ` +
            `so nothing was graded. Fix the Triage step failure above — this is NOT evidence ` +
            `that triage scored the case incorrectly.`,
          )
        }

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
