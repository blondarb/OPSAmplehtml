import { runTriage, type TriageInput } from './runTriage'
import { runLiveSentinelCase } from './sentinel/liveRunner'
import type { SentinelCase } from './sentinel/types'
export type EvaluationScope = 'scorer_consistency' | 'clinical_ensemble'
export interface ValidationTerminal { status: 'complete' | 'held' | 'error'; result: Record<string, unknown> }
/** Validation-only sink. These dependencies compute; they never persist clinical workflows. */
export async function executeValidation(input: TriageInput, scope: EvaluationScope,
  dependencies = { scorer: runTriage, ensemble: runLiveSentinelCase }): Promise<ValidationTerminal> {
  try {
    if (scope === 'scorer_consistency') {
      const r = await dependencies.scorer(input)
      return {status:r.insufficient_data ? 'held' : 'complete',result:{...r,session_id:null,evaluation_scope:scope,scheduling_locked:true}}
    }
    const item: SentinelCase = {id:'synthetic-validation',title:'Synthetic validation',synthetic:true,syndrome:null,hardNegative:false,tags:[],executionModes:['live_ensemble'],
      input:{kind:'note',text:input.referral_text,sourceStyle:'standard'},
      // These placeholders are never included in results or used as accuracy labels.
      expected:{clinicalClass:'manual_hold',pathway:'undetermined',acceptablePathways:[],requiredSyndromes:[]}}
    const r=await dependencies.ensemble(item,{live:true,branches:['safety','scoring','adjudicator']})
    return {status:r.actualPathway==='undetermined'||r.branchTelemetry.some(b=>b.status==='failed') ? 'held':'complete',result:{care_pathway:r.actualPathway,scheduling_locked:true,signals:r.signals,evidence:r.evidenceValidation,branches:r.branchTelemetry,evaluation_scope:scope}}
  } catch (error) {
    const emergency = !!(error && typeof error==='object' && 'emergencyEnvelope' in error && (error.emergencyEnvelope as {emergentOverride?:boolean})?.emergentOverride)
    return {status:'error',result:{error:'evaluation_failed',care_pathway:emergency?'emergency_now':'undetermined',scheduling_locked:true}}
  }
}

/** Reuses the already-correct seeder polling contract; transport must be an isolated validation adapter. */
export async function collectIntakeEvaluation(transport: {start:()=>Promise<Record<string,unknown>>; poll:(id:string)=>Promise<Record<string,unknown>>;wait:()=>Promise<void>}, maxPolls=60):Promise<ValidationTerminal> {
  try {
    let result=await transport.start()
    for(let i=0;i<maxPolls;i++) {
      if(result.status==='complete') return {status:result.scheduling_locked===true||result.care_pathway==='undetermined'?'held':'complete',result}
      if(result.status==='error') return {status:'error',result:{...result,scheduling_locked:true}}
      const id=result.session_id
      if(typeof id!=='string'||!id) return {status:'error',result:{error:'missing_session_identity',scheduling_locked:true}}
      await transport.wait()
      result={...await transport.poll(id),session_id:id}
    }
    return {status:'held',result:{error:'evaluation_timeout',scheduling_locked:true}}
  } catch {return {status:'error',result:{error:'evaluation_transport_failed',scheduling_locked:true}}}
}
