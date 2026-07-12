import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import MissingInformationPanel from '../MissingInformationPanel'

function renderPanel(
  timeframe: string,
  schedulingLocked: boolean,
): string {
  return renderToStaticMarkup(
    createElement(MissingInformationPanel, {
      missingInformation: ['Synthetic critical onset time is missing.'],
      timeframe,
      schedulingLocked,
    }),
  )
}

describe('MissingInformationPanel', () => {
  it('keeps emergency action active while missing information is gathered', () => {
    const html = renderPanel('Emergency evaluation now', true)

    expect(html).toContain('Synthetic critical onset time is missing.')
    expect(html).toContain('The active emergency action remains in effect.')
    expect(html).toContain(
      'Information gathering must not delay emergency evaluation.',
    )
    expect(html).toContain('Scheduling remains locked.')
    expect(html).not.toContain('does not contain enough clinical information')
  })

  it('keeps same-day review active and non-deferrable', () => {
    const html = renderPanel('Same-day clinician review', true)

    expect(html).toContain(
      'Same-day clinician review remains the active action.',
    )
    expect(html).toContain(
      'Information gathering must not delay same-day clinician review.',
    )
    expect(html).toContain('Scheduling remains locked.')
  })

  it('keeps a determined urgent timeframe active and reports an unlocked state', () => {
    const html = renderPanel('Within 1 Week', false)

    expect(html).toContain(
      'Within 1 Week remains the active triage timeframe.',
    )
    expect(html).toContain('Information gathering must not delay this action.')
    expect(html).toContain('Scheduling is not currently locked.')
  })

  it('renders nothing when there are no missing items', () => {
    const html = renderToStaticMarkup(
      createElement(MissingInformationPanel, {
        missingInformation: [],
        timeframe: 'Within 1 Week',
        schedulingLocked: false,
      }),
    )

    expect(html).toBe('')
  })
})
