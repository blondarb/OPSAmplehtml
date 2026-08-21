import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import HistoryCoverageCard from '@/components/historian/HistoryCoverageCard'
import { COMPREHENSIVE_HISTORY_DOMAINS } from '@/lib/historianTypes'

describe('HistoryCoverageCard', () => {
  it('shows covered, gap, and unaudited counts without claiming clinical completeness', () => {
    const markup = renderToStaticMarkup(
      <HistoryCoverageCard
        coverage={{
          covered_domains: ['referral_reason', 'patient_reported_age', 'presenting_symptom'],
          missing_or_uncertain: [{ domain: 'medications', reason: 'unknown' }],
        }}
        ageYearsPatientReported={67}
      />,
    )

    expect(markup).toContain('Model-recorded coverage audit — physician verification required')
    expect(markup).toContain('Patient-reported age')
    expect(markup).toContain('>67<')
    expect(markup).toContain('Patient unsure')
    expect(markup).toContain(`>${COMPREHENSIVE_HISTORY_DOMAINS.length - 4}<`)
    expect(markup).not.toMatch(/clinically complete|100% complete/i)
  })

  it('marks the audit complete only when every fixed domain is classified', () => {
    const markup = renderToStaticMarkup(
      <HistoryCoverageCard
        coverage={{
          covered_domains: COMPREHENSIVE_HISTORY_DOMAINS.map(({ id }) => id),
          missing_or_uncertain: [],
        }}
      />,
    )

    expect(markup).toContain('Audit complete')
    expect(markup).toContain('>17<')
    expect(markup).toContain('>0<')
  })
})
