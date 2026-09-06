/**
 * Launchpad — the internal project index at /launchpad.
 *
 * Shape of src/data/launchpad.json (the source of truth for every place the
 * team needs to reach: live apps, test pages, results pages, installers, the
 * Kiran dev phone line). Status ("what's still open") is NOT stored here — it
 * is pulled live from each project's Asana Portfolio card via
 * /api/launchpad/open-items, so the file only changes when a URL does.
 */

export const LINK_KINDS = [
  'app',
  'test',
  'results',
  'admin',
  'docs',
  'download',
  'phone',
] as const
export type LinkKind = (typeof LINK_KINDS)[number]

export const STAGES = [
  'Frame',
  'Explore',
  'Validate',
  'Graduate',
  'Engineering',
  'Live',
] as const
export type Stage = (typeof STAGES)[number]

export const PRIORITIES = ['High', 'Medium', 'Low'] as const
export type Priority = (typeof PRIORITIES)[number]

export interface LaunchpadLink {
  label: string
  /** Absolute URL, tel: URI, or null when the destination is not yet known. */
  url: string | null
  kind: LinkKind
  /** Key into _meta.login_pools, or 'none' / 'unknown'. */
  auth: string
  /** Human-readable form (used for phone numbers). */
  display?: string | null
  note?: string | null
  /** Free-text status flag, e.g. "unverified". Null when the link is known good. */
  status?: string | null
}

export interface LaunchpadProject {
  id: string
  name: string
  stage: Stage
  priority: Priority
  /** Exact Asana Portfolio card title, or null when the project has no card. */
  asana_card: string | null
  /** Asana task gid for the Portfolio card; drives the live open-items pull. */
  asana_gid?: string
  repos: string[]
  links: LaunchpadLink[]
}

export interface DeadHost {
  url: string
  note: string
}

export interface LaunchpadMeta {
  purpose: string
  canonical?: string
  updated: string
  login_pools: Record<string, string>
  asana_portfolio: string
  asana_team_ops: string
  asana_pipeline: string
  sharepoint: string
}

export interface LaunchpadData {
  _meta: LaunchpadMeta
  projects: LaunchpadProject[]
  dead_or_retired: DeadHost[]
}

/** One incomplete roadmap subtask on an Asana Portfolio card. */
export interface OpenItem {
  gid: string
  name: string
  due_on: string | null
  permalink_url: string
}

/** Live status for one Portfolio card. */
export interface CardOpenItems {
  gid: string
  name: string
  permalink_url: string
  section: string | null
  modified_at: string
  open_count: number
  open: OpenItem[]
}

export type OpenItemsResponse =
  | { ok: true; fetched_at: string; cards: Record<string, CardOpenItems> }
  | {
      ok: false
      fetched_at: string
      reason: 'no_token' | 'asana_error'
      message: string
    }
