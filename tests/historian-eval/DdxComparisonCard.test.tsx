import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import DdxComparisonCard from '@/components/historian/DdxComparisonCard'
import { INVESTIGATIONAL_BANNER } from '@/lib/historian/eval/constants'
import type { FinalDifferential } from '@/lib/historian/eval/finalDifferential'
import type { IndependentDifferential } from '@/lib/historian/eval/independentDdx'
import type { AgreementResult } from '@/lib/historian/eval/agreement'

const PIPELINE: FinalDifferential = {
  differential: [
    {
      diagnosis: 'Migraine without aura',
      icd10: 'G43.009',
      likelihood: 'High',
      likelihood_pct: 70,
      rationale: 'Throbbing headache with nausea, no red flags.',
      supporting_quotes: [{ turn: 1, quote: 'throbbing headache for three days' }],
      contradicting_quotes: [],
    },
  ],
  summary: 'Most consistent with migraine.',
  provenance: {
    model_id: 'us.anthropic.claude-sonnet-4-6',
    prompt_version: 'final-ddx-v1',
    inference_params: {},
    generated_at: '2026-07-21T12:00:00.000Z',
  },
  dropped_quotes: 0,
  status: 'ok',
}

const INDEPENDENT: IndependentDifferential = {
  differential: [
    {
      diagnosis: 'Tension-type headache',
      icd10: 'G44.209',
      likelihood: 'Moderate',
      likelihood_pct: 40,
      rationale: 'Also plausible given the description.',
      supporting_quotes: [],
      contradicting_quotes: [],
    },
  ],
  summary: 'Independent read favors tension headache.',
  provenance: {
    model_id: 'us.deepseek.r1-v1:0',
    prompt_version: 'independent-ddx-r1-v1',
    inference_params: {},
    generated_at: '2026-07-21T12:05:00.000Z',
  },
  dropped_quotes: 0,
  stop_reason: 'stop',
  retried: false,
}

const AGREEING: AgreementResult = {
  top1Match: true,
  top3Overlap: 1,
  jaccardTop3: 1,
  matchedPairs: [{ a: 'Migraine without aura', b: 'Migraine without aura', via: 'icd10' }],
  disagreements: [],
}

const DISAGREEING: AgreementResult = {
  top1Match: false,
  top3Overlap: 0,
  jaccardTop3: 0,
  matchedPairs: [],
  disagreements: [
    'Only in pipeline differential: Migraine without aura',
    'Only in independent differential: Tension-type headache',
  ],
}

describe('DdxComparisonCard', () => {
  it('always renders the investigational banner from the shared constant', () => {
    const markup = renderToStaticMarkup(
      <DdxComparisonCard finalDifferential={null} independentDdx={null} agreement={null} />,
    )
    expect(markup).toContain(INVESTIGATIONAL_BANNER)
  })

  it('renders pending states for both columns and the agreement badge when everything is null', () => {
    const markup = renderToStaticMarkup(
      <DdxComparisonCard finalDifferential={null} independentDdx={null} agreement={null} />,
    )
    expect(markup).toMatch(/pipeline differential pending/i)
    expect(markup).toMatch(/independent differential pending/i)
    expect(markup).toMatch(/agreement pending/i)
  })

  it('renders pending states for undefined props too', () => {
    const markup = renderToStaticMarkup(
      <DdxComparisonCard finalDifferential={undefined} independentDdx={undefined} agreement={undefined} />,
    )
    expect(markup).toMatch(/pending/i)
  })

  it('renders both differentials side by side once populated', () => {
    const markup = renderToStaticMarkup(
      <DdxComparisonCard finalDifferential={PIPELINE} independentDdx={INDEPENDENT} agreement={AGREEING} />,
    )
    expect(markup).toContain('Migraine without aura')
    expect(markup).toContain('Tension-type headache')
    expect(markup).toContain('G43.009')
    expect(markup).toContain('G44.209')
    expect(markup).toContain('Sonnet')
    expect(markup).toContain('DeepSeek-R1')
  })

  it('shows a Top-1 Match badge and no disagreement flag when agreement.top1Match is true and there are no disagreements', () => {
    const markup = renderToStaticMarkup(
      <DdxComparisonCard finalDifferential={PIPELINE} independentDdx={INDEPENDENT} agreement={AGREEING} />,
    )
    expect(markup).toContain('Top-1 Match')
    expect(markup).not.toMatch(/cross-model disagreement/i)
  })

  it('shows the disagreement flag with the listed disagreements when agreement.top1Match is false', () => {
    const markup = renderToStaticMarkup(
      <DdxComparisonCard finalDifferential={PIPELINE} independentDdx={INDEPENDENT} agreement={DISAGREEING} />,
    )
    expect(markup).toMatch(/cross-model disagreement/i)
    expect(markup).toContain('Top-1 Disagreement')
    expect(markup).toContain('Only in pipeline differential: Migraine without aura')
    expect(markup).toContain('Only in independent differential: Tension-type headache')
  })

  it('renders top-3 overlap and jaccard percentage in the agreement badge', () => {
    const markup = renderToStaticMarkup(
      <DdxComparisonCard finalDifferential={PIPELINE} independentDdx={INDEPENDENT} agreement={AGREEING} />,
    )
    expect(markup).toContain('Top-3 overlap 1/3')
    expect(markup).toContain('Jaccard 100%')
  })

  it('renders provenance for both columns', () => {
    const markup = renderToStaticMarkup(
      <DdxComparisonCard finalDifferential={PIPELINE} independentDdx={INDEPENDENT} agreement={AGREEING} />,
    )
    expect(markup).toContain('us.anthropic.claude-sonnet-4-6')
    expect(markup).toContain('final-ddx-v1')
    expect(markup).toContain('us.deepseek.r1-v1:0')
    expect(markup).toContain('independent-ddx-r1-v1')
  })

  it('handles an empty differential array on either side distinctly from pending', () => {
    const emptyPipeline: FinalDifferential = { ...PIPELINE, differential: [] }
    const markup = renderToStaticMarkup(
      <DdxComparisonCard finalDifferential={emptyPipeline} independentDdx={INDEPENDENT} agreement={null} />,
    )
    expect(markup).toMatch(/no differential was generated/i)
    expect(markup).not.toMatch(/pipeline differential pending/i)
  })

  it('renders a supporting-quote turn chip for a cited item', () => {
    const markup = renderToStaticMarkup(
      <DdxComparisonCard finalDifferential={PIPELINE} independentDdx={INDEPENDENT} agreement={AGREEING} />,
    )
    expect(markup).toContain('Turn 1')
  })
})
