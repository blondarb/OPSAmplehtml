'use client'

import { useEffect, useMemo, useState } from 'react'
import { Rocket } from 'lucide-react'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { getLaunchpad, sortProjects } from '@/lib/launchpad/data'
import type {
  CardOpenItems,
  LaunchpadLink,
  LaunchpadProject,
  LinkKind,
  OpenItemsResponse,
} from '@/lib/launchpad/types'

const KIND_LABEL: Record<LinkKind, string> = {
  app: 'Live',
  test: 'Test',
  results: 'Results',
  admin: 'Admin',
  docs: 'Docs',
  download: 'Download',
  phone: 'Phone',
}

const KIND_STYLE: Record<LinkKind, string> = {
  app: 'border-teal-700/60 bg-teal-900/30 text-teal-200 hover:bg-teal-800/40',
  test: 'border-amber-700/60 bg-amber-900/30 text-amber-200 hover:bg-amber-800/40',
  results: 'border-sky-700/60 bg-sky-900/30 text-sky-200 hover:bg-sky-800/40',
  admin: 'border-violet-700/60 bg-violet-900/30 text-violet-200 hover:bg-violet-800/40',
  docs: 'border-slate-600 bg-slate-800/60 text-slate-200 hover:bg-slate-700/60',
  download: 'border-emerald-700/60 bg-emerald-900/30 text-emerald-200 hover:bg-emerald-800/40',
  phone: 'border-rose-700/60 bg-rose-900/30 text-rose-200 hover:bg-rose-800/40',
}

const STAGE_STYLE: Record<string, string> = {
  Frame: 'bg-slate-700 text-slate-200',
  Explore: 'bg-indigo-900/70 text-indigo-200',
  Validate: 'bg-amber-900/70 text-amber-200',
  Graduate: 'bg-emerald-900/70 text-emerald-200',
  Engineering: 'bg-cyan-900/70 text-cyan-200',
  Live: 'bg-green-800/70 text-green-100',
}

const PRIORITY_STYLE: Record<string, string> = {
  High: 'text-rose-300',
  Medium: 'text-amber-300',
  Low: 'text-slate-400',
}

function projectMatches(p: LaunchpadProject, q: string): boolean {
  if (!q) return true
  const hay = [
    p.name,
    p.id,
    p.stage,
    p.asana_card ?? '',
    ...p.repos,
    ...p.links.flatMap((l) => [l.label, l.url ?? '', l.display ?? '', l.note ?? '']),
  ]
    .join(' ')
    .toLowerCase()
  return hay.includes(q)
}

