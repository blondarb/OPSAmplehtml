import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import HistorianReportView from '@/components/HistorianReportView'
import { INVESTIGATIONAL_BANNER } from '@/lib/historian/eval/constants'
import type { FinalDifferential } from '@/lib/historian/eval/finalDifferential'
import type { IndependentDifferential } from '@/lib/historian/eval/independentDdx'
import type { AgreementResult } from '@/lib/historian/eval/agreement'

/**
 * Structural guard test (Historian Validation Suite design spec locked
 * decision L1: DDx/thoroughness content is physician/QA-facing ONLY, never
 * patient-facing). Before this fix, the unauthenticated patient page
 * (/patient/historian -> NeurologicHistorian -> HistorianReportView) was
 * kept safe only by NeurologicHistorian.tsx happening not to pass these
 * props — a comment, not a structural guarantee. These tests populate the
 * props DELIBERATELY (something a future bug could do) and assert the
 * cards still never render on surface="patient", while surface="physician"
 * with the identical props DOES render them — proving the gate is the
 * `surface` prop itself, not prop-presence.
 */

const FINAL_DIFFERENTIAL: FinalDifferential = {
  differential: [
    {
      diagnosis: 'Migraine without aura',
      icd10: 'G43.009',
      likelihood: 'High',
      likelihood_pct: 70,
      rationale: 'Throbbing headache with nausea, no red flags.',
      supporting_quotes: [{ turn: 1, quote: 'I have had a throbbing headache for three days.' }],
      contradicting_quotes: [],
    },
  ],
  summary: 'Subacute headache most consistent with migraine without aura.',
  provenance: {
    model_id: 'us.anthropic.claude-sonnet-4-6',
    prompt_version: 'final-ddx-v1',
    inference_params: { temperature: 0 },
    generated_at: '2026-07-20T12:00:00.000Z',
  },
  dropped_quotes: 0,
  status: 'ok',
}

const INDEPENDENT_DDX: IndependentDifferential = {
  differential: [
    {
      diagnosis: 'Migraine without aura',
      icd10: 'G43.009',
      likelihood: 'High',
      likelihood_pct: 65,
      rationale: 'Independent R1 pass — throbbing headache, no red flags.',
      supporting_quotes: [],
      contradicting_quotes: [],
    },
  ],
  summary: 'Independent differential agrees with the pipeline pass.',
  provenance: {
    model_id: 'us.deepseek.r1-v1:0',
    prompt_version: 'independent-ddx-r1-v1',
    inference_params: { temperature: 0.6 },
    generated_at: '2026-07-20T12:01:00.000Z',
  },
  dropped_quotes: 0,
  stop_reason: 'stop',
  retried: false,
}

const AGREEMENT: AgreementResult = {
  top1Match: true,
  top3Overlap: 1,
  jaccardTop3: 1,
  matchedPairs: [{ a: 'Migraine without aura', b: 'Migraine without aura', via: 'icd10' }],
  disagreements: [],
}

const BASE_PROPS = {
  structuredOutput: null,
  narrativeSummary: 'Patient reports a three-day throbbing headache with nausea.',
  redFlags: [],
  duration: 300,
  questionCount: 8,
  onStartAnother: () => {},
  onBackToPortal: () => {},
}

describe('HistorianReportView — surface guard (design spec L1)', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('surface="patient" with populated DDx props renders NO differential/DDx card, even though the data is present', () => {
    const markup = renderToStaticMarkup(
      <HistorianReportView
        {...BASE_PROPS}
        surface="patient"
        finalDifferential={FINAL_DIFFERENTIAL}
        independentDdx={INDEPENDENT_DDX}
        agreement={AGREEMENT}
      />,
    )

    // INVESTIGATIONAL_BANNER is rendered ONLY by DifferentialCard/
    // DdxComparisonCard (constants.ts) — its absence proves neither card
    // rendered at all, not merely that they rendered empty.
    expect(markup).not.toContain(INVESTIGATIONAL_BANNER)
    expect(markup).not.toContain('Migraine without aura')
    expect(markup).not.toContain('Top-1 Match')
  })

  it('surface="physician" with the same populated props DOES render the differential/DDx cards', () => {
    const markup = renderToStaticMarkup(
      <HistorianReportView
        {...BASE_PROPS}
        surface="physician"
        finalDifferential={FINAL_DIFFERENTIAL}
        independentDdx={INDEPENDENT_DDX}
        agreement={AGREEMENT}
      />,
    )

    expect(markup).toContain(INVESTIGATIONAL_BANNER)
    expect(markup).toContain('Migraine without aura')
    expect(markup).toContain('Top-1 Match')
  })

  it('logs a SURFACE VIOLATION (no patient text) when surface="patient" but DDx props are populated', () => {
    renderToStaticMarkup(
      <HistorianReportView
        {...BASE_PROPS}
        surface="patient"
        finalDifferential={FINAL_DIFFERENTIAL}
        independentDdx={INDEPENDENT_DDX}
        agreement={AGREEMENT}
      />,
    )

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    const [message] = consoleErrorSpy.mock.calls[0]
    expect(String(message)).toContain('SURFACE VIOLATION')
    expect(String(message)).not.toContain('Migraine')
    expect(String(message)).not.toContain(BASE_PROPS.narrativeSummary)
  })

  it('does not log a violation for a normal, well-behaved patient render with no DDx props set', () => {
    renderToStaticMarkup(<HistorianReportView {...BASE_PROPS} surface="patient" />)
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('does not log a violation on the physician surface even though the props are populated (that is expected there)', () => {
    renderToStaticMarkup(
      <HistorianReportView
        {...BASE_PROPS}
        surface="physician"
        finalDifferential={FINAL_DIFFERENTIAL}
        independentDdx={INDEPENDENT_DDX}
        agreement={AGREEMENT}
      />,
    )
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })
})
