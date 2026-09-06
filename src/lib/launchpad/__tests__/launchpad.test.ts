import { afterEach, describe, expect, it } from 'vitest'
import raw from '@/data/launchpad.json'
import {
  getLaunchpad,
  launchpadAsanaGids,
  sortProjects,
  validateLaunchpad,
} from '@/lib/launchpad/data'
import { _resetLaunchpadAsanaCaches, fetchOpenItems } from '@/lib/launchpad/asana'

describe('launchpad.json', () => {
  it('validates as shipped', () => {
    const data = validateLaunchpad(raw)
    expect(data.projects.length).toBeGreaterThan(5)
    expect(launchpadAsanaGids(data).length).toBeGreaterThan(5)
  })

  it('rejects a typo in link kind', () => {
    const bad = structuredClone(raw) as typeof raw
    ;(bad.projects[0].links[0] as { kind: string }).kind = 'lvie'
    expect(() => validateLaunchpad(bad)).toThrow(/bad kind/)
  })

  it('rejects an unknown auth pool', () => {
    const bad = structuredClone(raw) as typeof raw
    bad.projects[0].links[0].auth = 'okta'
    expect(() => validateLaunchpad(bad)).toThrow(/unknown auth/)
  })

  it('requires a status when a url is unknown', () => {
    const bad = structuredClone(raw) as typeof raw
    bad.projects[0].links[0].url = null
    bad.projects[0].links[0].status = null
    expect(() => validateLaunchpad(bad)).toThrow(/needs a status/)
  })

  it('rejects duplicate ids', () => {
    const bad = structuredClone(raw) as typeof raw
    bad.projects[1].id = bad.projects[0].id
    expect(() => validateLaunchpad(bad)).toThrow(/duplicate/)
  })

  it('sorts High priority first, then the most mature stage first', () => {
    const sorted = sortProjects(getLaunchpad().projects)
    const priorities = sorted.map((p) => p.priority)
    const firstMedium = priorities.indexOf('Medium')
    const lastHigh = priorities.lastIndexOf('High')
    expect(lastHigh).toBeLessThan(firstMedium === -1 ? Infinity : firstMedium)
    const highs = sorted.filter((p) => p.priority === 'High')
    const rank = ['Frame', 'Explore', 'Validate', 'Graduate', 'Engineering', 'Live']
    for (let i = 1; i < highs.length; i++) {
      expect(rank.indexOf(highs[i - 1].stage)).toBeGreaterThanOrEqual(rank.indexOf(highs[i].stage))
    }
  })
})

describe('fetchOpenItems', () => {
  afterEach(() => _resetLaunchpadAsanaCaches())

  const fakeFetch = (routes: Record<string, unknown>, status = 200) =>
    (async (input: RequestInfo | URL) => {
      const url = String(input)
      const key = Object.keys(routes).find((k) => url.includes(k))
      return {
        ok: status < 400 && key !== undefined,
        status: key === undefined ? 404 : status,
        json: async () => ({ data: key ? routes[key] : null }),
      } as Response
    }) as typeof fetch

  it('reports no_token without hitting the network', async () => {
    const prev = process.env.ASANA_PAT
    delete process.env.ASANA_PAT
    const res = await fetchOpenItems(['1'], { noCache: true })
    if (prev !== undefined) process.env.ASANA_PAT = prev
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('no_token')
  })

  it('counts only incomplete subtasks and keeps the card section', async () => {
    const fetchImpl = fakeFetch({
      '/tasks/42/subtasks': [
        { gid: 'a', name: 'ship it', completed: false, due_on: '2026-09-10', permalink_url: 'u/a' },
        { gid: 'b', name: 'done already', completed: true, due_on: null, permalink_url: 'u/b' },
        { gid: 'c', name: 'later', completed: false, due_on: null, permalink_url: 'u/c' },
      ],
      '/tasks/42?': {
        gid: '42',
        name: 'AI Historian',
        permalink_url: 'u/42',
        modified_at: '2026-09-02T00:00:00.000Z',
        memberships: [{ section: { name: '🔭 Explore' } }],
      },
    })
    const res = await fetchOpenItems(['42'], { token: 't', fetchImpl, noCache: true })
    expect(res.ok).toBe(true)
    if (res.ok) {
      const card = res.cards['42']
      expect(card.open_count).toBe(2)
      expect(card.open.map((o) => o.gid)).toEqual(['a', 'c'])
      expect(card.section).toBe('🔭 Explore')
    }
  })

  it('returns asana_error on a non-2xx response instead of throwing', async () => {
    const fetchImpl = fakeFetch({ '/tasks/42': [] }, 500)
    const res = await fetchOpenItems(['42'], { token: 't', fetchImpl, noCache: true })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('asana_error')
  })
})
