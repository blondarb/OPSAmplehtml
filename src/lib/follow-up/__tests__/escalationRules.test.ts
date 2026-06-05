import { describe, it, expect } from 'vitest'
import { escalationFlagFromToolOutput } from '@/lib/follow-up/escalationRules'

describe('escalationFlagFromToolOutput', () => {
  it('builds an EscalationFlag from the AI save_followup_output schema fields', () => {
    // These are exactly the fields FOLLOWUP_TOOL emits (escalation_triggered /
    // escalation_tier / escalation_reason) — the shape the hook now consumes.
    const flag = escalationFlagFromToolOutput({
      escalation_triggered: true,
      escalation_tier: 'urgent',
      escalation_reason: 'Patient reports new left-arm weakness and slurred speech.',
    })

    expect(flag).not.toBeNull()
    expect(flag).toMatchObject({
      tier: 'urgent',
      category: 'ai_assessment',
      aiAssessment: 'Patient reports new left-arm weakness and slurred speech.',
      recommendedAction: 'Immediate clinician notification.',
    })
    expect(flag!.triggerText).toBeTruthy()
    // timestamp is a real ISO string
    expect(typeof flag!.timestamp).toBe('string')
    expect(new Date(flag!.timestamp).toISOString()).toBe(flag!.timestamp)
  })

  it('passes through each valid tier with a matching recommended action', () => {
    const cases: Array<[string, string]> = [
      ['urgent', 'Immediate clinician notification.'],
      ['same_day', 'Same-day clinician callback.'],
      ['next_visit', 'Flag for next scheduled visit.'],
      ['informational', 'Informational note — no immediate action required.'],
    ]
    for (const [tier, action] of cases) {
      const flag = escalationFlagFromToolOutput({
        escalation_triggered: true,
        escalation_tier: tier,
        escalation_reason: 'reason',
      })
      expect(flag?.tier).toBe(tier)
      expect(flag?.recommendedAction).toBe(action)
    }
  })

  it('falls back to the informational tier when escalation_tier is missing or invalid', () => {
    const missing = escalationFlagFromToolOutput({
      escalation_triggered: true,
      escalation_reason: 'reason',
    })
    expect(missing?.tier).toBe('informational')

    const invalid = escalationFlagFromToolOutput({
      escalation_triggered: true,
      escalation_tier: 'emergency', // not a member of the enum
      escalation_reason: 'reason',
    })
    expect(invalid?.tier).toBe('informational')
  })

  it('supplies a default assessment when escalation_reason is empty', () => {
    const flag = escalationFlagFromToolOutput({
      escalation_triggered: true,
      escalation_tier: 'same_day',
      escalation_reason: '   ',
    })
    expect(flag?.aiAssessment).toBeTruthy()
  })

  it('returns null when the AI did not flag an escalation', () => {
    expect(
      escalationFlagFromToolOutput({
        escalation_triggered: false,
        escalation_tier: 'urgent',
        escalation_reason: 'should be ignored',
      })
    ).toBeNull()

    // Tool output with only the structured fields present but no trigger
    expect(escalationFlagFromToolOutput({ medication_status: [], functional_status: 'better' })).toBeNull()
  })

  it('returns null for the legacy `escalation_flags` array shape (the bug being fixed)', () => {
    // The hook previously read args.escalation_flags, a field the schema never
    // declares. Without escalation_triggered there is nothing to surface.
    expect(
      escalationFlagFromToolOutput({
        escalation_flags: [{ tier: 'urgent', trigger_text: 'x', category: 'y' }],
      })
    ).toBeNull()
  })

  it('returns null for non-object input', () => {
    expect(escalationFlagFromToolOutput(null)).toBeNull()
    expect(escalationFlagFromToolOutput(undefined)).toBeNull()
    expect(escalationFlagFromToolOutput('escalate')).toBeNull()
  })
})
