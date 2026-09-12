import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { patientLabel, resolveDifferentials, RunDetailDrawer } from '@/components/historian/HistorianRunsView'
import { INVESTIGATIONAL_BANNER } from '@/lib/historian/eval/constants'
import type { FinalDifferential } from '@/lib/historian/eval/finalDifferential'

type RunRow = Parameters<typeof resolveDifferentials>[0]

const finalDifferential: FinalDifferential = {
  differential: (['High', 'Moderate', 'Low'] as const).map((likelihood, i) => ({
    diagnosis: `Synthetic diagnosis ${i + 1}`,
    icd10: null,
    likelihood,
    likelihood_pct: [60, 30, 10][i],
    rationale: `Synthetic rationale ${i + 1}`,
    supporting_quotes: [],
    contradicting_quotes: [],
  })),
  summary: 'Synthetic post-interview summary.',
  provenance: {
    model_id: 'synthetic-test-model',
    prompt_version: 'final-ddx-v1',
    inference_params: { temperature: 0 },
    generated_at: '2026-09-05T12:00:00.000Z',
  },
  dropped_quotes: 0,
  status: 'ok',
}

function makeRun(overrides: Partial<RunRow> = {}): RunRow {
  return {
    id: '12345678-0000-4000-8000-000000000000',
    tenant_id: 'synthetic',
    patient_id: null,
    patient_name: 'Demo Patient',
    session_type: 'new_patient',
    referral_reason: null,
    structured_output: null,
    narrative_summary: null,
    transcript: [],
    red_flags: [],
    safety_escalated: false,
    duration_seconds: 120,
    question_count: 10,
    status: 'completed',
    reviewed: false,
    imported_to_note: false,
    created_at: '2026-09-05T12:00:00.000Z',
    updated_at: '2026-09-05T12:00:00.000Z',
    localizer_differential: [],
    ...overrides,
  }
}

// The differential now lives on its own tab; render that tab so these
// differential-focused assertions see its markup (renderToStaticMarkup can't click).
const render = (run: RunRow) => renderToStaticMarkup(<RunDetailDrawer run={run} onClose={() => {}} initialTab="differential" />)

