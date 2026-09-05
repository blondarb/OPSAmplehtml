import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ValidationReviewForm } from '@/components/triage/ValidationReviewForm'

const activeCase = {
  id: 'case-synthetic-1',
  case_number: 1,
  referral_text: 'SYNTHETIC TEST CASE',
  reviewed: false,
}

describe('ValidationReviewForm', () => {
  it('renders the required reviewer-owned wait comfort field without an AI answer', () => {
    const html = renderToStaticMarkup(
      <ValidationReviewForm
        caseNumber={activeCase.case_number}
        tier="routine"
        destination="uncertain"
        confidence=""
        waitComfort=""
        reasoning=""
        disabled={false}
        submitting={false}
        onTier={() => undefined}
        onDestination={() => undefined}
        onConfidence={() => undefined}
        onWaitComfort={() => undefined}
        onReasoning={() => undefined}
        onSubmit={() => undefined}
      />,
    )

    expect(html).toContain('Comfort with the wait for your selected urgency')
    expect(html).toContain('Within 8-12 Weeks')
    expect(html).toContain('name="comfortable_with_wait"')
    expect(html).not.toContain('AI answer')
  })
})
