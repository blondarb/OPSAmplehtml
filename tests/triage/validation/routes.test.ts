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
const clinical_assessment = {
  version: 'v1', action: 'outpatient_assessment',
  latest_safe_assessment: { origin: 'decision_time', interval: { value: 24, unit: 'hours' } },
  services: ['General Neurology', 'MS / Neuroimmunology'], decisive_missing_facts: ['Synthetic missing exam detail'],
}

describe('validation HTTP boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks(); chains.length = 0; responses.length = 0
    gate.mockResolvedValue({ ok: true, context: { userId: 'reviewer-a', tenantId: 'tenant-a' }, studyName: 'study-a', phase: 'labeling',memberRole:'reviewer',reviewerKind:'physician',studyKind:'independent' })
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
  it('reports v1 clinical-label disagreement separately and never presents it as legacy AI performance', async () => {
    responses.push(
      { data: [{ id: 'case-a', case_number: 1, title: 'Synthetic', ai_triage_tier: 'routine' }], error: null },
      { data: [
        { case_id: 'case-a', reviewer_id: 'reviewer-a', reviewer_kind: 'physician', label_context: 'independent_blinded', triage_tier: 'emergent', clinical_assessment: { ...clinical_assessment, action: 'emergency_now', latest_safe_assessment: { origin: 'decision_time', interval: { value: 0, unit: 'minutes' } } } },
        { case_id: 'case-a', reviewer_id: 'reviewer-b', reviewer_kind: 'physician', label_context: 'independent_blinded', triage_tier: 'emergent', clinical_assessment: { ...clinical_assessment, action: 'clinician_review_now', latest_safe_assessment: { origin: 'decision_time', interval: { value: 0, unit: 'minutes' } }, services: ['Stroke'] } },
      ], error: null },
      { data: [], error: null },
      { data: [], error: null },
    )
    const body = await (await results(request())).json()
    expect(body.ai_comparison_source).toBe('not_evaluated_for_clinical_assessment_v1')
    expect(body.ai_vs_consensus.cases_compared).toBe(0)
    expect(body.clinical_assessment_analysis).toMatchObject({ canonical_label: 'clinical_assessment_v1', clinical_validation_established: false, ai_action_comparison: 'not_evaluated', coverage: { assessments_recorded: 2, cases_with_two_or_more_assessments: 1 }, action_agreement: { disagreement_count: 1 }, service_destination_agreement: { disagreement_count: 1 } })
  })
  it('rejects case writes once labeling starts', async () => {
    expect((await addCase(request({}))).status).toBe(409)
    expect(from).not.toHaveBeenCalled()
  })
  it('rejects mixed study batches and caller AI answers', async () => {
    gate.mockResolvedValue({ ok:true, phase:'draft' })
    for (const extra of [{ study_name:'other' },{ ai_triage_tier:'routine',comfortable_with_wait:'yes',confidence:'high' }]) {
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
    expect((await submit(request({case_id:'other-case',triage_tier:'routine',comfortable_with_wait:'yes',confidence:'high',clinical_assessment}))).status).toBe(404)
    expect(chains[0].eq).toHaveBeenCalledWith('study_name','study-a')
    expect(from).toHaveBeenCalledTimes(1)
  })
  it('derives reviewer and returns conflict for an already submitted rating', async () => {
    responses.push({data:{id:'case-a'},error:null},{data:null,error:{code:'23505'}})
    const r=await submit(request({case_id:'case-a',triage_tier:'routine',comfortable_with_wait:'yes',confidence:'high',clinical_assessment,reviewer_id:'forged'}))
    expect(r.status).toBe(409)
    expect(chains[1].insert.mock.calls[0][0].reviewer_id).toBe('reviewer-a')
    expect(chains[1].insert.mock.calls[0][0].clinical_assessment).toEqual(clinical_assessment)
  })
  it.each([
    undefined,
    { ...clinical_assessment, version: null },
    { ...clinical_assessment, latest_safe_assessment: null },
    { ...clinical_assessment, action: 'final_disposition' },
    { ...clinical_assessment, uncontrolled_field: 'forged' },
    { ...clinical_assessment, latest_safe_assessment: { origin: 'decision_time' } },
    { ...clinical_assessment, latest_safe_assessment: { origin: 'decision_time', interval: { value: '24', unit: 'hours' } } },
    { ...clinical_assessment, services: [null] },
    { ...clinical_assessment, decisive_missing_facts: [7] },
    { ...clinical_assessment, latest_safe_assessment: { origin: 'unknown', interval: { value: 1, unit: 'hours' } } },
    { ...clinical_assessment, services: ['invented-service'] },
    { ...clinical_assessment, action: 'emergency_now', latest_safe_assessment: { origin: 'unknown' } },
    { ...clinical_assessment, action: 'emergency_now', latest_safe_assessment: { origin: 'decision_time', interval: { value: 1, unit: 'hours' } } },
  ])('rejects an incomplete or ungoverned clinical assessment', async clinical_assessment => {
    expect((await submit(request({ case_id:'case-a',triage_tier:'routine',comfortable_with_wait:'yes',confidence:'high',clinical_assessment }))).status).toBe(400)
    expect(from).not.toHaveBeenCalled()
  })
  it('accepts immediate actions only with the decision-time zero-minute timing', async () => {
    responses.push({ data: { id: 'case-a' }, error: null }, { data: { id: 'review-a' }, error: null })
    const immediate = { ...clinical_assessment, action: 'clinician_review_now', latest_safe_assessment: { origin: 'decision_time', interval: { value: 0, unit: 'minutes' } } }
    expect((await submit(request({ case_id: 'case-a', triage_tier: 'urgent', comfortable_with_wait: 'no', confidence: 'high', clinical_assessment: immediate }))).status).toBe(200)
    expect(chains[1].insert).toHaveBeenCalledWith(expect.objectContaining({ clinical_assessment: immediate }))
  })
  it.each([
    { action: 'emergency_now', triage_tier: 'non_urgent', comfortable_with_wait: 'no' },
    { action: 'clinician_review_now', triage_tier: 'urgent', comfortable_with_wait: 'yes' },
    { action: 'clinician_review_now', triage_tier: 'routine', comfortable_with_wait: 'no' },
    { action: 'outpatient_assessment', triage_tier: 'emergent', comfortable_with_wait: 'yes' },
    { action: 'clarify_before_disposition', triage_tier: 'routine', comfortable_with_wait: 'yes' },
  ])('rejects contradictory clinical action and legacy comparison combinations', async ({ action, triage_tier, comfortable_with_wait }) => {
    const immediate = action === 'emergency_now' || action === 'clinician_review_now'
    const assessment = { ...clinical_assessment, action, latest_safe_assessment: immediate ? { origin: 'decision_time', interval: { value: 0, unit: 'minutes' } } : clinical_assessment.latest_safe_assessment }
    expect((await submit(request({ case_id: 'case-a', triage_tier, comfortable_with_wait, confidence: 'high', clinical_assessment: assessment }))).status).toBe(400)
    expect(from).not.toHaveBeenCalled()
  })
  it.each([
    { action: 'emergency_now', triage_tier: 'emergent', comfortable_with_wait: 'yes' },
    { action: 'clinician_review_now', triage_tier: 'insufficient_data', comfortable_with_wait: 'yes' },
  ])('permits comfort with an immediate or clarification comparison', async ({ action, triage_tier, comfortable_with_wait }) => {
    responses.push({ data: { id: 'case-a' }, error: null }, { data: { id: 'review-a' }, error: null })
    const assessment = { ...clinical_assessment, action, latest_safe_assessment: { origin: 'decision_time', interval: { value: 0, unit: 'minutes' } } }
    expect((await submit(request({ case_id: 'case-a', triage_tier, comfortable_with_wait, confidence: 'high', clinical_assessment: assessment }))).status).toBe(200)
  })
  it('permits urgent outpatient assessment when immediate review is not selected', async () => {
    responses.push({ data: { id: 'case-a' }, error: null }, { data: { id: 'review-a' }, error: null })
    const assessment = { ...clinical_assessment, action: 'outpatient_assessment', latest_safe_assessment: { origin: 'decision_time', interval: { value: 7, unit: 'days' } } }
    expect((await submit(request({ case_id: 'case-a', triage_tier: 'urgent', comfortable_with_wait: 'yes', confidence: 'high', clinical_assessment: assessment }))).status).toBe(200)
  })
  it('returns an explicit 503 if clinical assessment migration storage is absent', async () => {
    responses.push({data:{id:'case-a'},error:null},{data:null,error:{code:'42703',message:'column clinical_assessment does not exist'}})
    expect((await submit(request({case_id:'case-a',triage_tier:'routine',comfortable_with_wait:'yes',confidence:'high',clinical_assessment}))).status).toBe(503)
  })
  it.each([auto,seed])('rejects clinical intake model calls during source import', async handler => {
    const r = await handler(request({run_ai:true}))
    expect(r.status).toBe(409); expect(from).not.toHaveBeenCalled()
  })
  it('rejects the old destructive rerun shape',async()=>{expect((await rerun(request({clear_previous:true}))).status).toBe(400);expect(from).not.toHaveBeenCalled()})
})
