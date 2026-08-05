import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Structural guard for referred mode in NeurologicHistorian.tsx.
 *
 * This repo has no DOM test environment (see referralHandoff.test.ts /
 * triageHandoffPayload.test.ts — the same constraint applies here), so a
 * click or a render cannot be simulated. What CAN be pinned down is the
 * source structure that determines what actually renders — the same
 * approach startGuardParity.test.ts uses for the consent-gate guard. The
 * card's own text-degradation logic is covered separately, and testably, by
 * tests/historian/referredCardContent.test.ts (a pure function with no DOM
 * dependency).
 */

const COMPONENT_SOURCE = readFileSync(
  resolve(process.cwd(), 'src/components/NeurologicHistorian.tsx'),
  'utf8',
)

const ROUTE_SOURCE = readFileSync(
  resolve(process.cwd(), 'src/app/patient/triage-historian/page.tsx'),
  'utf8',
)

const PLAIN_ROUTE_SOURCE = readFileSync(
  resolve(process.cwd(), 'src/app/patient/historian/page.tsx'),
  'utf8',
)

describe('referredMode discriminator', () => {
  it('is derived from handoffDisplay !== null, not a separate flag or the initialMode prop', () => {
    expect(COMPONENT_SOURCE).toContain('const referredMode = handoffDisplay !== null')
  })

  it('the paste-a-referral path never sets handoffDisplay — only the handoff pickup effect does', () => {
    const start = COMPONENT_SOURCE.indexOf('async function handleUseReferralNote')
    expect(start).toBeGreaterThan(-1)
    const end = COMPONENT_SOURCE.indexOf('const handleSelectScenario', start)
    expect(end).toBeGreaterThan(start)
    const body = COMPONENT_SOURCE.slice(start, end)
    expect(body).not.toContain('setHandoffDisplay')
  })
})

describe('demo scenario cards and paste box are gated off in referred mode', () => {
  it('the always-visible picker instance requires !sessionConfig && !referredMode', () => {
    expect(COMPONENT_SOURCE).toContain('{!sessionConfig && !referredMode && (')
  })

  it('a second, collapsed instance renders the identical picker content behind a <details> when referredMode is true', () => {
    expect(COMPONENT_SOURCE).toContain('{!sessionConfig && referredMode && (')
    expect(COMPONENT_SOURCE).toContain('<details')
    // Both branches must reference the SAME extracted JSX variables, not a
    // duplicated copy of the demo-cards / referral-card markup — the task's
    // explicit "do not fork" steer, applied at the JSX level.
    const demoRefs = COMPONENT_SOURCE.split('{demoScenarioCards}').length - 1
    const referralRefs = COMPONENT_SOURCE.split('{referralNoteCard}').length - 1
    expect(demoRefs).toBe(2)
    expect(referralRefs).toBe(2)
    // And each of those variables must be DEFINED exactly once — proof the
    // two render sites share one source of truth instead of two similar
    // JSX blocks that can drift apart.
    expect(COMPONENT_SOURCE.split('const demoScenarioCards = (').length - 1).toBe(1)
    expect(COMPONENT_SOURCE.split('const referralNoteCard = (').length - 1).toBe(1)
  })
})

describe('referred-mode card', () => {
  it('renders in the same slot as, and mutually exclusive with, the real-patient card', () => {
    expect(COMPONENT_SOURCE).toContain('{!sessionConfig && referredMode && (')
    expect(COMPONENT_SOURCE).toContain('data-testid="referred-mode-card"')
  })

  it('shows both a tier line and a focus line sourced from the derived card content, not raw handoffDisplay fields', () => {
    const start = COMPONENT_SOURCE.indexOf('data-testid="referred-mode-card"')
    const end = COMPONENT_SOURCE.indexOf('{/* Real patient context card */}', start)
    expect(end).toBeGreaterThan(start)
    const body = COMPONENT_SOURCE.slice(start, end)
    expect(body).toContain('referredCardContent.patientLabel')
    expect(body).toContain('referredCardContent.tierLine')
    expect(body).toContain('referredCardContent.focusText')
  })

  it('lives inside the same phase===scenario_select && !showConsentDisclosure gate as everything else on step 1 — never rendered on top of the consent screen', () => {
    const stepOneGate = COMPONENT_SOURCE.indexOf(
      "phase === 'scenario_select' && !showConsentDisclosure",
    )
    const cardTestId = COMPONENT_SOURCE.indexOf('data-testid="referred-mode-card"')
    const consentGate = COMPONENT_SOURCE.indexOf(
      "phase === 'scenario_select' && showConsentDisclosure",
    )
    expect(stepOneGate).toBeGreaterThan(-1)
    expect(cardTestId).toBeGreaterThan(stepOneGate)
    // The consent-screen block is a SIBLING conditional rendered earlier in
    // source order (see render plan) — the referred card must not sit
    // before it, which would make it a shared ancestor instead of a sibling.
    expect(consentGate).toBeLessThan(cardTestId)
  })
})