function LinkChip({ link }: { link: LaunchpadLink }) {
  const [copied, setCopied] = useState(false)
  const text = link.display ?? link.url ?? ''
  const copy = async () => {
    if (!link.url) return
    try {
      await navigator.clipboard.writeText(link.kind === 'phone' ? text : link.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard unavailable — the href still works */
    }
  }
  const title = [link.note, link.status ? `status: ${link.status}` : null, text]
    .filter(Boolean)
    .join(' · ')
  const base =
    'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors'
  const dim = link.status || !link.url ? 'opacity-70' : ''
  return (
    <span className="inline-flex items-stretch">
      {link.url ? (
        <a
          href={link.url}
          target={link.kind === 'phone' ? undefined : '_blank'}
          rel="noreferrer"
          title={title}
          className={`${base} ${KIND_STYLE[link.kind]} ${dim} rounded-r-none`}
        >
          <span className="uppercase tracking-wide text-[10px] opacity-70">
            {KIND_LABEL[link.kind]}
          </span>
          <span>{link.label}</span>
          {link.kind === 'phone' && <span className="font-mono">{text}</span>}
        </a>
      ) : (
        <span
          title={title}
          className={`${base} ${KIND_STYLE[link.kind]} ${dim} rounded-r-none cursor-help`}
        >
          <span className="uppercase tracking-wide text-[10px] opacity-70">
            {KIND_LABEL[link.kind]}
          </span>
          <span>{link.label}</span>
          <span className="italic opacity-70">— {link.status}</span>
        </span>
      )}
      <button
        type="button"
        onClick={copy}
        disabled={!link.url}
        aria-label={`Copy ${link.label}`}
        title="Copy link"
        className={`${base} ${KIND_STYLE[link.kind]} rounded-l-none border-l-0 px-1.5 disabled:opacity-30`}
      >
        {copied ? '✓' : '⧉'}
      </button>
    </span>
  )
}

function OpenItems({
  card,
  status,
  asanaUrl,
}: {
  card: CardOpenItems | undefined
  status: 'loading' | 'ok' | 'error' | 'none'
  asanaUrl: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  if (status === 'none') {
    return <p className="text-xs text-slate-500">No Asana card for this project.</p>
  }
  if (status === 'loading') {
    return <p className="text-xs text-slate-500">Loading open items…</p>
  }
  if (status === 'error' || !card) {
    return (
      <p className="text-xs text-slate-500">
        Open items unavailable.{' '}
        {asanaUrl && (
          <a href={asanaUrl} className="text-slate-400 underline hover:text-slate-300" target="_blank" rel="noreferrer">
            Open the card in Asana
          </a>
        )}
      </p>
    )
  }
  const shown = expanded ? card.open : card.open.slice(0, 4)
  const more = card.open.length - shown.length
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
        <span className={`font-semibold ${card.open_count ? 'text-amber-300' : 'text-emerald-300'}`}>
          {card.open_count} open
        </span>
        {card.section && <span>· {card.section}</span>}
        <span>· updated {card.modified_at.slice(0, 10)}</span>
        <a href={card.permalink_url} className="text-slate-400 underline hover:text-slate-200" target="_blank" rel="noreferrer">
          Asana
        </a>
      </div>
      {card.open_count > 0 && (
        <ul className="space-y-0.5 text-xs text-slate-300">
          {shown.map((item) => (
            <li key={item.gid} className="flex gap-2">
              <span className="text-slate-600">•</span>
              <a
                href={item.permalink_url}
                target="_blank"
                rel="noreferrer"
                className="text-slate-300 hover:text-white hover:underline"
              >
                {item.name}
              </a>
              {item.due_on && <span className="text-slate-500">({item.due_on})</span>}
            </li>
          ))}
          {more > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="text-slate-400 underline hover:text-slate-200"
              >
                +{more} more
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function ProjectCard({
  project,
  card,
  itemsStatus,
}: {
  project: LaunchpadProject
  card: CardOpenItems | undefined
  itemsStatus: 'loading' | 'ok' | 'error'
}) {
  const asanaUrl = card?.permalink_url ?? (project.asana_gid ? `https://app.asana.com/0/0/${project.asana_gid}` : null)
  const status = project.asana_gid ? itemsStatus : 'none'
  return (
    <article
      id={project.id}
      className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4 shadow-sm"
    >
      <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold text-white">
          <a href={`#${project.id}`} className="text-white hover:underline">
            {project.name}
          </a>
        </h2>
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${STAGE_STYLE[project.stage] ?? ''}`}>
          {project.stage}
        </span>
        <span className={`text-[11px] font-semibold ${PRIORITY_STYLE[project.priority]}`}>
          {project.priority} priority
        </span>
        <span className="ml-auto flex gap-2 text-xs text-slate-400">
          {project.repos.map((r) => (
            <a key={r} href={r} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-200 hover:underline">
              {r.replace('https://github.com/', '')}
            </a>
          ))}
        </span>
      </header>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {project.links.map((l) => (
          <LinkChip key={`${l.kind}:${l.label}`} link={l} />
        ))}
      </div>
      <OpenItems card={card} status={status} asanaUrl={asanaUrl} />
    </article>
  )
}

export default function LaunchpadView() {
  const data = getLaunchpad()
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<OpenItemsResponse | null>(null)
  const [itemsStatus, setItemsStatus] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    fetch('/api/launchpad/open-items', { cache: 'no-store' })
      .then(async (r) => {
        const body = (await r.json()) as Partial<OpenItemsResponse> & { error?: string }
        if (typeof body.ok === 'boolean') return body as OpenItemsResponse
        return {
          ok: false as const,
          fetched_at: new Date().toISOString(),
          reason: 'asana_error' as const,
          message:
            r.status === 401
              ? 'sign in to app.neuroplans.app to see open items'
              : body.error ?? `HTTP ${r.status}`,
        }
      })
      .then((body) => {
        if (cancelled) return
        setItems(body)
        setItemsStatus(body.ok ? 'ok' : 'error')
      })
      .catch(() => {
        if (!cancelled) setItemsStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const projects = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sortProjects(data.projects).filter((p) => projectMatches(p, q))
  }, [data.projects, query])

  const cards = items?.ok ? items.cards : {}
  const totalOpen = items?.ok
    ? Object.values(items.cards).reduce((n, c) => n + c.open_count, 0)
    : null
  const linkCount = data.projects.reduce((n, p) => n + p.links.length, 0)

  return (
    <PlatformShell>
      <FeatureSubHeader title="Launchpad" icon={Rocket} accentColor="#0D9488" showDemo={false} />
      <div
        className="min-h-screen px-6 py-6"
        style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)' }}
      >
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
            <span>
              <strong className="text-white">{data.projects.length}</strong> projects
            </span>
            <span>
              <strong className="text-white">{linkCount}</strong> links
            </span>
            <span>
              {totalOpen === null ? (
                <span className="text-slate-500">
                  open items {itemsStatus === 'loading' ? 'loading…' : 'unavailable'}
                </span>
              ) : (
                <>
                  <strong className="text-amber-300">{totalOpen}</strong> open items across Asana
                </>
              )}
            </span>
            <span className="text-slate-500">· inventory {data._meta.updated}</span>
            <span className="ml-auto flex gap-3 text-xs">
              <a href={data._meta.asana_portfolio} target="_blank" rel="noreferrer" className="text-teal-300 hover:underline">
                Asana Portfolio
              </a>
              <a href={data._meta.asana_team_ops} target="_blank" rel="noreferrer" className="text-teal-300 hover:underline">
                Team Ops
              </a>
              <a href={data._meta.asana_pipeline} target="_blank" rel="noreferrer" className="text-teal-300 hover:underline">
                Innovation Pipeline
              </a>
              <a href={data._meta.sharepoint} target="_blank" rel="noreferrer" className="text-teal-300 hover:underline">
                SharePoint
              </a>
            </span>
          </div>

          {items && !items.ok && (
            <div className="rounded-lg border border-amber-900/60 bg-amber-950/40 px-4 py-2 text-xs text-amber-200">
              Live open-items pull is off: {items.message}
            </div>
          )}

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter projects, links, URLs…"
            className="w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-teal-500 focus:outline-none"
          />

          <div className="space-y-3">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                card={p.asana_gid ? cards[p.asana_gid] : undefined}
                itemsStatus={itemsStatus}
              />
            ))}
            {projects.length === 0 && (
              <p className="text-sm text-slate-500">Nothing matches “{query}”.</p>
            )}
          </div>

          <details className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-2 text-xs text-slate-400">
            <summary className="cursor-pointer select-none text-slate-300">
              Logins, and hosts that no longer exist
            </summary>
            <div className="mt-2 space-y-2">
              <div>
                <p className="mb-1 font-semibold text-slate-300">Login pools</p>
                <ul className="space-y-0.5">
                  {Object.entries(data._meta.login_pools).map(([k, v]) => (
                    <li key={k}>
                      <span className="font-mono text-slate-200">{k}</span> — {v}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 font-semibold text-slate-300">Dead or retired</p>
                <ul className="space-y-0.5">
                  {data.dead_or_retired.map((d) => (
                    <li key={d.url}>
                      <span className="font-mono line-through text-slate-500">{d.url}</span> — {d.note}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-slate-500">
                Inventory lives in <span className="font-mono">src/data/launchpad.json</span>; open items come from
                each project&apos;s Asana Portfolio card.
              </p>
            </div>
          </details>
        </div>
      </div>
    </PlatformShell>
  )
}
