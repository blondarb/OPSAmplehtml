'use client'

/**
 * HistorianRunsView — the /rnd/historian dashboard body.
 *
 * List + detail over historian_sessions (via /api/ai/historian/runs). Surfaces:
 *   - fleet metrics (completion rate, avg depth, red-flag rate, ...)
 *   - a question-count histogram + ended-early rate → makes the "cuts off
 *     ~Q14" pattern visible as data
 *   - per-run detail: full captured history + meds, differential WITH reasoning,
 *     red flags, narrative summary, and the transcript.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { INVESTIGATIONAL_BANNER } from '@/lib/historian/eval/constants'
import { PhysicianSummaryPanel, ThoroughnessPanel, SectionFeedback } from './reviewPanels'
import type {
  HistorianSession,
  HistorianStructuredOutput,
  HistorianRedFlag,
  HistorianTranscriptEntry,
} from '@/lib/historianTypes'

interface DifferentialEntry {
  diagnosis?: string
  name?: string
  icd10?: string | null
  confidence_note?: string
  rationale?: string
  evidence_against?: string
  likelihood?: 'high' | 'medium' | 'low'
  confidence?: 'high' | 'medium' | 'low'
}

interface ExcludedEntry {
  diagnosis?: string
  reason?: string
  evidence_quote?: string
}

interface RunRow extends Omit<HistorianSession, 'final_differential'> {
  final_differential?: import('@/lib/historian/eval/finalDifferential').FinalDifferentialRecord | null
  consult_id?: string | null
  localizer_differential?: DifferentialEntry[]
  localizer_excluded?: ExcludedEntry[]
  localizer_questions?: string[]
  localizer_hypothesis?: string | null
  localizer_kb_sources?: string[]
  localizer_last_run_at?: string | null
  localizer_run_count?: number | null
  // On-demand review artifacts (attached by /api/ai/historian/runs?id=).
  physician_summary?: Record<string, any> | null
  thoroughness?: Record<string, any> | null
  review_feedback?: Array<{ section: string; verdict: string; notes?: string | null; reviewer?: string; updated_at?: string }>
}

interface ResolvedDifferential {
  entries: DifferentialEntry[]
  source: 'localizer' | 'final'
  label: string
  summary?: string
  unassessed?: string[]
  dropped_exclusions?: number
  exclusion_audit_flags?: string[]
  /** Conditions considered and ruled out, with reasons (exclusion reasoning). */
  excluded?: ExcludedEntry[]
}

export function resolveDifferentials(run: RunRow): ResolvedDifferential[] {
  const sources: ResolvedDifferential[] = []
  if (Array.isArray(run.localizer_differential) && run.localizer_differential.length > 0) {
    sources.push({
      entries: run.localizer_differential,
      source: 'localizer',
      label: 'Live localizer',
      excluded: Array.isArray(run.localizer_excluded) ? run.localizer_excluded : [],
    })
  }
  const final = run.final_differential
  if (final && final.status === 'ok' && 'differential' in final && Array.isArray(final.differential) && (final.differential.length > 0 || final.excluded?.length || final.unassessed?.length || final.dropped_exclusions || final.exclusion_audit_flags?.length)) {
    sources.push({
      entries: final.differential.map((item) => ({
        diagnosis: item.diagnosis,
        icd10: item.icd10,
        rationale: item.rationale,
        ...(item.confidence_note ? { confidence_note: item.confidence_note } : {}),
        evidence_against: (item as any).evidence_against,
        likelihood: item.likelihood === 'Moderate' ? 'medium' : item.likelihood === 'High' ? 'high' : 'low',
      })),
      source: 'final',
      label: 'Post-interview eval',
      summary: final.summary,
      dropped_exclusions: final.dropped_exclusions ?? 0,
      exclusion_audit_flags: final.exclusion_audit_flags ?? [],
      excluded: Array.isArray(final.excluded) ? final.excluded.map((item) => ({
        diagnosis: item.diagnosis, reason: item.exclusion_reason, evidence_quote: item.evidence_quote,
      })) : [],
      ...(final.unassessed?.length ? { unassessed: final.unassessed } : {}),
    })
  }
  return sources
}

export function resolveEvaluationStatus(run: RunRow): string | null {
  const record = run.final_differential
  if (record?.status === 'pending' || record?.status === 'queued') {
    return `Post-interview analysis pending (since ${record.queued_at})`
  }
  if (record?.status === 'error') {
    return `Post-interview analysis failed (${record.error_class}) at ${record.provenance.generated_at}`
  }
  if (record?.status === 'insufficient_transcript') return 'Post-interview analysis unavailable (insufficient transcript)'
  return null
}

