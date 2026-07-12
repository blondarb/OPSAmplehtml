import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import BatchResultsPanel from '../BatchResultsPanel'

describe('BatchResultsPanel fail-closed states', () => {
  it('labels a processing failure as requiring human review without a triage result', () => {
    const html = renderToStaticMarkup(
      createElement(BatchResultsPanel, {
        items: [
          {
            id: 'batch-failed',
            filename: 'synthetic-packet.pdf',
            status: 'error',
            error:
              'Packet processing failed. No triage result was produced. Route this referral for human review.',
          },
        ],
        onTryAnother: vi.fn(),
      }),
    )

    expect(html).toContain('1 requires human review')
    expect(html).toContain('Needs human review')
    expect(html).toContain('No triage result was produced')
    expect(html).not.toContain('1 failed')
  })

  it('renders every file safety workflow independently in a multi-referral batch', () => {
    const html = renderToStaticMarkup(
      createElement(BatchResultsPanel, {
        items: [
          {
            id: 'batch-emergency-a',
            filename: 'referral-a.pdf',
            status: 'error',
            safetyNotice: {
              immediateReviewRequired: true,
              safetyTriageSessionId: 'workflow-emergency-a',
              sourceLabel: 'referral-a.pdf',
              safetyPathway: 'emergency_now',
              outpatientScoringBlocked: true,
              humanReviewRequired: true,
              schedulingLocked: true,
            },
          },
          {
            id: 'batch-same-day-b',
            filename: 'referral-b.pdf',
            status: 'error',
            safetyNotice: {
              immediateReviewRequired: true,
              safetyTriageSessionId: 'workflow-same-day-b',
              sourceLabel: 'referral-b.pdf',
              safetyPathway: 'same_day_clinician_review',
              outpatientScoringBlocked: true,
              humanReviewRequired: true,
              schedulingLocked: true,
            },
          },
        ],
        onTryAnother: vi.fn(),
      }),
    )

    expect(html).toContain('workflow-emergency-a')
    expect(html).toContain('workflow-same-day-b')
    expect(html).toContain('referral-a.pdf')
    expect(html).toContain('referral-b.pdf')
    expect(html).toContain('Emergency evaluation now')
    expect(html).toContain('Same-day clinician review')
  })
})