describe('runs view differential', () => {
  it('renders the final differential, mapped likelihoods, summary and investigational label', () => {
    const run = makeRun({ final_differential: finalDifferential })
    expect(resolveDifferentials(run)).toEqual([{
      source: 'final',
      label: 'Post-interview eval',
      summary: finalDifferential.summary,
      excluded: [],
      dropped_exclusions: 0,
      exclusion_audit_flags: [],
      entries: finalDifferential.differential.map((item, i) => ({
        diagnosis: item.diagnosis,
        icd10: item.icd10,
        rationale: item.rationale,
        likelihood: ['high', 'medium', 'low'][i],
      })),
    }])
    const markup = render(run)
    for (const item of finalDifferential.differential) {
      expect(markup).toContain(item.diagnosis)
      expect(markup).toContain(item.rationale)
    }
    expect(markup).toContain('Post-interview eval')
    expect(markup).toContain(finalDifferential.summary)
    expect(markup).toContain(INVESTIGATIONAL_BANNER)
    expect(markup).toContain('text-amber-300')
  })

  it('renders v2 confidence notes, excluded evidence and deterministic gaps', () => {
    const v2 = { ...finalDifferential,
      provenance: { ...finalDifferential.provenance, prompt_version: 'final-ddx-v2' },
      differential: [{ ...finalDifferential.differential[0], confidence_note: 'Time course needs verification' }],
      excluded: [{ diagnosis: 'Synthetic alternative', exclusion_reason: 'Synthetic source reason', evidence_quote: 'Synthetic verbatim evidence' }],
      unassessed: ['time course'],
    }
    const markup = render(makeRun({ final_differential: v2 }))
    for (const text of ['Time course needs verification', 'Synthetic alternative', 'Synthetic source reason', 'Synthetic verbatim evidence', 'Not assessed in this interview', 'time course']) expect(markup).toContain(text)
    const legacy = render(makeRun({ final_differential: finalDifferential }))
    expect(legacy).not.toContain('Not assessed in this interview')
    expect(legacy).not.toContain('Confidence limited:')
    expect(render(makeRun({ final_differential: { ...v2, differential: [] } }))).toContain('Not assessed in this interview')
  })

  it('renders both sources in order and preserves localizer extras', () => {
    const localizer = [{ diagnosis: 'Synthetic localizer diagnosis', confidence: 'high' as const }]
    const run = makeRun({
      final_differential: finalDifferential,
      localizer_differential: localizer,
      localizer_hypothesis: 'Synthetic localization',
      localizer_questions: ['Synthetic follow-up'],
      localizer_kb_sources: ['Synthetic evidence'],
    })
    expect(resolveDifferentials(run).map(({ source }) => source)).toEqual(['localizer', 'final'])
    expect(resolveDifferentials(run)[0]).toEqual({ entries: localizer, source: 'localizer', label: 'Live localizer', excluded: [] })
    const markup = render(run)
    for (const text of ['Live localizer', 'Synthetic localizer diagnosis', 'Synthetic localization', 'Synthetic follow-up', 'Synthetic evidence']) {
      expect(markup).toContain(text)
    }
    expect(markup).toContain('Post-interview eval')
    expect(markup).toContain(finalDifferential.differential[0].diagnosis)
    expect(markup).toContain(finalDifferential.summary)
    expect(markup).toContain(INVESTIGATIONAL_BANNER)
    expect(markup.indexOf('Live localizer')).toBeLessThan(markup.indexOf('Post-interview eval'))
  })

  it('hides localizer extras when the source is final and omits an empty summary', () => {
    const markup = render(makeRun({
      final_differential: { ...finalDifferential, summary: '' },
      localizer_hypothesis: 'Stale localization',
      localizer_questions: ['Stale follow-up'],
      localizer_kb_sources: ['Stale evidence'],
    }))
    expect(markup).not.toContain('Stale')
    expect(markup).not.toContain('<p class="mt-2 text-sm text-slate-400">')
    expect(markup).toContain(INVESTIGATIONAL_BANNER)
  })

  it.each([undefined, null, { ...finalDifferential, differential: [] }])('hides the section without entries (%s)', (final) => {
    const run = makeRun({ final_differential: final })
    expect(resolveDifferentials(run)).toEqual([])
    expect(render(run)).not.toContain('Differential Diagnosis')
  })
})

describe('patientLabel', () => {
  it.each(['Demo Patient', 'Unknown', ''])('uses a non-PHI session code for %s', (patient_name) => {
    expect(patientLabel(makeRun({ patient_name }))).toBe('Session 12345678')
  })

  it('preserves the linked patient name', () => {
    expect(patientLabel(makeRun({
      patient: { id: 'synthetic', first_name: 'Synthetic', last_name: 'Person', mrn: 'synthetic' },
    }))).toBe('Synthetic Person')
  })

  it('preserves other unlinked labels', () => {
    expect(patientLabel(makeRun({ patient_name: 'Synthetic custom label' }))).toBe('Synthetic custom label')
  })
})

it('hides post-interview sections for insufficient records even with legacy gaps', () => {
  const run = makeRun({ final_differential: { ...finalDifferential, status: 'insufficient_transcript', differential: [], unassessed: ['Fever assessment'] } })
  expect(resolveDifferentials(run)).toEqual([])
  expect(render(run)).not.toContain('Post-interview eval')
  expect(render(run)).not.toContain('Not assessed in this interview')
})
it('renders dropped exclusions even when every exclusion was removed, plus audit count', () => {
  const run = makeRun({ final_differential: { ...finalDifferential, differential: [], excluded: [], dropped_exclusions: 2, exclusion_audit_flags: ['Synthetic'], unassessed: ['When did symptoms start?'] } })
  const markup = render(run)
  expect(markup).toContain('2 exclusion(s) dropped')
  expect(markup).toContain('1 exclusion audit flag(s)')
  expect(markup).toContain('When did symptoms start?')
})
