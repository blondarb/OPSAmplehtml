/* eslint-disable @typescript-eslint/no-explicit-any -- Dynamic chain mocks exercise the existing untyped database builder at the route boundary. */
import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const { gate, from, chains, responses } = vi.hoisted(() => ({ gate: vi.fn(), from: vi.fn(), chains: [] as any[], responses: [] as any[] }))
vi.mock('@/lib/triage/validationAccess', async original => ({ ...(await original<any>()), authorizeValidationStudy: gate }))
vi.mock('@/lib/db-query', () => ({ from }))
import { GET as cases, POST as addCase } from '@/app/api/triage/validate/cases/route'
import { GET as reviews, POST as submit } from '@/app/api/triage/validate/reviews/route'
import { GET as results } from '@/app/api/triage/validate/results/route'
import { POST as auto } from '@/app/api/triage/validate/cases/auto/route'
import { POST as seed } from '@/app/api/triage/validate/cases/seed/route'
import { POST as rerun } from '@/app/api/triage/validate/cases/rerun/route'
const request = (body?: unknown) => new NextRequest('http://localhost/api/triage/validate/cases?study=study-a',
  body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) })

describe('validation HTTP boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks(); chains.length = 0; responses.length = 0
    gate.mockResolvedValue({ ok: true, context: { userId: 'reviewer-a', tenantId: 'tenant-a' }, studyName: 'study-a', phase: 'labeling' })
    from.mockImplementation(() => {
      const c: any = { then: (resolve: any) => Promise.resolve(responses.shift() || { data: [], error: null }).then(resolve) }
      for (const key of ['select','eq','in','order','insert','single']) c[key] = vi.fn(() => c)
      chains.push(c); return c
    })
  })
  it.each([cases,reviews,results,addCase,submit,auto,seed,rerun])('denial prevents data access and mutation', async handler => {
    gate.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Denied' }, { status: 403 }) })
    expect((await handler(request({}))).status).toBe(403)
    expect(from).not.toHaveBeenCalled()
  })
  it('requests only source columns and own ratings, never AI columns', async () => {
    responses.push({ data: [{ id: 'case-a', case_number: 1, referral_text: 'Synthetic only' }], error: null }, { data: [], error: null })
    const r = await cases(request())
    expect(r.status).toBe(200)
    const projection = chains[0].select.mock.calls[0][0]
    expect(projection).not.toContain('*'); expect(projection).not.toContain('ai_')
    expect(chains[0].eq).toHaveBeenCalledWith('study_name','study-a')
    expect(chains[1].eq).toHaveBeenCalledWith('reviewer_id','reviewer-a')
  })
  it.each([reviews,results])('uses results permission for collective answers', async handler => {
    await handler(request())
    expect(gate).toHaveBeenCalledWith('study-a','results')
  })
  it('rejects case writes once labeling starts', async () => {
    expect((await addCase(request({}))).status).toBe(409)
    expect(from).not.toHaveBeenCalled()
  })
  it('rejects mixed study batches and caller AI answers', async () => {
    gate.mockResolvedValue({ ok:true, phase:'draft' })
    for (const extra of [{ study_name:'other' },{ ai_triage_tier:'routine' }]) {
      expect((await addCase(request({ case_number:1,title:'Synthetic',referral_text:'Synthetic case',...extra }))).status).toBe(400)
    }
    expect(from).not.toHaveBeenCalled()
  })
  it('inserts source-only draft cases without an upsert', async () => {
    gate.mockResolvedValue({ ok:true, phase:'draft' })
    expect((await addCase(request({ case_number:1,title:'Synthetic',referral_text:'Synthetic case' }))).status).toBe(201)
    expect(chains[0].insert.mock.calls[0][0][0]).toMatchObject({study_name:'study-a'})
  })
  it('rejects a case outside the authorized study before writing a review', async () => {
    responses.push({ data:null,error:null })
    expect((await submit(request({case_id:'other-case',triage_tier:'routine'}))).status).toBe(404)
    expect(chains[0].eq).toHaveBeenCalledWith('study_name','study-a')
    expect(from).toHaveBeenCalledTimes(1)
  })
  it('derives reviewer and returns conflict for an already submitted rating', async () => {
    responses.push({data:{id:'case-a'},error:null},{data:null,error:{code:'23505'}})
    const r=await submit(request({case_id:'case-a',triage_tier:'routine',reviewer_id:'forged'}))
    expect(r.status).toBe(409)
    expect(chains[1].insert.mock.calls[0][0].reviewer_id).toBe('reviewer-a')
  })
  it.each([auto,seed,rerun])('holds legacy evaluation without DB or model invocation', async handler => {
    const r = await handler(request({clear_previous:true}))
    expect(r.status).toBe(409); expect(from).not.toHaveBeenCalled()
  })
})