/** Auto-refresh window: how long after queuing a pending eval is worth polling for. */
export const PENDING_POLL_WINDOW_MS = 15 * 60 * 1000
/** Auto-refresh cadence while a recent pending eval exists. */
export const PENDING_POLL_INTERVAL_MS = 15 * 1000

/**
 * True when some run has a post-interview eval still queued (worker hasn't
 * replaced the `pending`/`queued` stub yet) AND that stub is recent enough
 * to be worth polling for — an eval that never resolved past the worker's
 * normal ~60-120s turnaround shouldn't poll forever.
 */
export function hasRecentPendingRun(runs: RunRow[], now: number = Date.now()): boolean {
  return runs.some((run) => {
    const record = run.final_differential
    if (!record || (record.status !== 'pending' && record.status !== 'queued')) return false
    const queuedAt = ('queued_at' in record ? record.queued_at : undefined) ?? run.created_at
    if (!queuedAt) return false
    const queuedAtMs = new Date(queuedAt).getTime()
    return Number.isFinite(queuedAtMs) && now - queuedAtMs < PENDING_POLL_WINDOW_MS
  })
}

interface Metrics {
  total: number
  completed: number
  ended_early: number
  completion_rate: number
  with_red_flags: number
  with_differential: number
  safety_escalated: number
  avg_question_count: number
  max_question_count: number
  avg_duration_seconds: number
  question_count_histogram: Record<string, number>
}

