/**
 * Live "what's still open" for the launchpad, pulled from Asana.
 *
 * Each project on /launchpad points at its Sevaro Labs Portfolio card. The
 * card's incomplete subtasks ARE the roadmap, so we read them at request time
 * instead of copying status into launchpad.json where it would go stale.
 *
 * Token resolution (first hit wins):
 *   1. ASANA_PAT env var (local dev, or an Amplify runtime env fallback)
 *   2. Secrets Manager `sevaro/asana/pat` (production; plain string or {token})
 * With no token the page still renders — only the open-items column is empty
 * and the API says why. Nothing here touches PHI: card and subtask titles only.
 */

import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager'
import type { CardOpenItems, OpenItem, OpenItemsResponse } from './types'

const ASANA_API = 'https://app.asana.com/api/1.0'
const DEFAULT_SECRET_ID = 'sevaro/asana/pat'
const TOKEN_CACHE_MS = 5 * 60_000
const RESULT_CACHE_MS = 2 * 60_000

type FetchLike = typeof fetch

interface AsanaTask {
  gid: string
  name: string
  permalink_url: string
  modified_at: string
  memberships?: Array<{ section?: { name?: string } | null }>
}

interface AsanaSubtask {
  gid: string
  name: string
  completed: boolean
  due_on: string | null
  permalink_url: string
}

let tokenCache: { value: string; at: number } | null = null
let resultCache: { key: string; value: OpenItemsResponse; at: number } | null = null

/** Test hook — clears module caches between cases. */
export function _resetLaunchpadAsanaCaches(): void {
  tokenCache = null
  resultCache = null
}

function parseSecretString(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  if (s.startsWith('{')) {
    try {
      const parsed = JSON.parse(s) as Record<string, unknown>
      for (const key of ['token', 'pat', 'access_token']) {
        const v = parsed[key]
        if (typeof v === 'string' && v.trim()) return v.trim()
      }
      return ''
    } catch {
      return ''
    }
  }
  return s
}

export async function resolveAsanaToken(): Promise<string> {
  const fromEnv = process.env.ASANA_PAT?.trim()
  if (fromEnv) return fromEnv
  if (tokenCache && Date.now() - tokenCache.at < TOKEN_CACHE_MS) return tokenCache.value
  // Outside production the env var is the only source — never hit AWS from a
  // unit test or a laptop without credentials.
  if (process.env.NODE_ENV !== 'production') return ''
  try {
    const client = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-2',
    })
    const out = await client.send(
      new GetSecretValueCommand({
        SecretId: process.env.ASANA_PAT_SECRET_ID || DEFAULT_SECRET_ID,
      }),
    )
    const value = parseSecretString(out.SecretString ?? '')
    tokenCache = { value, at: Date.now() }
    return value
  } catch {
    tokenCache = { value: '', at: Date.now() }
    return ''
  }
}

async function asanaGet<T>(
  path: string,
  token: string,
  fetchImpl: FetchLike,
): Promise<T> {
  const res = await fetchImpl(`${ASANA_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`asana ${path} → ${res.status}`)
  const body = (await res.json()) as { data: T }
  return body.data
}

async function fetchCard(
  gid: string,
  token: string,
  fetchImpl: FetchLike,
): Promise<CardOpenItems> {
  const [task, subtasks] = await Promise.all([
    asanaGet<AsanaTask>(
      `/tasks/${gid}?opt_fields=name,permalink_url,modified_at,memberships.section.name`,
      token,
      fetchImpl,
    ),
    asanaGet<AsanaSubtask[]>(
      `/tasks/${gid}/subtasks?opt_fields=name,completed,due_on,permalink_url&limit=100`,
      token,
      fetchImpl,
    ),
  ])
  const open: OpenItem[] = subtasks
    .filter((s) => !s.completed)
    .map((s) => ({
      gid: s.gid,
      name: s.name,
      due_on: s.due_on ?? null,
      permalink_url: s.permalink_url,
    }))
  return {
    gid: task.gid,
    name: task.name,
    permalink_url: task.permalink_url,
    section: task.memberships?.[0]?.section?.name ?? null,
    modified_at: task.modified_at,
    open_count: open.length,
    open,
  }
}

export interface FetchOpenItemsOptions {
  token?: string
  fetchImpl?: FetchLike
  /** Bypass the in-memory result cache (tests). */
  noCache?: boolean
}

export async function fetchOpenItems(
  gids: string[],
  opts: FetchOpenItemsOptions = {},
): Promise<OpenItemsResponse> {
  const fetched_at = new Date().toISOString()
  const key = [...gids].sort().join(',')
  if (!opts.noCache && resultCache && resultCache.key === key) {
    if (Date.now() - resultCache.at < RESULT_CACHE_MS) return resultCache.value
  }
  const token = opts.token ?? (await resolveAsanaToken())
  if (!token) {
    return {
      ok: false,
      fetched_at,
      reason: 'no_token',
      message:
        'No Asana token: set ASANA_PAT, or grant the SSR role read on sevaro/asana/pat.',
    }
  }
  const fetchImpl = opts.fetchImpl ?? fetch
  try {
    const cards = await Promise.all(gids.map((g) => fetchCard(g, token, fetchImpl)))
    const value: OpenItemsResponse = {
      ok: true,
      fetched_at,
      cards: Object.fromEntries(cards.map((c) => [c.gid, c])),
    }
    if (!opts.noCache) resultCache = { key, value, at: Date.now() }
    return value
  } catch (err) {
    return {
      ok: false,
      fetched_at,
      reason: 'asana_error',
      message: err instanceof Error ? err.message : 'Asana request failed',
    }
  }
}
