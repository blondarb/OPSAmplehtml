import { describe, expect, it } from 'vitest'
import { buildSafetyReviewViewModel } from '@/lib/triage/safetyReviewView'

describe('buildSafetyReviewViewModel', () => {
  it('collects evidence from deterministic and model safety branches without duplicates', () => {
    const evidence = {
      quote: 'The patient developed sudden aphasia.',
      startOffset: 10,
      endOffset: 47,
      pageNumber: 12,
    }
    const view = buildSafetyReviewViewModel({
      deterministicGateway: {
        signals: [
          {
            code: 'acute_aphasia',
            syndrome: 'acute_cerebrovascular',
            action: 'emergency_now',
            evidence: [evidence],
          },
        ],
      },
      modelSafety: {
        signals: [
          {
            code: 'acute_aphasia',
            syndrome: 'acute_cerebrovascular',
            action: 'emergency_now',
            evidence: [evidence],
          },
        ],
      },
      fusion: {
        adjudicationRequired: true,
        reasons: ['safety_branch_disagreement'],
      },
    })

    expect(view.evidence).toHaveLength(1)
    expect(view.evidence[0]).toMatchObject({
      quote: evidence.quote,
      pageNumber: 12,
      syndrome: 'acute_cerebrovascular',
    })
    expect(view.requiresAdjudication).toBe(true)
    expect(view.warnings).toContain('Safety branches disagreed')
  })

  it('surfaces failed safety branches for mandatory human review', () => {
    const view = buildSafetyReviewViewModel({
      modelSafetyFailure: 'ClinicalModelOutputError',
      adjudicatorFailure: 'AbortError',
    })

    expect(view.warnings).toEqual(
      expect.arrayContaining([
        'Independent safety-model review failed',
        'Sparse adjudication failed; conservative hold remains',
      ]),
    )
  })
})
