'use client'

/**
 * Shared review panels for the LIVE /rnd/historian dashboard — the same shapes
 * the AI-to-AI simulator renders, so a real interview's review looks identical
 * to a simulated one:
 *   - PhysicianSummaryPanel — one-liner + HPI + assessment + workup
 *   - ThoroughnessPanel     — overall + per-dimension bars + missed questions
 *   - SectionFeedback       — human-in-the-loop agree/disagree + notes
 */

import { useState } from 'react'

const DIM_KEYS = [
  'hpi_completeness',
  'oldcarts',
  'red_flags',
  'pmh_meds_allergies',
  'fh_sh',
  'question_quality',
  'closure',
]

export function PhysicianSummaryPanel({ summary }: { summary: any }) {
  if (!summary) return null
  return (
    <div>
      {summary.one_liner && (
        <p className="mb-2 text-sm font-medium leading-relaxed text-slate-100">{summary.one_liner}</p>
      )}
      {summary.hpi && (
        <div className="mb-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">HPI</div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{summary.hpi}</p>
        </div>
      )}
      {summary.assessment && (
        <div className="mb-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Assessment &amp; reasoning</div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{summary.assessment}</p>
        </div>
      )}
      {summary.workup && (
        <div className="mb-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Suggested workup</div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{summary.workup}</p>
        </div>
      )}
    </div>
  )
}

export function ThoroughnessPanel({ thoroughness }: { thoroughness: any }) {
  const th = thoroughness
  if (!th) return <p className="text-sm text-slate-500">No thoroughness evaluation recorded.</p>
  const dims = DIM_KEYS.map((k) => ({ k, v: th[k] })).filter((d) => d.v && typeof d.v === 'object')
  const missed: any[] = Array.isArray(th.missed_critical_questions) ? th.missed_critical_questions : []
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-semibold text-white">{typeof th.overall === 'number' ? th.overall : '—'}</span>
        <span className="text-sm text-slate-400">overall</span>
        {th.confidence?.level && (
          <span className="ml-auto rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] text-slate-300">
            {th.confidence.level} confidence
          </span>
        )}
      </div>
      {dims.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {dims.map(({ k, v }) => (
            <div key={k} className="flex items-center gap-3">
              <div className="w-40 text-xs text-slate-400">{k.replace(/_/g, ' ')}</div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-teal-500/70"
                  style={{ width: `${Math.min(100, (Number(v.score) || 0) * 10)}%` }}
                />
              </div>
              <div className="w-8 text-right text-xs tabular-nums text-slate-300">{v.score ?? '—'}</div>
            </div>
          ))}
        </div>
      )}
      {missed.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Missed critical questions</div>
          <ul className="space-y-1">
            {missed.map((m, i) => (
              <li key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                <span className="mr-1.5 text-[10px] font-bold uppercase text-amber-300">[{m.severity}]</span>
                {m.why_it_matters || m.rubric_id}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

interface FeedbackRow {
  section: string
  verdict: string
  notes?: string | null
  reviewer?: string
  updated_at?: string
}

/**
 * Human-in-the-loop control for one section. Shows any verdicts already
 * recorded (all reviewers) and lets the current reviewer submit/overwrite
 * their own agree/disagree + notes. Upsert is per (session, reviewer, section)
 * server-side, so re-submitting replaces this reviewer's prior verdict.
 */
export function SectionFeedback({
  sessionId,
  section,
  existing,
  onSaved,
}: {
  sessionId: string
  section: 'differential' | 'physician_summary' | 'thoroughness'
  existing: FeedbackRow[]
  onSaved: () => void
}) {
  const rows = existing.filter((r) => r.section === section)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState<'agree' | 'disagree' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async (verdict: 'agree' | 'disagree') => {
    setSaving(verdict)
    setError(null)
    try {
      const res = await fetch('/api/ai/historian/review/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, section, verdict, notes: notes.trim() || undefined }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `Save failed (${res.status})`)
      }
      setNotes('')
      onSaved()
    } catch (err: any) {
      setError(err?.message || 'Save failed')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reviewer verdict</div>
      {rows.length > 0 && (
        <div className="mb-2 space-y-1">
          {rows.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span
                className={`rounded px-1.5 py-0.5 font-semibold uppercase ${
                  r.verdict === 'agree'
                    ? 'bg-teal-500/15 text-teal-300'
                    : 'bg-rose-500/15 text-rose-300'
                }`}
              >
                {r.verdict}
              </span>
              <span className="text-slate-400">
                {r.reviewer ? `${r.reviewer.split('@')[0]}` : 'reviewer'}
                {r.notes ? <span className="text-slate-500"> — “{r.notes}”</span> : null}
              </span>
            </div>
          ))}
        </div>
      )}
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional notes for this section…"
        rows={2}
        className="w-full resize-none rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:border-teal-500 focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => void submit('agree')}
          disabled={saving !== null}
          className="rounded-lg border border-teal-600/50 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-teal-200 transition hover:bg-teal-500/20 disabled:opacity-50"
        >
          {saving === 'agree' ? 'Saving…' : '✓ Agree'}
        </button>
        <button
          onClick={() => void submit('disagree')}
          disabled={saving !== null}
          className="rounded-lg border border-rose-600/50 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
        >
          {saving === 'disagree' ? 'Saving…' : '✗ Disagree'}
        </button>
        {error && <span className="text-xs text-rose-300">{error}</span>}
      </div>
    </div>
  )
}
