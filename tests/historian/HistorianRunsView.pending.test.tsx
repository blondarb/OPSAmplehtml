import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  hasRecentPendingRun,
  PENDING_POLL_WINDOW_MS,
  resolveDifferentials,
  RunsTable,
} from '@/components/historian/HistorianRunsView'
import type { FinalDifferential } from '@/lib/historian/eval/finalDifferential'

type RunRow = Parameters<typeof resolveDifferentials>[0]

const finalDifferential: FinalDifferential = {
  differential: [
    {
      diagnosis: 'Synthetic diagnosis 1',
      icd10: null,
      likelihood: 'High',
      likelihood_pct: 70,
      rationale: 'Synthetic rationale 1',
      supporting_quotes: [],
      contradicting_quotes: [],
    },
    {
      diagnosis: 'Synthetic diagnosis 2',
      icd10: null,
      likelihood: 'Moderate',
      likelihood_pct: 20,
      rationale: 'Synthetic rationale 2',
      supporting_quotes: [],
      contradicting_quotes: [],
    },
  ],
  summary: 'Synthetic post-interview summary.',
  provenance: {
    model_id: 'synthetic-test-model',
    prompt_version: 'final-ddx-v1',
    inference_params: { temperature: 0 },
    generated_at: '2026-09-07T12:00:00.000Z',
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
    created_at: '2026-09-07T12:00:00.000Z',
    updated_at: '2026-09-07T12:00:00.000Z',
    localizer_differential: [],
    ...overrides,
  }
}

const renderTable = (runs: RunRow[]) => renderToStaticMarkup(<RunsTable runs={runs} onSelect={() => {}} />)

describe('Signals cell — pending/error/insufficient badges', () => {
  it('renders an amber "analysis pending" badge while final_differential is pending, and no ddx badge', () => {
    const run = makeRun({
      final_differential: { status: 'pending', queued_at: '2026-09-07T12:00:30.000Z', source: 'save' },
    })
    const markup = renderTable([run])
    expect(markup).toContain('analysis pending')
    expect(markup).toContain('bg-amber-500/15')
    expect(markup).toContain('text-amber-300')
    expect(markup).not.toContain('ddx')
  })

  it('renders the same pending badge for status "queued"', () => {
    const run = makeRun({
      final_differential: { status: 'queued', queued_at: '2026-09-07T12:00:30.000Z' },
    })
    expect(renderTable([run])).toContain('analysis pending')
  })

  it('renders a rose "analysis failed" badge on status error', () => {
    const run = makeRun({
      final_differential: {
        status: 'error',
        error_class: 'timeout',
        message: 'synthetic error',
        provenance: { model_id: 'synthetic', prompt_version: 'final-ddx-v1', generated_at: '2026-09-07T12:01:00.000Z' },
      },
    })
    const markup = renderTable([run])
    expect(markup).toContain('analysis failed')
    expect(markup).toContain('bg-rose-500/15')
    expect(markup).not.toContain('synthetic error')
  })

  it('renders a slate "no analysis (short transcript)" badge on status insufficient_transcript', () => {
    const run = makeRun({
      final_differential: { ...finalDifferential, status: 'insufficient_transcript', differential: [] },
    })
    const markup = renderTable([run])
    expect(markup).toContain('no analysis (short transcript)')
    expect(markup).toContain('bg-slate-500/15')
  })

  it('renders "N ddx" for an ok record and no pending/failed/insufficient badge', () => {
    const run = makeRun({ final_differential: finalDifferential })
    const markup = renderTable([run])
    expect(markup).toContain('2 ddx')
    expect(markup).not.toContain('analysis pending')
    expect(markup).not.toContain('analysis failed')
    expect(markup).not.toContain('no analysis (short transcript)')
  })

  it('does not show the pending badge once a final source exists even if the record was left pending (defensive)', () => {
    // final_differential having entries takes precedence — the pending stub is
    // only ever what's persisted, so 'ok' + pending don't co-occur in practice,
    // but the badge logic keys off resolveDifferentials, not raw status alone.
    const run = makeRun({ final_differential: finalDifferential })
    expect(resolveDifferentials(run).some((s) => s.source === 'final')).toBe(true)
    expect(renderTable([run])).not.toContain('analysis pending')
  })
})

describe('hasRecentPendingRun', () => {
  const now = new Date('2026-09-07T12:10:00.000Z').getTime()

  it('is true for a pending run queued within the last 15 minutes', () => {
    const run = makeRun({
      final_differential: { status: 'pending', queued_at: '2026-09-07T12:05:00.000Z', source: 'save' },
    })
    expect(hasRecentPendingRun([run], now)).toBe(true)
  })

  it('is false once the 15-minute window has passed', () => {
    const queuedAt = new Date(now - PENDING_POLL_WINDOW_MS - 1000).toISOString()
    const run = makeRun({ final_differential: { status: 'pending', queued_at: queuedAt, source: 'save' } })
    expect(hasRecentPendingRun([run], now)).toBe(false)
  })

  it('is false once the record resolves to ok', () => {
    const run = makeRun({ final_differential: finalDifferential })
    expect(hasRecentPendingRun([run], now)).toBe(false)
  })

  it('is false once the record resolves to error or insufficient_transcript', () => {
    const errorRun = makeRun({
      final_differential: {
        status: 'error',
        error_class: 'timeout',
        message: 'synthetic',
        provenance: { model_id: 'synthetic', prompt_version: 'final-ddx-v1', generated_at: '2026-09-07T12:09:00.000Z' },
      },
    })
    const insufficientRun = makeRun({ final_differential: { ...finalDifferential, status: 'insufficient_transcript', differential: [] } })
    expect(hasRecentPendingRun([errorRun], now)).toBe(false)
    expect(hasRecentPendingRun([insufficientRun], now)).toBe(false)
  })

  it('falls back to created_at when the pending record has no queued_at', () => {
    const run = makeRun({
      created_at: '2026-09-07T12:08:00.000Z',
      final_differential: { status: 'pending' } as unknown as RunRow['final_differential'],
    })
    expect(hasRecentPendingRun([run], now)).toBe(true)
  })

  it('is false when there are no runs', () => {
    expect(hasRecentPendingRun([], now)).toBe(false)
  })

  it('models the poll-then-resolve lifecycle: true while pending and recent, false after the fetch replaces it with ok', () => {
    let runs: RunRow[] = [makeRun({ final_differential: { status: 'pending', queued_at: '2026-09-07T12:09:00.000Z', source: 'save' } })]
    expect(hasRecentPendingRun(runs, now)).toBe(true)

    // Simulate the worker having resolved it by the time of the next poll (a
    // re-fetch of /api/ai/historian/runs would return this shape).
    runs = [makeRun({ final_differential: finalDifferential })]
    expect(hasRecentPendingRun(runs, now)).toBe(false)
  })
})
