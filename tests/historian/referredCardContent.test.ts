import { describe, expect, it } from 'vitest'

import { deriveReferredCardContent } from '@/lib/historian/referredCardContent'
import type { HistorianHandoffDisplay } from '@/lib/historian/referralHandoff'

/**
 * The referred-mode card exists to prove a triage → historian handoff
 * succeeded. Its one required property (per the redesign spec): tier AND
 * focus must both be visible when present, and every field must degrade
 * gracefully rather than rendering "undefined" or a blank line — a missing
 * focus with nothing said about it is the exact silent-failure mode this
 * whole feature is tested against.
 */

describe('deriveReferredCardContent', () => {
  it('surfaces BOTH tier and focus when the handoff carries both', () => {
    const display: HistorianHandoffDisplay = {
      patientLabel: 'J.H., 34F',
      tierDisplay: 'Tier 2 of 7 — Urgent',
      focusHint: 'Clinical dissemination in space and time',
    }
    const content = deriveReferredCardContent(display)
    expect(content.patientLabel).toBe('J.H., 34F')
    expect(content.tierLine).toBe('Triage: Tier 2 of 7 — Urgent')
    expect(content.focusText).toBe('Clinical dissemination in space and time')
  })

  it('omits the tier line entirely when tierDisplay is absent, rather than printing an empty tier', () => {
    const content = deriveReferredCardContent({ focusHint: 'Progressive gait imbalance' })
    expect(content.tierLine).toBeNull()
    expect(content.focusText).toBe('Progressive gait imbalance')
  })

  it('omits the tier line when tierDisplay is whitespace-only', () => {
    const content = deriveReferredCardContent({ tierDisplay: '   ', focusHint: 'Headache' })
    expect(content.tierLine).toBeNull()
  })

  it('renders a self-contradictory tier string verbatim — never parsed, colored, or suppressed', () => {
    const contradictory =
      'INSUFFICIENT DATA — Return to Referring Provider for Clarification (Red Flag Override)'
    const content = deriveReferredCardContent({
      tierDisplay: contradictory,
      focusHint: 'Insufficient clinical detail provided',
    })
    expect(content.tierLine).toBe(`Triage: ${contradictory}`)
  })

  it('falls back to an explicit "not captured" message when focusHint is missing, never a blank space', () => {
    const content = deriveReferredCardContent({ patientLabel: 'Patient', tierDisplay: 'Urgent' })
    expect(content.focusText.length).toBeGreaterThan(0)
    expect(content.focusText).toMatch(/not captured/i)
  })

  it('falls back to an explicit "not captured" message when focusHint is whitespace-only', () => {
    const content = deriveReferredCardContent({ focusHint: '   ' })
    expect(content.focusText).toMatch(/not captured/i)
  })

  it('falls back to a generic patient label when patientLabel is absent, never a blank line', () => {
    const content = deriveReferredCardContent({ focusHint: 'Something' })
    expect(content.patientLabel).toBe('Referred patient')
  })

  it('falls back to a generic patient label when patientLabel is whitespace-only', () => {
    const content = deriveReferredCardContent({ patientLabel: '  ', focusHint: 'Something' })
    expect(content.patientLabel).toBe('Referred patient')
  })

  it('handles a completely empty display object without throwing or printing "undefined"', () => {
    const content = deriveReferredCardContent({})
    expect(content.patientLabel).toBe('Referred patient')
    expect(content.tierLine).toBeNull()
    expect(content.focusText).not.toMatch(/undefined/)
  })

  it('handles a null display (no handoff at all) the same way as an empty one', () => {
    const content = deriveReferredCardContent(null)
    expect(content.patientLabel).toBe('Referred patient')
    expect(content.tierLine).toBeNull()
    expect(content.focusText).not.toMatch(/undefined/)
  })
})
