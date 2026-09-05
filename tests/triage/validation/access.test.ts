import { beforeEach, describe, expect, it, vi } from 'vitest'
const { clinical, query } = vi.hoisted(() => ({ clinical: vi.fn(), query: vi.fn() }))
vi.mock('@/lib/auth/clinicalAccess', () => ({ authorizeClinicalAccess: clinical, clinicalAccessDeniedMessage: () => 'Denied' }))
vi.mock('@/lib/db', () => ({ getPool: async () => ({ query }) }))
import { authorizeValidationStudy } from '@/lib/triage/validationAccess'

describe('study authorization', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    clinical.mockResolvedValue({ ok: true, context: { tenantId: 'tenant-a', userId: 'reviewer-a', role: 'clinician' } })
    query.mockResolvedValue({ rows: [{ phase: 'labeling', role: 'reviewer' }] })
  })
  it.each([401,403,503])('denies clinical access %s before study queries', async status => {
    clinical.mockResolvedValue({ ok: false, status, reason: 'forbidden' })
    const r = await authorizeValidationStudy('study-a')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(status)
    expect(query).not.toHaveBeenCalled()
  })
  it('binds study lookup to server tenant and caller', async () => {
    expect((await authorizeValidationStudy('study-a')).ok).toBe(true)
    expect(query.mock.calls[0][1]).toEqual(['study-a','tenant-a','reviewer-a'])
  })
  it('denies unknown, cross-tenant, inactive and unmapped legacy studies', async () => {
    query.mockResolvedValue({ rows: [] })
    const r = await authorizeValidationStudy('default')
    expect(!r.ok && r.response.status).toBe(403)
  })
  it('does not treat clinical admins as study admins', async () => {
    clinical.mockResolvedValue({ ok: true, context: { tenantId: 'tenant-a', userId: 'admin', role: 'admin' } })
    const r = await authorizeValidationStudy('study-a','manage')
    expect(!r.ok && r.response.status).toBe(403)
  })
  it('withholds results even from study admin before unblinding', async () => {
    query.mockResolvedValue({ rows: [{ phase: 'labeling', role: 'admin' }] })
    const r = await authorizeValidationStudy('study-a','results')
    expect(!r.ok && r.response.status).toBe(409)
  })
  it('permits results only after formal unblinding', async () => {
    query.mockResolvedValue({ rows: [{ phase: 'unblinded', role: 'reviewer' }] })
    expect((await authorizeValidationStudy('study-a','results')).ok).toBe(true)
  })
  it('fails closed on missing migration', async () => {
    query.mockRejectedValue(new Error('missing table'))
    const r = await authorizeValidationStudy('study-a')
    expect(!r.ok && r.response.status).toBe(503)
  })
})

describe('historical archive permissions',()=>{
 it('allows explicitly mapped archive reader without pretending old ratings are blinded',async()=>{clinical.mockResolvedValue({ok:true,context:{tenantId:'t',userId:'reader',role:'viewer'}});query.mockResolvedValue({rows:[{phase:'archived',study_kind:'legacy_archive',role:'archive_reader',reviewer_kind:'unknown'}]});expect((await authorizeValidationStudy('legacy','results')).ok).toBe(true)})
 it('does not give an independent reviewer archive access implicitly',async()=>{clinical.mockResolvedValue({ok:true,context:{tenantId:'t',userId:'r',role:'clinician'}});query.mockResolvedValue({rows:[{phase:'archived',study_kind:'legacy_archive',role:'reviewer',reviewer_kind:'physician'}]});const r=await authorizeValidationStudy('legacy','results');expect(!r.ok&&r.response.status).toBe(403)})
})
