import { describe,it,expect,vi } from 'vitest'
import { collectIntakeEvaluation,executeValidation } from '@/lib/triage/validationExecution'
describe('existing evaluators with validation-only sinks',()=>{
 it('polls a 202 acceptance to terminal result without interpreting acceptance as a score',async()=>{
 const start=vi.fn().mockResolvedValue({status:'pending',session_id:'synthetic'});const poll=vi.fn().mockResolvedValueOnce({status:'pending'}).mockResolvedValueOnce({status:'complete',triage_tier:'routine',scheduling_locked:true});const r=await collectIntakeEvaluation({start,poll,wait:async()=>{}});expect(r.status).toBe('held');expect(r.result.triage_tier).toBe('routine');expect(poll).toHaveBeenCalledTimes(2)
 })
 it('retains timeout and failure in the terminal denominator',async()=>{const r=await collectIntakeEvaluation({start:async()=>({session_id:'s'}),poll:async()=>({status:'pending'}),wait:async()=>{}},2);expect(r.status).toBe('held');expect(r.result.error).toBe('evaluation_timeout')})
 it('preserves an emergency envelope when scorer parsing fails',async()=>{const r=await executeValidation({referral_text:'SYNTHETIC'},'scorer_consistency',{scorer:vi.fn().mockRejectedValue({emergencyEnvelope:{emergentOverride:true}}),ensemble:vi.fn()});expect(r.status).toBe('error');expect(r.result.care_pathway).toBe('emergency_now');expect(r.result.scheduling_locked).toBe(true)})
 it('uses only selected pure scorer and no ensemble/persistence for consistency',async()=>{const scorer=vi.fn().mockResolvedValue({triage_tier:'routine',insufficient_data:false});const ensemble=vi.fn();const r=await executeValidation({referral_text:'SYNTHETIC'},'scorer_consistency',{scorer,ensemble});expect(r.result.evaluation_scope).toBe('scorer_consistency');expect(ensemble).not.toHaveBeenCalled()})
 it('does not publish sentinel placeholder expectations as human accuracy labels',async()=>{const r=await executeValidation({referral_text:'SYNTHETIC'},'clinical_ensemble',{scorer:vi.fn(),ensemble:vi.fn().mockResolvedValue({actualPathway:'emergency_now',branchTelemetry:[],signals:[],evidenceValidation:{},exactOrAcceptable:false})});expect(r.result.care_pathway).toBe('emergency_now');expect(r.result).not.toHaveProperty('exactOrAcceptable')})
 it('exposes review-only scorer metadata without forwarding referral input',async()=>{const r=await executeValidation({referral_text:'SYNTHETIC PRIVATE SOURCE'},'clinical_ensemble',{scorer:vi.fn(),ensemble:vi.fn().mockResolvedValue({actualPathway:'routine_outpatient',branchTelemetry:[],signals:[],evidenceValidation:{},scoringMetadata:{tier:'routine',dimensionRatings:{symptom_acuity:1},suggestedWorkup:[],subspecialtyRecommendation:'General Neurology',redirectDestination:null}})});expect(r.result.scoring_metadata).toEqual(expect.objectContaining({tier:'routine'}));expect(JSON.stringify(r.result.scoring_metadata)).not.toContain('SYNTHETIC PRIVATE SOURCE')})
 it('passes a fixed decision clock to the Sentinel and retains its safe timing metadata',async()=>{
  const ensemble=vi.fn().mockResolvedValue({actualPathway:'routine_outpatient',branchTelemetry:[],signals:[],evidenceValidation:{},scoringMetadata:null,timingMetadata:{sourceDigest:'a'.repeat(64),decisionAt:'2026-09-05T12:00:00.000Z'}})
  const r=await executeValidation({referral_text:'SYNTHETIC',decisionAt:'2026-09-05T12:00:00.000Z'},'clinical_ensemble',{scorer:vi.fn(),ensemble})
  expect(ensemble.mock.calls[0][0].decisionAt).toBe('2026-09-05T12:00:00.000Z')
  expect(r.result.timing_metadata).toEqual(expect.objectContaining({decisionAt:'2026-09-05T12:00:00.000Z'}))
 })
})
