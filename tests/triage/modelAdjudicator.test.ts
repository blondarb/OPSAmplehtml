import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@/lib/bedrock', () => ({ invokeBedrockClinicalTool: invokeMock }))

import { runTriageAdjudicator } from '@/lib/triage/modelAdjudicator'

const source = 'The patient developed sudden aphasia 20 minutes ago.'
const branchContext = {
  deterministicPathway: 'emergency_now',
  safetyModelPathway: 'no_time_critical_signal',
  scoringPathway: 'expedited_outpatient',
  fusionReasons: ['safety_branch_disagreement'],
}

describe('runTriageAdjudicator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invokeMock.mockResolvedValue({
      parsed: {
        care_pathway: 'emergency_now',
        rationale: 'Exact current focal-deficit evidence supports escalation.',
        evidence: [{ quote: source, occurrence_index: 0 }],
        unresolved_conflicts: [],
      },
      stopReason: 'end_turn',
    })
  })

  it('uses Opus 4.8 only as the sparse disagreement adjudicator', async () => {
    const result = await runTriageAdjudicator(source, branchContext)

    expect(result.carePathway).toBe('emergency_now')
    expect(invokeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'us.anthropic.claude-opus-4-8',
        temperature: 0,
        toolName: 'emit_triage_adjudication',
      }),
    )
  })

  it('rejects hallucinated adjudicator evidence', async () => {
    invokeMock.mockResolvedValueOnce({
      parsed: {
        care_pathway: 'emergency_now',
        rationale: 'Synthetic rationale.',
        evidence: [
          { quote: 'Hallucinated acute deficit.', occurrence_index: 0 },
        ],
        unresolved_conflicts: [],
      },
      stopReason: 'end_turn',
    })

    await expect(
      runTriageAdjudicator(source, branchContext),
    ).rejects.toThrow(/evidence/)
  })

  it('requires exact evidence for a time-critical adjudication', async () => {
    invokeMock.mockResolvedValueOnce({
      parsed: {
        care_pathway: 'same_day_clinician_review',
        rationale: 'Synthetic rationale.',
        evidence: [],
        unresolved_conflicts: [],
      },
      stopReason: 'end_turn',
    })

    await expect(
      runTriageAdjudicator(source, branchContext),
    ).rejects.toThrow(/evidence/)
  })
})
