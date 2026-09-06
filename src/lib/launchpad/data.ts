import raw from '@/data/launchpad.json'
import {
  LINK_KINDS,
  PRIORITIES,
  STAGES,
  type LaunchpadData,
  type LaunchpadProject,
} from './types'

const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
const STAGE_RANK: Record<string, number> = Object.fromEntries(
  STAGES.map((s, i) => [s, i]),
)

/**
 * Validate the inventory file. Throws with a precise message so a bad edit to
 * launchpad.json fails `pnpm test` (and the build) instead of rendering a
 * half-broken page. Keep the checks structural — the point is catching typos
 * in kind/stage/auth keys, not policing content.
 */
export function validateLaunchpad(data: unknown): LaunchpadData {
  if (!data || typeof data !== 'object') throw new Error('launchpad: not an object')
  const d = data as LaunchpadData
  if (!d._meta?.login_pools) throw new Error('launchpad: _meta.login_pools missing')
  if (!Array.isArray(d.projects)) throw new Error('launchpad: projects missing')
  if (!Array.isArray(d.dead_or_retired)) throw new Error('launchpad: dead_or_retired missing')

  const pools = new Set([...Object.keys(d._meta.login_pools), 'none', 'unknown'])
  const ids = new Set<string>()
  for (const p of d.projects) {
    if (!p.id || ids.has(p.id)) throw new Error(`launchpad: duplicate/empty id "${p.id}"`)
    ids.add(p.id)
    if (!STAGES.includes(p.stage)) throw new Error(`launchpad[${p.id}]: bad stage "${p.stage}"`)
    if (!PRIORITIES.includes(p.priority)) {
      throw new Error(`launchpad[${p.id}]: bad priority "${p.priority}"`)
    }
    if (p.asana_gid !== undefined && !/^\d+$/.test(p.asana_gid)) {
      throw new Error(`launchpad[${p.id}]: asana_gid must be numeric`)
    }
    if (!Array.isArray(p.repos) || !Array.isArray(p.links)) {
      throw new Error(`launchpad[${p.id}]: repos/links must be arrays`)
    }
    for (const l of p.links) {
      if (!l.label) throw new Error(`launchpad[${p.id}]: link without label`)
      if (!LINK_KINDS.includes(l.kind)) {
        throw new Error(`launchpad[${p.id}/${l.label}]: bad kind "${l.kind}"`)
      }
      if (!pools.has(l.auth)) {
        throw new Error(`launchpad[${p.id}/${l.label}]: unknown auth "${l.auth}"`)
      }
      if (l.url !== null && !/^(https?:\/\/|tel:)/.test(l.url)) {
        throw new Error(`launchpad[${p.id}/${l.label}]: url must be https/http/tel or null`)
      }
      if (l.url === null && !l.status) {
        throw new Error(`launchpad[${p.id}/${l.label}]: null url needs a status explaining why`)
      }
    }
  }
  return d
}

let cached: LaunchpadData | null = null

export function getLaunchpad(): LaunchpadData {
  if (!cached) cached = validateLaunchpad(raw)
  return cached
}

/** High priority first, then the most mature stage first (Live → Frame), then name. */
export function sortProjects(projects: LaunchpadProject[]): LaunchpadProject[] {
  return [...projects].sort((a, b) => {
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    if (pr !== 0) return pr
    const st = STAGE_RANK[b.stage] - STAGE_RANK[a.stage]
    if (st !== 0) return st
    return a.name.localeCompare(b.name)
  })
}

/** Every Asana card gid the page needs live status for. */
export function launchpadAsanaGids(data: LaunchpadData = getLaunchpad()): string[] {
  return data.projects.flatMap((p) => (p.asana_gid ? [p.asana_gid] : []))
}
