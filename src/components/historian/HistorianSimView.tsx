'use client'

/**
 * HistorianSimView — the /rnd/historian/simulator dashboard body.
 *
 * Synthetic-patient simulator results: each persona is driven against Henry,
 * whose scored differential is graded against the persona's hidden ground-truth
 * diagnosis. Per persona, click in → tabbed detail (ground truth vs Henry's
 * scored differential, 2nd-opinion agreement, thoroughness, transcript, cost).
 *
 * Reads /api/ai/historian/sim/runs. Synthetic data only.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'

type Run = Record<string, any>
interface Metrics {
  total: number
  scored: number
  top1_hit_rate: number
  top3_hit_rate: number
  avg_thoroughness: number | null
  total_cost_usd: number
}
interface Batch {
  batch_id: string
  batch_label: string | null
  n: number
  created_at: string
}

function fmtCost(v: unknown): string {
  const n = Number(v)
  if (!Number.isFinite(n) || n === 0) return '—'
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`
}
function prettyPersona(id: string): string {
  return id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
function topDx(run: Run): { name: string; pct: number | null } | null {
  const d = run.final_differential?.differential?.[0]
  if (!d) return null
  return { name: d.diagnosis || 'Unknown', pct: typeof d.likelihood_pct === 'number' ? d.likelihood_pct : null }
}

export default function HistorianSimView() {
  const [runs, setRuns] = useState<Run[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Run | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/historian/sim/runs')
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const data = await res.json()
      setRuns(data.runs || [])
      setMetrics(data.metrics || null)
      setBatches(data.batches || [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load simulator runs')
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
              <h1 className="text-2xl font-semibold tracking-tight text-white">Historian Simulator</h1>
              <span className="rounded-full bg-teal-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-300">
                Synthetic
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              AI patients interviewed by Henry, graded against each case&apos;s true diagnosis.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/rnd/historian"
              className="rounded-lg border border-slate-800 px-3.5 py-2 text-sm text-slate-300 transition hover:bg-slate-900"
            >
              Live interviews →
            </a>
            <button
              onClick={() => void load()}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-teal-500 hover:bg-slate-700"
            >
              Refresh
            </button>
          </div>
        </header>

        {loading && <div className="py-20 text-center text-slate-400">Loading simulator runs…</div>}
        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
        )}

        {!loading && !error && runs.length === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-6 py-16 text-center">
            <p className="text-slate-300">No simulator runs yet.</p>
            <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">
              Run the batch harness, then import its report:
            </p>
            <pre className="mx-auto mt-3 max-w-lg overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-left text-xs text-slate-400">
{`npm run historian:eval -- --fixtures --live
# then POST the report json to:
#   /api/ai/historian/sim/import`}
            </pre>
          </div>
        )}

        {!loading && !error && runs.length > 0 && (
          <>
            {metrics && <SimMetrics metrics={metrics} batches={batches} />}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {runs.map((run) => (
                <PersonaCard key={run.id} run={run} onOpen={() => setSelected(run)} />
              ))}
            </div>
          </>
        )}
      </div>

      {selected && <SimDetailDrawer run={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

// ─── Metrics ────────────────────────────────────────────────────────────────
function SimMetrics({ metrics, batches }: { metrics: Metrics; batches: Batch[] }) {
  const tiles: Array<{ label: string; value: string; accent?: string }> = [
    { label: 'Personas', value: String(metrics.total) },
    { label: 'Top-1 hit rate', value: `${metrics.top1_hit_rate}%`, accent: 'text-teal-300' },
    { label: 'Top-3 hit rate', value: `${metrics.top3_hit_rate}%`, accent: 'text-teal-300' },
    { label: 'Avg thoroughness', value: metrics.avg_thoroughness == null ? '—' : `${metrics.avg_thoroughness}` },
    { label: 'Batch cost', value: fmtCost(metrics.total_cost_usd) },
  ]
  const latest = batches[0]
  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3.5">
            <div className={`text-2xl font-semibold ${t.accent || 'text-white'}`}>{t.value}</div>
            <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">{t.label}</div>
          </div>
        ))}
      </div>
      {latest && (
        <p className="mt-2 text-[11px] text-slate-500">
          Showing latest batch{latest.batch_label ? ` · ${latest.batch_label}` : ''} · {latest.n} personas
        </p>
      )}
    </div>
  )
}

// ─── Persona card ─────────────────────────────────────────────────────────────
function HitDot({ hit, label }: { hit: boolean | undefined; label: string }) {
  const on = hit === true
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        on ? 'bg-teal-500/15 text-teal-300' : 'bg-slate-700/40 text-slate-400'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-teal-400' : 'bg-slate-500'}`} />
      {label}
    </span>
  )
}

function PersonaCard({ run, onOpen }: { run: Run; onOpen: () => void }) {
  const gt = run.ground_truth
  const truth: string[] = Array.isArray(gt?.expectedCandidates) ? gt.expectedCandidates : []
  const top = topDx(run)
  return (
    <button
      onClick={onOpen}
      className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-left transition hover:border-teal-500/50 hover:bg-slate-900"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white">{prettyPersona(run.persona_id)}</span>
        <span className="text-[11px] text-slate-500">{fmtCost(run.cost_usd)}</span>
      </div>
      {run.personality?.label && (
        <span className="mt-1 w-fit rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
          {run.personality.label}
        </span>
      )}
      <div className="mt-2 text-[11px] uppercase tracking-wide text-slate-500">True diagnosis</div>
      <div className="text-sm text-slate-300">{truth[0] || '—'}</div>
      <div className="mt-2 text-[11px] uppercase tracking-wide text-slate-500">Henry&apos;s top call</div>
      <div className="text-sm text-slate-200">
        {top ? top.name : '—'}
        {top?.pct != null && <span className="ml-1.5 text-teal-300">{top.pct}%</span>}
      </div>
      <div className="mt-3 flex gap-1.5">
        <HitDot hit={gt?.pipeline?.top1Hit} label="Top-1" />
        <HitDot hit={gt?.pipeline?.top3Hit} label="Top-3" />
      </div>
    </button>
  )
}

// ─── Detail drawer (tabbed) ─────────────────────────────────────────────────
type Tab = 'truth' | 'differential' | 'agreement' | 'thoroughness' | 'transcript'

function SimDetailDrawer({ run, onClose }: { run: Run; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('truth')
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'truth', label: 'Case & ground truth' },
    { key: 'differential', label: "Henry's differential" },
    { key: 'agreement', label: '2nd opinion' },
    { key: 'thoroughness', label: 'Thoroughness' },
    { key: 'transcript', label: 'Transcript' },
  ]
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-800 bg-slate-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">{prettyPersona(run.persona_id)}</h2>
            <p className="text-xs text-slate-400">
              {run.chief_complaint || run.syndrome || 'Synthetic persona'} · {run.turn_count ?? 0} turns · {fmtCost(run.cost_usd)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800">
            Close
          </button>
        </div>

        <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-800">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition ${
                tab === t.key ? 'border-teal-500 text-teal-300' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'truth' && <TruthTab run={run} />}
        {tab === 'differential' && <DifferentialTab run={run} />}
        {tab === 'agreement' && <AgreementTab run={run} />}
        {tab === 'thoroughness' && <ThoroughnessTab run={run} />}
        {tab === 'transcript' && <TranscriptTab run={run} />}
      </div>
    </div>
  )
}

function SubHead({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-teal-400">{children}</h3>
}

function TruthTab({ run }: { run: Run }) {
  const gt = run.ground_truth
  const truth: string[] = Array.isArray(gt?.expectedCandidates) ? gt.expectedCandidates : []
  const belief = run.patient_belief as { suspected?: string; reasoning?: string; worry?: string } | null
  const personality = run.personality as { label?: string; description?: string } | null
  return (
    <div>
      {personality?.label && (
        <div className="mb-3 rounded-xl border border-violet-500/25 bg-violet-500/10 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-300">Personality</div>
          <div className="text-sm text-slate-100">{personality.label}</div>
          {personality.description && <div className="text-xs text-slate-400">{personality.description}</div>}
        </div>
      )}
      <SubHead>What the case is actually mimicking</SubHead>
      {truth.length ? (
        <ul className="space-y-1">
          {truth.map((d, i) => (
            <li key={i} className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">{d}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No ground-truth diagnoses recorded.</p>
      )}
      <SubHead>Did Henry catch it?</SubHead>
      <div className="flex gap-2">
        <HitDot hit={gt?.pipeline?.top1Hit} label="Top-1 hit" />
        <HitDot hit={gt?.pipeline?.top3Hit} label="Top-3 hit" />
      </div>
      {gt?.independent && (
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
          <span>Independent 2nd opinion:</span>
          <HitDot hit={gt.independent.top1Hit} label="Top-1" />
          <HitDot hit={gt.independent.top3Hit} label="Top-3" />
        </div>
      )}

      {belief && (belief.suspected || belief.reasoning || belief.worry) && (
        <>
          <SubHead>What the patient thinks it is</SubHead>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-sm">
            {belief.suspected && (
              <div className="text-slate-200">
                Suspects: <span className="font-medium text-white">{belief.suspected}</span>
              </div>
            )}
            {belief.reasoning && <div className="mt-1 text-slate-400">Because “{belief.reasoning}”</div>}
            {belief.worry && <div className="mt-1 text-amber-300/90">Worried that “{belief.worry}”</div>}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            The persona&apos;s lay belief — a distractor Henry must work past, not the true diagnosis above.
          </p>
        </>
      )}
    </div>
  )
}

function DiffItem({ d }: { d: any }) {
  const pct = typeof d.likelihood_pct === 'number' ? d.likelihood_pct : null
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-100">
          {d.diagnosis || 'Unknown'}
          {d.icd10 && <span className="ml-2 text-xs font-normal text-slate-500">{d.icd10}</span>}
        </span>
        {pct != null && <span className="text-xs font-semibold text-teal-300">{pct}%</span>}
      </div>
      {pct != null && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-teal-500/70" style={{ width: `${pct}%` }} />
        </div>
      )}
      {d.rationale && <p className="mt-2 text-sm leading-relaxed text-slate-300">{d.rationale}</p>}
      {Array.isArray(d.supporting_quotes) && d.supporting_quotes.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-teal-500/80">Supporting</div>
          {d.supporting_quotes.map((q: any, i: number) => (
            <p key={i} className="text-xs italic text-slate-400">“{q.quote}”</p>
          ))}
        </div>
      )}
      {Array.isArray(d.contradicting_quotes) && d.contradicting_quotes.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-500/80">Against</div>
          {d.contradicting_quotes.map((q: any, i: number) => (
            <p key={i} className="text-xs italic text-slate-400">“{q.quote}”</p>
          ))}
        </div>
      )}
    </div>
  )
}

function DifferentialTab({ run }: { run: Run }) {
  const fd = run.final_differential
  const items: any[] = Array.isArray(fd?.differential) ? fd.differential : []
  return (
    <div>
      {fd?.summary && (
        <>
          <SubHead>Physician summary</SubHead>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{fd.summary}</p>
        </>
      )}
      <SubHead>Scored differential ({items.length})</SubHead>
      {items.length ? (
        <div className="space-y-2">
          {items.map((d, i) => <DiffItem key={i} d={d} />)}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No differential recorded for this run.</p>
      )}
    </div>
  )
}

function AgreementTab({ run }: { run: Run }) {
  const ag = run.agreement
  const ind: any[] = Array.isArray(run.independent_ddx?.differential) ? run.independent_ddx.differential : []
  return (
    <div>
      <SubHead>Henry vs an independent model</SubHead>
      {ag ? (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-center">
            <div className="text-lg font-semibold text-white">{ag.top1Match ? 'Yes' : 'No'}</div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Top-1 match</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-center">
            <div className="text-lg font-semibold text-white">{ag.top3Overlap ?? '—'}/3</div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Top-3 overlap</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-center">
            <div className="text-lg font-semibold text-white">
              {typeof ag.jaccardTop3 === 'number' ? ag.jaccardTop3.toFixed(2) : '—'}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Jaccard</div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No agreement computed.</p>
      )}
      {Array.isArray(ag?.disagreements) && ag.disagreements.length > 0 && (
        <>
          <SubHead>Disagreements</SubHead>
          <ul className="space-y-1">
            {ag.disagreements.map((d: any, i: number) => (
              <li key={i} className="text-sm text-slate-300">{typeof d === 'string' ? d : JSON.stringify(d)}</li>
            ))}
          </ul>
        </>
      )}
      {ind.length > 0 && (
        <>
          <SubHead>Independent differential</SubHead>
          <div className="space-y-2">{ind.map((d, i) => <DiffItem key={i} d={d} />)}</div>
        </>
      )}
    </div>
  )
}

function ThoroughnessTab({ run }: { run: Run }) {
  const th = run.thoroughness
  if (!th) return <p className="text-sm text-slate-500">No thoroughness evaluation recorded.</p>
  const dimKeys = ['hpi_completeness', 'oldcarts', 'red_flags', 'pmh_meds_allergies', 'fh_sh', 'question_quality', 'closure']
  const dims = dimKeys
    .map((k) => ({ k, v: th[k] }))
    .filter((d) => d.v && typeof d.v === 'object')
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
        <>
          <SubHead>Dimension scores</SubHead>
          <div className="space-y-1.5">
            {dims.map(({ k, v }) => (
              <div key={k} className="flex items-center gap-3">
                <div className="w-40 text-xs text-slate-400">{k.replace(/_/g, ' ')}</div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-teal-500/70" style={{ width: `${Math.min(100, (Number(v.score) || 0) * 10)}%` }} />
                </div>
                <div className="w-8 text-right text-xs tabular-nums text-slate-300">{v.score ?? '—'}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {missed.length > 0 && (
        <>
          <SubHead>Missed critical questions</SubHead>
          <ul className="space-y-1">
            {missed.map((m, i) => (
              <li key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                <span className="mr-1.5 text-[10px] font-bold uppercase text-amber-300">[{m.severity}]</span>
                {m.why_it_matters || m.rubric_id}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function TranscriptTab({ run }: { run: Run }) {
  const tx: any[] = Array.isArray(run.transcript) ? run.transcript : []
  if (tx.length === 0) return <p className="text-sm text-slate-500">Transcript not captured for this run.</p>
  return (
    <div className="space-y-2">
      {tx.map((t, i) => (
        <div key={i} className="text-sm">
          <span className={`font-semibold ${t.role === 'user' ? 'text-teal-300' : 'text-slate-400'}`}>
            {t.role === 'user' ? 'Patient' : 'Henry'}:
          </span>{' '}
          <span className="text-slate-200">{t.text}</span>
        </div>
      ))}
    </div>
  )
}
