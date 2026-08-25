import { describe, expect, it } from 'vitest'

import { historianPatientCompletionPresentation } from '../../src/lib/historian/completionPresentation'

describe('historian patient completion presentation', () => {
  it('keeps the ordinary success message for a completed interview', () => {
    expect(historianPatientCompletionPresentation(false, 'coverage_complete')).toEqual({
      title: 'Interview Complete',
      body: 'Thank you for completing the intake interview. Your physician will review this information before your appointment.',
      tone: 'success',
    })
  })

  it.each(['provider_error', 'transport_lost'] as const)(
    'labels %s as a partial save rather than a complete interview',
    (reason) => {
      const presentation = historianPatientCompletionPresentation(true, reason)
      expect(presentation.title).toBe('Partial interview saved')
      expect(presentation.body).toContain('last confirmed turn')
      expect(presentation.body).toContain('saved')
      expect(presentation.tone).toBe('warning')
    },
  )

  it('explains an unresponsive end without claiming full completion', () => {
    const presentation = historianPatientCompletionPresentation(true, 'unresponsive')
    expect(presentation.title).toBe('Partial interview saved')
    expect(presentation.body).toContain('could no longer hear a response')
    expect(presentation.tone).toBe('warning')
  })
})
