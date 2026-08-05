/**
 * Unit tests for the transport/clinical boundary in the Simulated Patient harness.
 *
 * These are pure — no server, no credentials — so they run in the DEFAULT
 * `npx vitest run`, unlike runner.test.ts which is opt-in.
 *
 * They exist because the harness's whole value as a safety gate rests on one
 * distinction: "the API rejected the request" must never be reported as "the
 * model triaged the patient wrongly". That mix-up is what previously turned a
 * plain 401 into
 *   SAFETY: Emergent case "Acute Ischemic Stroke Presentation" was not triaged correctly
 * across 6 tests — noise that trains everyone to ignore the one gate asserting
 * emergent cases triage correctly.
 */

import { describe, it, expect } from 'vitest'
import { assertTransportOk, TRANSPORT_PREFIX, preflight } from './helpers'
import { config, OPT_IN_ENV } from './config'

const STEP = 'Triage'
const ENDPOINT = 'POST /api/triage'

describe('assertTransportOk', () => {
  describe('rejects — the request never reached clinical reasoning', () => {
    const rejections: Array<[number, string]> = [
      [401, 'unauthenticated'],
      [403, 'authenticated but not provisioned for clinical access'],
      [503, 'authorization store unavailable'],
      [500, 'server error'],
      [502, 'bad gateway'],
      [0, 'network error or timeout'],
    ]

    for (const [status, label] of rejections) {
      it(`throws a transport-tagged error on ${status} (${label})`, () => {
        expect(() =>
          assertTransportOk(STEP, ENDPOINT, { status, error: 'boom' }),
        ).toThrow(TRANSPORT_PREFIX)
      })
    }

    it('names the step and endpoint so the failing hop is identifiable', () => {
      expect(() =>
        assertTransportOk(STEP, ENDPOINT, { status: 401, error: 'Please sign in to continue.' }),
      ).toThrow(/Triage — POST \/api\/triage returned HTTP 401/)
    })

    it('states plainly that nothing was graded', () => {
      expect(() =>
        assertTransportOk(STEP, ENDPOINT, { status: 401, error: null }),
      ).toThrow(/nothing was graded/)
    })

    it('relays the server message so the cause is not guesswork', () => {
      expect(() =>
        assertTransportOk(STEP, ENDPOINT, { status: 403, error: 'Your account is not provisioned' }),
      ).toThrow(/Your account is not provisioned/)
    })

    it('never uses the word SAFETY — a rejected call is not a safety finding', () => {
      for (const [status] of rejections) {
        let message = ''
        try {
          assertTransportOk(STEP, ENDPOINT, { status, error: 'boom' })
        } catch (err) {
          message = err instanceof Error ? err.message : String(err)
        }
        expect(message, `status ${status} produced an empty message`).not.toBe('')
        expect(message, `status ${status} leaked safety language`).not.toMatch(/SAFETY/)
      }
    })
  })

  describe('passes through — the app answered, let the clinical assertions judge it', () => {
    for (const status of [200, 202, 400, 404, 422]) {
      it(`does not throw on ${status}`, () => {
        expect(() =>
          assertTransportOk(STEP, ENDPOINT, { status, error: status >= 400 ? 'bad input' : null }),
        ).not.toThrow()
      })
    }
  })
})

describe('preflight', () => {
  it(`refuses to run — with a reason, not a failure — when ${OPT_IN_ENV} is unset`, async () => {
    // The suite is opt-in, and this test file runs in the default suite, so the
    // flag is not set here. Guard rather than assume, in case a run sets it.
    if (config.optIn) return

    const result = await preflight()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain(OPT_IN_ENV)
    }
  })

  it('short-circuits on the opt-in check without touching the network', async () => {
    if (config.optIn) return

    // No server is running in a default test run; a preflight that tried to
    // reach one would hang on connect rather than return promptly.
    const started = Date.now()
    await preflight()
    expect(Date.now() - started).toBeLessThan(1000)
  })
})
