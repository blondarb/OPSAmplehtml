import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import InsufficientDataPanel from '../InsufficientDataPanel'

/**
 * Production incident 2026-08-05: a transient failure of OUR independent
 * safety-model check collapsed a complete, textbook referral to this exact
 * panel, telling the referring provider their note lacked information. That
 * was false — the note was not thin, our own model call failed. This suite
 * locks in the fix: the panel must tell the physician the true cause, and
 * must never ask a referring provider for information we never actually
 * determined was missing.
 */

describe('InsufficientDataPanel', () => {
  it('renders the genuine-thin-referral copy unchanged when there is no internal failure', () => {
    const html = renderToStaticMarkup(
      createElement(InsufficientDataPanel, {
        missingInformation: ['Synthetic onset time is missing.'],
      }),
    )

    expect(html).toContain('Return to referring provider for clarification')
    expect(html).toContain(
      'This referral does not contain enough clinical information to triage safely.',
    )
    expect(html).toContain(
      'Consider returning to the referring provider requesting the following:',
    )
    expect(html).toContain('Synthetic onset time is missing.')
    expect(html).not.toContain('independent safety review')
  })

  it('does not blame the referral when the hold is caused by an internal safety-check failure with no named gap', () => {
    const html = renderToStaticMarkup(
      createElement(InsufficientDataPanel, {
        missingInformation: [
          'Referral information is insufficient for a safe outpatient disposition.',
        ],
        internalFailure: true,
        hasGenuineMissingItems: false,
      }),
    )

    expect(html).not.toContain(
      'This referral does not contain enough clinical information to triage safely.',
    )
    expect(html).not.toContain(
      'Consider returning to the referring provider requesting the following:',
    )
    expect(html).not.toContain('Return to referring provider for clarification')
    expect(html).not.toContain(
      'Referral information is insufficient for a safe outpatient disposition.',
    )
    expect(html).toContain('Our independent safety review could not be completed')
    expect(html).toContain('internal system issue')
    expect(html).toContain('Manual clinician review is required')
  })

  it('reports both causes truthfully when the referral is genuinely thin AND the safety check failed', () => {
    const html = renderToStaticMarkup(
      createElement(InsufficientDataPanel, {
        missingInformation: ['Synthetic anticoagulation status is missing.'],
        internalFailure: true,
        hasGenuineMissingItems: true,
      }),
    )

    expect(html).toContain(
      'This referral does not contain enough clinical information to triage safely.',
    )
    expect(html).toContain('Synthetic anticoagulation status is missing.')
    expect(html).toContain('Our independent safety review could not be completed')
  })

  it('keeps a clinician-review requirement visible even without color', () => {
    const html = renderToStaticMarkup(
      createElement(InsufficientDataPanel, {
        missingInformation: [],
        internalFailure: true,
        hasGenuineMissingItems: false,
      }),
    )

    expect(html).toContain('Independent safety check incomplete')
    expect(html).toContain('clinician review required')
  })
})
