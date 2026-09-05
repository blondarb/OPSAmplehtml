import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Regression guard for a defect that reached production on 2026-08-04.
 *
 * The Start button's `disabled` condition was updated to accept a loaded
 * referral, but `handleStartInterview`'s early-return guard was not. The button
 * therefore rendered ENABLED with only a referral loaded while the handler
 * returned immediately — clicking Start silently did nothing and the flow never
 * advanced to the consent gate.
 *
 * The two conditions are inverses of one another and must be changed together.
 * This test asserts both mention every entry point, so adding a future entry
 * point to one and not the other fails here instead of on stage.
 */
const SOURCE = readFileSync(
  resolve(process.cwd(), 'src/components/NeurologicHistorian.tsx'),
  'utf8',
)

const ENTRY_POINTS = ['selectedScenario', 'sessionConfig', 'referralInput', 'openEnded'] as const

describe('start-interview guard matches the Start button', () => {
  it('the handler guard covers every entry point', () => {
    const body = SOURCE.slice(
      SOURCE.indexOf('const handleStartInterview'),
      SOURCE.indexOf('const handleConsentConfirm'),
    )
    // Anchor on the guard STATEMENT, not on the first 'return' — prose in the
    // surrounding comment can contain that word.
    const guardLine = body
      .split('\n')
      .find((line) => line.trim().startsWith('if (!canStartInterview('))
    expect(guardLine, 'early-return guard not found in handleStartInterview').toBeDefined()
    for (const entry of ENTRY_POINTS) {
      expect(guardLine).toContain(entry)
    }
  })

  it('the Start button disabled condition covers every entry point', () => {
    const marker = 'disabled={!canStartInterview('
    const start = SOURCE.indexOf(marker)
    expect(start).toBeGreaterThan(-1)
    const condition = SOURCE.slice(start, SOURCE.indexOf('\n', start))
    for (const entry of ENTRY_POINTS) {
      expect(condition).toContain(entry)
    }
  })
})

/**
 * A triage → historian handoff (sessionStorage, see
 * src/lib/historian/referralHandoff.ts) is a THIRD way `referralInput` gets
 * set, alongside the demo-scenario picker and the paste-a-referral-note
 * flow. It must not become a fourth, parallel entry point that the guard
 * above doesn't know about — the whole lesson of the 2026-08-04 defect is
 * that a new way to reach the interview has to feed the *same* state the
 * guard already checks, not grow its own bypass.
 *
 * This mirrors startGuardParity rather than duplicating its assertions: it
 * only checks that the handoff pickup effect writes into `referralInput`
 * (the exact name in ENTRY_POINTS above), so the existing guard/button
 * parity tests automatically cover the handoff path too.
 */
describe('handoff-loaded referral feeds the same guarded state', () => {
  it('readHistorianHandoff\'s payload is applied via setReferralInput, not a separate state variable', () => {
    const readCall = SOURCE.indexOf('const payload = readHistorianHandoff()')
    expect(readCall, 'mount-time handoff read not found').toBeGreaterThan(-1)
    // Scan to the END of the enclosing effect rather than a fixed character
    // window: comments and guards legitimately sit between the read and the
    // setter (the read was deliberately hoisted above the `?scenario=` return
    // so the key is always consumed), and a fixed window made this test fail
    // on a correct change.
    const effectEnd = SOURCE.indexOf('}, [scenarioParam])', readCall)
    expect(effectEnd, 'handoff effect terminator not found').toBeGreaterThan(readCall)
    const effectBody = SOURCE.slice(readCall, effectEnd)
    expect(effectBody).toContain('setReferralInput(payload.referral)')
  })
})

/**
 * Referred mode (the triage → historian redesign, 2026-08-05) adds a new
 * TOP-OF-PAGE card and collapses the demo/paste picker behind a disclosure —
 * but per the same lesson as above, it must not add a new way to *start* the
 * interview. `referredMode` is presentation-only: it changes what renders,
 * never the Start button's `onClick`/`disabled` wiring or the guard inside
 * `handleStartInterview`. This pins that referred mode is layout-only by
 * asserting the guard/button parity above still holds unchanged AND that
 * `referredMode` never appears inside either condition — if it ever does,
 * that is a fourth entry point the 2026-08-04 lesson exists to prevent.
 */
describe('referred mode does not become a fourth, ungated entry point', () => {
  it('referredMode is derived from handoffDisplay, which is set only by the handoff pickup effect (feeding the SAME referralInput the guard already checks)', () => {
    expect(SOURCE).toContain('const referredMode = handoffDisplay !== null')
  })

  it('the Start button disabled condition does not reference referredMode directly', () => {
    const marker = 'disabled={!canStartInterview('
    const start = SOURCE.indexOf(marker)
    expect(start).toBeGreaterThan(-1)
    const condition = SOURCE.slice(start, SOURCE.indexOf('\n', start))
    expect(condition).not.toContain('referredMode')
  })

  it('handleStartInterview\'s guard does not reference referredMode directly', () => {
    const body = SOURCE.slice(
      SOURCE.indexOf('const handleStartInterview'),
      SOURCE.indexOf('const handleConsentConfirm'),
    )
    const guardLine = body
      .split('\n')
      .find((line) => line.trim().startsWith('if (!canStartInterview('))
    expect(guardLine).toBeDefined()
    expect(guardLine).not.toContain('referredMode')
  })

  it('startSession() is invoked from exactly the same two guarded call sites as before referred mode shipped', () => {
    const callSites = SOURCE.split('void startSession()').length - 1
    expect(callSites).toBe(2)
  })
})
