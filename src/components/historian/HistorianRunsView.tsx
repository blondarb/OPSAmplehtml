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
  rationale?: string
  likelihood?: 'high' | 'medium' | 'low'
  confidence?: 'high' | 'medium' | 'low'
}

interface RunRow extends HistorianSession {
  consult_id?: string | null
  localizer_differential?: DifferentialEntry[]
  localizer_questions?: string[]
  localizer_hypothesis?: string | null
  localizer_kb_sources?: string[]
  localizer_last_run_at?: string | null
  localizer_run_count?: number | null
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
function patientLabel(run: RunRow): string {
  if (run.patient) return `${run.patient.first_name} ${run.patient.last_name}`.trim()
  return run.patient_name || 'Unknown'
}

function CompletionBadge({ status }: { status: RunRow['interview_completion_status'] }) {
  if (status === 'complete')
    return <span className="rounded bg-teal-500/15 px-2 py-0.5 text-[11px] font-semibold text-teal-300">Complete</span>
  if (status === 'ended_early')
    return <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">Ended early</span>
  return <span className="rounded bg-slate-500/15 px-2 py-0.5 text-[11px] font-semibold text-slate-400">—</span>
}

function RunsTable({ runs, onSelect }: { runs: RunRow[]; onSelect: (r: RunRow) => void }) {
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
            const ddx = Array.isArray(run.localizer_differential) ? run.localizer_differential.length : 0
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
function Section({ title, children }: { title: string; children: ReactNode }) {
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

function RunDetailDrawer({ run, onClose }: { run: RunRow; onClose: () => void }) {
  const output = (run.structured_output || {}) as HistorianStructuredOutput
  const redFlags: HistorianRedFlag[] = Array.isArray(run.red_flags) ? run.red_flags : []
  const ddx: DifferentialEntry[] = Array.isArray(run.localizer_differential) ? run.localizer_differential : []
  const transcript: HistorianTranscriptEntry[] = Array.isArray(run.transcript) ? run.transcript : []
  const kbSources: string[] = Array.isArray(run.localizer_kb_sources) ? run.localizer_kb_sources : []
  const followUps: string[] = Array.isArray(run.localizer_questions) ? run.localizer_questions : []

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-800 bg-slate-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">{patientLabel(run)}</h2>
            <p className="text-xs text-slate-400">
              {fmtDate(run.created_at)} · {run.session_type?.replace(/_/g, ' ')} · {run.question_count ?? 0} questions ·{' '}
              {fmtDuration(run.duration_seconds)}
            </p>
            <div className="mt-2">
              <CompletionBadge status={run.interview_completion_status} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
          >
            Close
          </button>
        </div>

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

        {ddx.length > 0 && (
          <Section title="Differential Diagnosis & Reasoning">
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
                    {d.rationale && <p className="mt-1 text-sm leading-relaxed text-slate-300">{d.rationale}</p>}
                  </div>
                )
              })}
            </div>
            {run.localizer_hypothesis && (
              <p className="mt-2 text-sm text-slate-400">
                <span className="font-semibold text-slate-300">Localization:</span> {run.localizer_hypothesis}
              </p>
            )}
            {followUps.length > 0 && (
              <div className="mt-2 text-sm text-slate-400">
                <span className="font-semibold text-slate-300">Suggested follow-ups:</span>
                <ul className="ml-4 mt-1 list-disc space-y-0.5">
                  {followUps.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </div>
            )}
            {kbSources.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">Evidence: {kbSources.join(', ')}</p>
            )}
          </Section>
        )}

        {run.narrative_summary && (
          <Section title="Narrative Summary">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{run.narrative_summary}</p>
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