describe('lede copy never regresses to nn-hint-sized text for the handoff confirmation', () => {
  it('the referred-mode lede uses nn-lede (17px body), not nn-hint (11.5px) — the exact regression this feature exists to fix', () => {
    expect(COMPONENT_SOURCE).toContain(
      "'Loaded from triage — review below and start when ready.'",
    )
    const ledeStart = COMPONENT_SOURCE.indexOf('<p className="nn-lede">')
    const ledeEnd = COMPONENT_SOURCE.indexOf('</p>', ledeStart)
    const ledeBlock = COMPONENT_SOURCE.slice(ledeStart, ledeEnd)
    expect(ledeBlock).toContain('Loaded from triage')
  })
})

describe('cold-open handling on the dedicated route', () => {
  it('the hint only appears in the non-referred branch, gated on initialMode, and never gates or hides the picker', () => {
    const nonReferredBranch = COMPONENT_SOURCE.indexOf('{!sessionConfig && !referredMode && (')
    expect(nonReferredBranch).toBeGreaterThan(-1)
    // The collapsed-disclosure branch (the second `{!sessionConfig &&
    // referredMode && (` in source — the first is the referred-card block
    // above it) marks the end of the non-referred branch's JSX.
    const disclosureBranch = COMPONENT_SOURCE.indexOf(
      '{!sessionConfig && referredMode && (',
      nonReferredBranch,
    )
    expect(disclosureBranch).toBeGreaterThan(nonReferredBranch)
    const hint = COMPONENT_SOURCE.indexOf("initialMode === 'referred'")
    expect(hint).toBeGreaterThan(nonReferredBranch)
    expect(hint).toBeLessThan(disclosureBranch)
  })

  it('initialMode is documented as intent only — it does not by itself flip referredMode', () => {
    const propBlock = COMPONENT_SOURCE.slice(
      COMPONENT_SOURCE.indexOf('interface NeurologicHistorianProps'),
      COMPONENT_SOURCE.indexOf('export default function NeurologicHistorian'),
    )
    expect(propBlock).toMatch(/intent only,?\s*\n?\s*\*?\s*NOT the mode/)
  })
})

describe('route wiring', () => {
  it('/patient/triage-historian renders NeurologicHistorian with initialMode="referred"', () => {
    expect(ROUTE_SOURCE).toContain('<NeurologicHistorian initialMode="referred" />')
    expect(ROUTE_SOURCE).toContain("export const dynamic = 'force-dynamic'")
    expect(ROUTE_SOURCE).toContain('Suspense')
  })

  it('/patient/historian is untouched — still renders NeurologicHistorian with no props', () => {
    expect(PLAIN_ROUTE_SOURCE).toContain('<NeurologicHistorian />')
    expect(PLAIN_ROUTE_SOURCE).not.toContain('initialMode')
  })
})

describe('no new startSession() call site was introduced', () => {
  it('startSession() is still invoked from exactly two guarded call sites (handleStartInterview\'s consent-already-acknowledged path, and handleConsentConfirm)', () => {
    // Matches only actual invocations (`void startSession()`), not the
    // destructured hook reference or the explanatory comments above it.
    const callSites = COMPONENT_SOURCE.split('void startSession()').length - 1
    // Unchanged count from before this feature. A referred-mode "quick
    // start" that bypassed consent would add a THIRD call site here.
    expect(callSites).toBe(2)
  })
})