function fmtDuration(seconds: number): string {
  const s = Math.round(seconds || 0)
  const m = Math.floor(s / 60)
  const r = s % 60
  return m > 0 ? `${m}m ${r}s` : `${r}s`
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

// ─── Structured-output field layout (physician view) ────────────────────────
const HPI_FIELDS: Array<[keyof HistorianStructuredOutput, string]> = [
  ['chief_complaint', 'Chief Complaint'],
  ['hpi', 'History of Present Illness'],
  ['onset', 'Onset'],
  ['location', 'Location'],
  ['duration', 'Duration'],
  ['character', 'Character'],
  ['aggravating_factors', 'Aggravating Factors'],
  ['relieving_factors', 'Relieving Factors'],
  ['timing', 'Timing'],
  ['severity', 'Severity'],
  ['associated_symptoms', 'Associated Symptoms'],
]
const HISTORY_FIELDS: Array<[keyof HistorianStructuredOutput, string]> = [
  ['current_medications', 'Current Medications'],
  ['allergies', 'Allergies'],
  ['past_medical_history', 'Past Medical History'],
  ['past_surgical_history', 'Past Surgical History'],
  ['family_history', 'Family History'],
  ['social_history', 'Social History'],
  ['review_of_systems', 'Review of Systems'],
  ['functional_status', 'Functional Status'],
]
const FOLLOWUP_FIELDS: Array<[keyof HistorianStructuredOutput, string]> = [
  ['interval_changes', 'Interval Changes'],
  ['treatment_response', 'Treatment Response'],
  ['new_symptoms', 'New Symptoms'],
  ['medication_changes', 'Medication Changes'],
  ['side_effects', 'Side Effects'],
]

const likelihoodColor: Record<string, string> = {
  high: 'text-rose-300 bg-rose-500/15 border-rose-500/30',
  medium: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
  low: 'text-slate-300 bg-slate-500/15 border-slate-500/30',
}

export default function HistorianRunsView() {
  const [runs, setRuns] = useState<RunRow[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<RunRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/historian/runs')
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const data = await res.json()
      setRuns(data.runs || [])
      setMetrics(data.metrics || null)
    } catch (err: any) {
      setError(err?.message || 'Failed to load runs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Auto-refresh while a recent post-interview eval is still queued — the
  // worker (HISTORIAN_EVAL_MODE=queue) replaces the pending stub ~60-120s
  // after POST /save, and this view otherwise never re-fetches on its own.
  useEffect(() => {
    if (!hasRecentPendingRun(runs)) return undefined
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (!hasRecentPendingRun(runs)) {
        clearInterval(interval)
        return
      }
      void load()
    }, PENDING_POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [runs, load])

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-8 text-slate-200">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">Historian Runs</h1>
              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                R&amp;D
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Every AI Historian interview — depth, captured history, differential &amp; reasoning, transcript.
            </p>
          </div>
          <a
            href="/rnd/historian/simulator"
            className="rounded-lg border border-slate-800 px-3.5 py-2 text-sm text-slate-300 transition hover:bg-slate-900"
          >
            Simulator →
          </a>
          <button
            onClick={() => void load()}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-teal-500 hover:bg-slate-700"
          >
            Refresh
          </button>
        </header>

        {loading && <div className="py-20 text-center text-slate-400">Loading runs…</div>}
        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {metrics && <MetricsPanel metrics={metrics} />}
            {metrics && <CutoffPanel metrics={metrics} />}
            <RunsTable runs={runs} onSelect={setSelected} />
          </>
        )}
      </div>

      {selected && <RunDetailDrawer run={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

// ─── Metrics tiles ──────────────────────────────────────────────────────────
function MetricsPanel({ metrics }: { metrics: Metrics }) {
  const tiles: Array<{ label: string; value: string; accent?: string }> = [
    { label: 'Total Runs', value: String(metrics.total) },
    { label: 'Completion Rate', value: `${metrics.completion_rate}%`, accent: 'text-teal-300' },
    { label: 'Ended Early', value: String(metrics.ended_early), accent: metrics.ended_early > 0 ? 'text-amber-300' : undefined },
    { label: 'Avg Questions', value: String(metrics.avg_question_count) },
    { label: 'Max Questions', value: String(metrics.max_question_count) },
    { label: 'Avg Duration', value: fmtDuration(metrics.avg_duration_seconds) },
    { label: 'With Differential', value: String(metrics.with_differential) },
    { label: 'Red Flags', value: String(metrics.with_red_flags), accent: metrics.with_red_flags > 0 ? 'text-rose-300' : undefined },
  ]
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
          <div className={`text-2xl font-bold ${t.accent || 'text-white'}`}>{t.value}</div>
          <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">{t.label}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Cutoff / depth panel ───────────────────────────────────────────────────
function CutoffPanel({ metrics }: { metrics: Metrics }) {
  const entries = useMemo(
    () =>
      Object.entries(metrics.question_count_histogram).sort(
        (a, b) => Number(a[0].split('-')[0]) - Number(b[0].split('-')[0]),
      ),
    [metrics.question_count_histogram],
  )
  const max = Math.max(1, ...entries.map(([, n]) => n))
  const earlyRate = metrics.total ? Math.round((metrics.ended_early / metrics.total) * 100) : 0

  return (
    <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Interview Depth</h2>
        <span className="text-xs text-slate-400">
          {earlyRate}% ended early · avg {metrics.avg_question_count} Q · max {metrics.max_question_count} Q
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No runs yet.</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map(([bucket, count]) => (
            <div key={bucket} className="flex items-center gap-3">
              <div className="w-16 text-right text-xs tabular-nums text-slate-400">{bucket} Q</div>
              <div className="h-4 flex-1 overflow-hidden rounded bg-slate-800">
                <div
                  className="h-full rounded bg-teal-500/70"
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </div>
              <div className="w-8 text-xs tabular-nums text-slate-400">{count}</div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-500">
        Depth per interview. A cluster around a fixed count with a high &ldquo;ended early&rdquo; rate is the
        session-cutoff signature (target: deeper, complete interviews).
      </p>
    </div>
  )
}

// ─── Runs table ─────────────────────────────────────────────────────────────
export function patientLabel(run: RunRow): string {
  if (run.patient) return `${run.patient.first_name} ${run.patient.last_name}`.trim()
  if (!run.patient_name || run.patient_name === 'Unknown' || run.patient_name === 'Demo Patient') {
    return `Session ${run.id.slice(0, 8)}`
  }
  return run.patient_name
}

function CompletionBadge({ status }: { status: RunRow['interview_completion_status'] }) {
  if (status === 'complete')
    return <span className="rounded bg-teal-500/15 px-2 py-0.5 text-[11px] font-semibold text-teal-300">Complete</span>
  if (status === 'ended_early')
    return <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">Ended early</span>
  return <span className="rounded bg-slate-500/15 px-2 py-0.5 text-[11px] font-semibold text-slate-400">—</span>
}

export function RunsTable({ runs, onSelect }: { runs: RunRow[]; onSelect: (r: RunRow) => void }) {
  if (runs.length === 0) {
    return <div className="rounded-xl border border-slate-800 bg-slate-900/60 py-16 text-center text-slate-500">No runs found.</div>
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-900 text-left text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Date</th>
            <th className="px-4 py-2.5 font-semibold">Patient</th>
            <th className="px-4 py-2.5 font-semibold">Type</th>
            <th className="px-4 py-2.5 text-right font-semibold">Questions</th>
            <th className="px-4 py-2.5 text-right font-semibold">Duration</th>
            <th className="px-4 py-2.5 font-semibold">Status</th>
            <th className="px-4 py-2.5 font-semibold">Signals</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 bg-slate-900/40">
          {runs.map((run) => {
            const rf = Array.isArray(run.red_flags) ? run.red_flags.length : 0
            const sources = resolveDifferentials(run)
            const ddx = (sources.find(({ source }) => source === 'final') ?? sources[0])?.entries.length ?? 0
            const hasFinalSource = sources.some(({ source }) => source === 'final')
            const finalStatus = run.final_differential?.status
            return (
              <tr
                key={run.id}
                onClick={() => onSelect(run)}
                className="cursor-pointer transition hover:bg-slate-800/60"
              >
                <td className="px-4 py-2.5 text-slate-400">{fmtDate(run.created_at)}</td>
                <td className="px-4 py-2.5 font-medium text-slate-200">{patientLabel(run)}</td>
                <td className="px-4 py-2.5 text-slate-400">{run.session_type?.replace(/_/g, ' ')}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-200">{run.question_count ?? 0}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{fmtDuration(run.duration_seconds)}</td>
                <td className="px-4 py-2.5"><CompletionBadge status={run.interview_completion_status} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {rf > 0 && <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">{rf} red flag{rf > 1 ? 's' : ''}</span>}
                    {ddx > 0 && <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300">{ddx} ddx</span>}
                    {run.safety_escalated && <span className="rounded bg-rose-600/25 px-1.5 py-0.5 text-[10px] font-semibold text-rose-200">escalated</span>}
                    {!hasFinalSource && (finalStatus === 'pending' || finalStatus === 'queued') && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">analysis pending</span>
                    )}
                    {!hasFinalSource && finalStatus === 'error' && (
                      <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">analysis failed</span>
                    )}
                    {!hasFinalSource && finalStatus === 'insufficient_transcript' && (
                      <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">no analysis (short transcript)</span>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Run detail drawer ──────────────────────────────────────────────────────
function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-teal-400">{title}</h3>
      {children}
    </div>
  )
}

function FieldList({
  output,
  fields,
}: {
  output: HistorianStructuredOutput
  fields: Array<[keyof HistorianStructuredOutput, string]>
}) {
  const present = fields.filter(([k]) => {
    const v = output[k]
    return typeof v === 'string' && v.trim().length > 0
  })
  if (present.length === 0) return <p className="text-sm text-slate-500">Not captured.</p>
  return (
    <dl className="space-y-2.5">
      {present.map(([k, label]) => (
        <div key={String(k)}>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{output[k] as string}</dd>
        </div>
      ))}
    </dl>
  )
}

export function RunDetailDrawer({ run, onClose }: { run: RunRow; onClose: () => void }) {
  // Start with the list row, then fetch full detail by id — that's where the
  // on-demand review artifacts (physician summary, thoroughness, human
  // feedback) are attached (see /api/ai/historian/runs?id=).
  const [detail, setDetail] = useState<RunRow>(run)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewStage, setReviewStage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai/historian/runs?id=${encodeURIComponent(run.id)}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.run) setDetail(data.run)
    } catch {
      // keep the current detail on a transient fetch error
    }
  }, [run.id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // On-demand "Generate review": physician summary → thoroughness (each a single
  // gateway-sized call), then refresh so the panels render. Best-effort per
  // stage so one failing doesn't lose the other.
  const generateReview = useCallback(async (force: boolean) => {
    setReviewBusy(true)
    setReviewError(null)
    const errors: string[] = []
    setReviewStage('Writing physician summary…')
    try {
      const res = await fetch('/api/ai/historian/review/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: run.id, force }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        errors.push(`Summary: ${d.error || res.status}`)
      }
    } catch (err: any) {
      errors.push(`Summary: ${err?.message || 'failed'}`)
    }
    setReviewStage('Scoring thoroughness…')
    try {
      const res = await fetch('/api/ai/historian/review/thoroughness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: run.id, force }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        errors.push(`Thoroughness: ${d.error || res.status}`)
      }
    } catch (err: any) {
      errors.push(`Thoroughness: ${err?.message || 'failed'}`)
    }
    await refresh()
    setReviewStage(null)
    setReviewBusy(false)
    if (errors.length) setReviewError(errors.join(' · '))
  }, [run.id, refresh])

  // "Generate" reuses any persisted result (cheap re-click after a landed
  // persist); "Regenerate" forces a fresh Bedrock run.
  const onGenerate = useCallback(() => generateReview(hasReview), [generateReview, hasReview])

  const output = (detail.structured_output || {}) as HistorianStructuredOutput
  const redFlags: HistorianRedFlag[] = Array.isArray(detail.red_flags) ? detail.red_flags : []
  const differentials = resolveDifferentials(detail)
  const transcript: HistorianTranscriptEntry[] = Array.isArray(detail.transcript) ? detail.transcript : []
  const kbSources: string[] = Array.isArray(detail.localizer_kb_sources) ? detail.localizer_kb_sources : []
  const followUps: string[] = Array.isArray(detail.localizer_questions) ? detail.localizer_questions : []
  const feedback = Array.isArray(detail.review_feedback) ? detail.review_feedback : []
  const hasReview = !!detail.physician_summary || !!detail.thoroughness

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-800 bg-slate-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">{patientLabel(detail)}</h2>
            <p className="text-xs text-slate-400">
              {fmtDate(detail.created_at)} · {detail.session_type?.replace(/_/g, ' ')} · {detail.question_count ?? 0} questions ·{' '}
              {fmtDuration(detail.duration_seconds)}
            </p>
            <div className="mt-2">
              <CompletionBadge status={detail.interview_completion_status} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="mb-5 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">AI Review</h3>
              <p className="mt-0.5 text-xs text-slate-400">
                In-depth physician summary + thoroughness score for this interview — same review the simulator runs.
              </p>
            </div>
            <button
              onClick={() => void onGenerate()}
              disabled={reviewBusy || transcript.length < 2}
              className="shrink-0 rounded-lg border border-teal-600/50 bg-teal-500/10 px-3.5 py-2 text-sm font-semibold text-teal-200 transition hover:bg-teal-500/20 disabled:opacity-50"
            >
              {reviewBusy ? reviewStage || 'Generating…' : hasReview ? 'Regenerate review' : 'Generate review'}
            </button>
          </div>
          {reviewError && <p className="mt-2 text-xs text-rose-300">{reviewError}</p>}
          {transcript.length < 2 && (
            <p className="mt-2 text-xs text-slate-500">Transcript too short to review.</p>
          )}
        </div>

        {detail.physician_summary && (
          <Section title="Physician Summary">
            <PhysicianSummaryPanel summary={detail.physician_summary} />
            <SectionFeedback sessionId={run.id} section="physician_summary" existing={feedback} onSaved={() => void refresh()} />
          </Section>
        )}

        {detail.thoroughness && (
          <Section title="Thoroughness">
            <ThoroughnessPanel thoroughness={detail.thoroughness} />
            <SectionFeedback sessionId={run.id} section="thoroughness" existing={feedback} onSaved={() => void refresh()} />
          </Section>
        )}

        {redFlags.length > 0 && (
          <Section title="Red Flags">
            <div className="space-y-1.5">
              {redFlags.map((f, i) => (
                <div key={i} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                  <span className="mr-2 text-[10px] font-bold uppercase text-rose-300">[{f.severity}]</span>
                  {f.flag}
                  {f.context && <span className="text-rose-300"> — {f.context}</span>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {resolveEvaluationStatus(run) && (
          <div role="status" className="rounded-lg border border-slate-700 p-3 text-sm text-slate-300">
            {resolveEvaluationStatus(run)}
          </div>
        )}

        {differentials.map(({ entries: ddx, source, label, summary, excluded, unassessed, dropped_exclusions, exclusion_audit_flags }) => (
          <Section key={source} title={
            <>
              Differential Diagnosis &amp; Reasoning
              <span className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-slate-400">
                {label}
              </span>
            </>
          }>
            <div className="space-y-2">
              {ddx.map((d, i) => {
                const like = (d.likelihood || d.confidence || 'low') as string
                return (
                  <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-100">
                        {i + 1}. {d.diagnosis || d.name || 'Unknown'}
                        {d.icd10 && <span className="ml-2 text-xs font-normal text-slate-500">{d.icd10}</span>}
                      </span>
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${likelihoodColor[like] || likelihoodColor.low}`}>
                        {like}
                      </span>
                    </div>
                    {d.rationale && (
                      <p className="mt-1 text-sm leading-relaxed text-slate-300">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-teal-500/80">For · </span>
                        {d.rationale}
                      </p>
                    )}
                    {d.confidence_note && (
                      <p className="mt-1 text-xs text-amber-300">Confidence limited: {d.confidence_note}</p>
                    )}
                    {d.evidence_against && (
                      <p className="mt-1 text-sm leading-relaxed text-slate-400">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-500/80">Against · </span>
                        {d.evidence_against}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
            {Array.isArray(excluded) && (excluded.length > 0 || !!dropped_exclusions || !!exclusion_audit_flags?.length) && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{source === 'final' ? 'Considered and excluded (provisional)' : 'Considered & ruled out'}</div>
                {source === 'final' && <p className="mb-1 text-xs text-slate-500">{dropped_exclusions ?? 0} exclusion(s) dropped · {exclusion_audit_flags?.length ?? 0} exclusion audit flag(s)</p>}
                <div className="space-y-1.5">
                  {excluded.map((e, i) => (
                    <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
                      <div className={`text-sm font-medium text-slate-300 ${source === 'localizer' ? 'line-through decoration-slate-600' : ''}`}>{e.diagnosis}</div>
                      {e.evidence_quote && <p className="mt-1 text-xs text-slate-500">Evidence quote: “{e.evidence_quote}”</p>}
                      {e.reason && <div className="mt-0.5 text-xs text-slate-400">{source === 'localizer' ? 'Ruled out — ' : ''}{e.reason}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {unassessed && unassessed.length > 0 && (
              <div className="mt-3 text-sm text-slate-400">
                <h4 className="font-semibold">Not assessed in this interview</h4>
                <p className="mt-1 text-xs text-slate-500">Non-exhaustive keyword screen: no coverage hint detected; verify these possible gaps against the interview. Missing history is not evidence of absence.</p>
                <ul className="mt-1 list-disc pl-5">{unassessed.map((topic) => <li key={topic}>{topic}</li>)}</ul>
              </div>
            )}
            {source === 'final' && (
              <>
                {summary?.trim() && <p className="mt-2 text-sm text-slate-400">{summary}</p>}
                <p className="mt-2 text-xs text-slate-500">{INVESTIGATIONAL_BANNER}</p>
              </>
            )}
            {source === 'localizer' && detail.localizer_hypothesis && (
              <p className="mt-2 text-sm text-slate-400">
                <span className="font-semibold text-slate-300">Localization:</span> {detail.localizer_hypothesis}
              </p>
            )}
            {source === 'localizer' && followUps.length > 0 && (
              <div className="mt-2 text-sm text-slate-400">
                <span className="font-semibold text-slate-300">Suggested follow-ups:</span>
                <ul className="ml-4 mt-1 list-disc space-y-0.5">
                  {followUps.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </div>
            )}
            {source === 'localizer' && kbSources.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">Evidence: {kbSources.join(', ')}</p>
            )}
          </Section>
        ))}

        {differentials.length > 0 && (
          <div className="mb-5">
            <SectionFeedback sessionId={run.id} section="differential" existing={feedback} onSaved={() => void refresh()} />
          </div>
        )}

        {detail.narrative_summary && (
          <Section title="Narrative Summary">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{detail.narrative_summary}</p>
          </Section>
        )}

        <Section title="History of Present Illness">
          <FieldList output={output} fields={HPI_FIELDS} />
        </Section>

        <Section title="Medications & Background">
          <FieldList output={output} fields={HISTORY_FIELDS} />
        </Section>

        {FOLLOWUP_FIELDS.some(([k]) => {
          const v = output[k]
          return typeof v === 'string' && v.trim().length > 0
        }) && (
          <Section title="Follow-Up Details">
            <FieldList output={output} fields={FOLLOWUP_FIELDS} />
          </Section>
        )}

        {transcript.length > 0 && (
          <Section title={`Transcript (${transcript.length} turns)`}>
            <div className="space-y-2">
              {transcript.map((t, i) => (
                <div key={i} className="text-sm">
                  <span className={`font-semibold ${t.role === 'user' ? 'text-teal-300' : 'text-slate-400'}`}>
                    {t.role === 'user' ? 'Patient' : 'Historian'}:
                  </span>{' '}
                  <span className="text-slate-200">{t.text}</span>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}
