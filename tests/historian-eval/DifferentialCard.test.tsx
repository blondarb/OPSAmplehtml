import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import DifferentialCard from '@/components/historian/DifferentialCard'
import { INVESTIGATIONAL_BANNER } from '@/lib/historian/eval/constants'
import type { FinalDifferential } from '@/lib/historian/eval/finalDifferential'

const SAMPLE: FinalDifferential = {
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
    {
      diagnosis: 'Tension-type headache',
      icd10: null,
      likelihood: 'Moderate',
      likelihood_pct: 25,
      rationale: 'Possible but less consistent with reported throbbing quality.',
      supporting_quotes: [],
      contradicting_quotes: [{ turn: 1, quote: 'throbbing headache' }],
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

describe('DifferentialCard', () => {
  it('always renders the investigational banner from the shared constant', () => {
    const markup = renderToStaticMarkup(<DifferentialCard finalDifferential={null} />)
    expect(markup).toContain(INVESTIGATIONAL_BANNER)
  })

  it('renders a pending state when finalDifferential is null', () => {
    const markup = renderToStaticMarkup(<DifferentialCard finalDifferential={null} />)
    expect(markup).toMatch(/pending/i)
    expect(markup).not.toContain('Migraine')
  })

  it('renders a pending state when finalDifferential is undefined', () => {
    const markup = renderToStaticMarkup(<DifferentialCard finalDifferential={undefined} />)
    expect(markup).toMatch(/pending/i)
  })

  it('renders ranked diagnoses, likelihood, rationale, and quotes when populated', () => {
    const markup = renderToStaticMarkup(<DifferentialCard finalDifferential={SAMPLE} />)
    expect(markup).toContain('Migraine without aura')
    expect(markup).toContain('G43.009')
    expect(markup).toContain('High')
    expect(markup).toContain('70%')
    expect(markup).toContain('Throbbing headache with nausea, no red flags.')
    expect(markup).toContain('Turn 1')
    expect(markup).toContain('I have had a throbbing headache for three days.')
    expect(markup).toContain('Tension-type headache')
    expect(markup).toContain('Subacute headache most consistent with migraine without aura.')
  })

  it('surfaces the dropped-quote count without ever rendering dropped quote text (none is known to the card)', () => {
    const withDrops: FinalDifferential = { ...SAMPLE, dropped_quotes: 2 }
    const markup = renderToStaticMarkup(<DifferentialCard finalDifferential={withDrops} />)
    expect(markup).toMatch(/2 quote\(s\) dropped/)
  })

  it('does not show the dropped-quote footnote when nothing was dropped', () => {
    const markup = renderToStaticMarkup(<DifferentialCard finalDifferential={SAMPLE} />)
    expect(markup).not.toMatch(/dropped/i)
  })

  it('renders provenance (model id + prompt version)', () => {
    const markup = renderToStaticMarkup(<DifferentialCard finalDifferential={SAMPLE} />)
    expect(markup).toContain('us.anthropic.claude-sonnet-4-6')
    expect(markup).toContain('final-ddx-v1')
  })

  it('handles an empty differential array distinctly from pending', () => {
    const empty: FinalDifferential = { ...SAMPLE, differential: [] }
    const markup = renderToStaticMarkup(<DifferentialCard finalDifferential={empty} />)
    expect(markup).toMatch(/no differential/i)
    expect(markup).not.toMatch(/pending/i)
  })

  it('renders a distinct insufficient-transcript note (not the generic empty-differential message) when status is insufficient_transcript', () => {
    const insufficient: FinalDifferential = {
      ...SAMPLE,
      differential: [],
      status: 'insufficient_transcript',
    }
    const markup = renderToStaticMarkup(<DifferentialCard finalDifferential={insufficient} />)
    expect(markup).toMatch(/insufficient transcript/i)
    expect(markup).not.toMatch(/no differential was generated/i)
    expect(markup).not.toMatch(/pending/i)
  })
})
