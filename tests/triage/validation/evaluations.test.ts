import { CLINICAL_POLICY_SOURCES } from '@/lib/triage/sentinel/clinicalPolicyRegistry'
import {beforeEach,describe,it,expect,vi} from 'vitest'
import {NextRequest} from 'next/server'
import {createHash} from 'node:crypto'
const {gate,query,execute}=vi.hoisted(()=>({gate:vi.fn(),query:vi.fn(),execute:vi.fn()}))
vi.mock('@/lib/triage/validationAccess',()=>({authorizeValidationStudy:gate}))
vi.mock('@/lib/db',()=>({getPool:async()=>({query})}))
vi.mock('@/lib/triage/validationExecution',()=>({executeValidation:execute}))
vi.mock('@/lib/triage/demoScenarios',()=>({DEMO_SCENARIOS:[{age:40,sex:'F',files:[{previewText:'SYNTHETIC ONLY'}]}]}))
import {POST} from '@/app/api/triage/validate/evaluations/route'
const body={case_id:'00000000-0000-0000-0000-000000000001',request_key:'00000000-0000-0000-0000-000000000002',scope:'scorer_consistency'}
const request=(b:unknown=body)=>new NextRequest('http://localhost/api/triage/validate/evaluations?study=s',{method:'POST',body:JSON.stringify(b)})
const hash=createHash('sha256').update('SYNTHETIC ONLY').digest('hex')
describe('append-only synthetic evaluations',()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('TRIAGE_SYNTHETIC_EVALUATIONS_ENABLED','true');vi.stubEnv('TRIAGE_EVALUATION_SOURCE_COMMIT','a'.repeat(40));gate.mockResolvedValue({ok:true,phase:'labeling',studyName:'s',context:{tenantId:'t',userId:'admin'}});query.mockResolvedValueOnce({rows:[{referral_text:'SYNTHETIC ONLY',patient_age:40,patient_sex:'F',observed_source_sha256:hash,computed_source_sha256:hash}]}).mockResolvedValueOnce({rows:[{id:'attempt'}]}).mockResolvedValueOnce({rows:[{id:'receipt'}]});execute.mockResolvedValue({status:'complete',result:{triage_tier:'routine'}})})
 it('records attempt then receipt without clinical tables and hides answers while blinded',async()=>{const r=await POST(request());expect(r.status).toBe(201);expect(await r.json()).not.toHaveProperty('result');expect(query.mock.calls.map(c=>c[0]).join(' ')).not.toMatch(/triage_sessions|outbox|appointments|emergency_actions/);expect(query.mock.calls[1][0]).toContain('triage_validation_attempts');expect(query.mock.calls[2][0]).toContain('triage_validation_receipts')})
 it('runs exact new clinical-policy sources with the fixed clock and one shared configuration revision', async()=>{
  const revisions: string[]=[]
  for(const item of CLINICAL_POLICY_SOURCES.slice(0,2)) {
    query.mockReset().mockResolvedValueOnce({rows:[{referral_text:item.referralText,patient_age:null,patient_sex:null,observed_source_sha256:hash,computed_source_sha256:hash}]}).mockResolvedValueOnce({rows:[{id:'attempt'}]}).mockResolvedValueOnce({rows:[{id:'receipt'}]})
    const response=await POST(request())
    expect(response.status).toBe(201)
    revisions.push((await response.json()).configuration_revision)
    expect(execute.mock.calls.at(-1)?.[0]).toMatchObject({referral_text:item.referralText,decisionAt:item.decisionAt})
    const receiptResult=JSON.parse(query.mock.calls[2][1][9])
    expect(receiptResult.evaluation_case.clinical_policy_case).toBe(item.id)
    expect(JSON.parse(query.mock.calls[2][1][5])).not.toHaveProperty('clinical_policy_case')
  }
  expect(revisions[0]).toBe(revisions[1])
 })
 it('rejects clinical-policy text with altered demographics before model calls',async()=>{
  query.mockReset().mockResolvedValue({rows:[{referral_text:CLINICAL_POLICY_SOURCES[0].referralText,patient_age:40,patient_sex:null,observed_source_sha256:hash,computed_source_sha256:hash}]})
  expect((await POST(request())).status).toBe(403);expect(execute).not.toHaveBeenCalled()
 })
 it('makes no call or DB write while disabled',async()=>{vi.stubEnv('TRIAGE_SYNTHETIC_EVALUATIONS_ENABLED','false');expect((await POST(request())).status).toBe(409);expect(query).not.toHaveBeenCalled();expect(execute).not.toHaveBeenCalled()})
 it('executes the exact registry scorer model written in its receipt',async()=>{vi.stubEnv('BEDROCK_TRIAGE_SCORING_MODEL','us.anthropic.claude-opus-4-7');await POST(request());expect(execute.mock.calls[0][0].model).toBe('us.anthropic.claude-opus-4-7');expect(query.mock.calls[2][1][5]).toContain('us.anthropic.claude-opus-4-7')})
 it('rejects patient/consult binding fields',async()=>{expect((await POST(request({...body,patient_id:'forged'}))).status).toBe(400);expect(query).not.toHaveBeenCalled()})
 it('rejects arbitrary non-allowlisted source even if claimed synthetic',async()=>{query.mockReset().mockResolvedValue({rows:[{referral_text:'a new unapproved note',observed_source_sha256:hash}]});expect((await POST(request())).status).toBe(403);expect(execute).not.toHaveBeenCalled()})
 it('rejects changed demographics even when the text is allowlisted',async()=>{query.mockReset().mockResolvedValue({rows:[{referral_text:'SYNTHETIC ONLY',patient_age:41,patient_sex:'F',observed_source_sha256:hash,computed_source_sha256:hash}]});expect((await POST(request())).status).toBe(403);expect(execute).not.toHaveBeenCalled()})
 it('does not rerun a previously recorded request key',async()=>{query.mockReset().mockResolvedValueOnce({rows:[{referral_text:'SYNTHETIC ONLY',patient_age:40,patient_sex:'F',observed_source_sha256:hash,computed_source_sha256:hash}]}).mockResolvedValueOnce({rows:[]});expect((await POST(request())).status).toBe(409);expect(execute).not.toHaveBeenCalled()})
 it('rejects source mutation before model calls',async()=>{query.mockReset().mockResolvedValue({rows:[{referral_text:'SYNTHETIC ONLY',patient_age:40,patient_sex:'F',observed_source_sha256:'bad',computed_source_sha256:hash}]});expect((await POST(request())).status).toBe(409);expect(execute).not.toHaveBeenCalled()})
})
