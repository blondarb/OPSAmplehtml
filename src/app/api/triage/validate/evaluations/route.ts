import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeValidationStudy } from '@/lib/triage/validationAccess'
import { getPool } from '@/lib/db'
import { executeValidation } from '@/lib/triage/validationExecution'
import { DEMO_SCENARIOS } from '@/lib/triage/demoScenarios'
import { resolveTriageModelRegistry } from '@/lib/triage/modelRegistry'
import { TRIAGE_SCORING_PROMPT_VERSION } from '@/lib/triage/systemPrompt'
import { EMERGENCY_GATEWAY_VERSION } from '@/lib/triage/emergencyGateway'
const sha=(s:string)=>createHash('sha256').update(s).digest('hex')
const uuid=(s:unknown)=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
export async function POST(req:NextRequest) {
 const a=await authorizeValidationStudy(req.nextUrl.searchParams.get('study')||'default','manage');if(!a.ok)return a.response
 if(!['labeling','unblinded'].includes(a.phase))return NextResponse.json({error:'Freeze source cases before evaluation'},{status:409})
 if(process.env.TRIAGE_SYNTHETIC_EVALUATIONS_ENABLED!=='true')return NextResponse.json({error:'Synthetic model evaluations are disabled'},{status:409})
 const commit=process.env.TRIAGE_EVALUATION_SOURCE_COMMIT
 if(!commit||!/^[a-f0-9]{40}$/.test(commit))return NextResponse.json({error:'Verified evaluator source revision required'},{status:503})
 const b=await req.json().catch(()=>null)
 if(!b||!uuid(b.case_id)||!uuid(b.request_key)||!['scorer_consistency','clinical_ensemble'].includes(b.scope)||Object.keys(b).some(k=>!['case_id','request_key','scope'].includes(k)))return NextResponse.json({error:'Invalid synthetic evaluation request'},{status:400})
 try {
  const pool=await getPool();const {rows}=await pool.query("SELECT referral_text,patient_age,patient_sex,observed_source_sha256,encode(sha256(convert_to(jsonb_build_array(referral_text,patient_age,patient_sex)::text,'UTF8')),'hex') AS computed_source_sha256 FROM validation_cases WHERE id=$1 AND study_name=$2 AND active=true",[b.case_id,a.studyName]);const c=rows[0]
  if(!c)return NextResponse.json({error:'Case not found'},{status:404})
  // Server-owned built-in synthetic allowlist, never a caller assertion that a note is synthetic.
  if(!DEMO_SCENARIOS.some(s=>s.files.map(f=>f.previewText).join('\n\n--- Next Document ---\n\n')===c.referral_text && s.age===c.patient_age && s.sex===c.patient_sex))return NextResponse.json({error:'Only exact built-in synthetic sources may run in this evaluation lane'},{status:403})
  const configuration={models:resolveTriageModelRegistry(),prompt:TRIAGE_SCORING_PROMPT_VERSION,gateway:EMERGENCY_GATEWAY_VERSION,source_commit:commit,source_commit_provenance:'operator_asserted_requires_artifact_verification',input_variant:'original',scope:b.scope,scorer_temperature:0}
  const revision=sha(JSON.stringify(configuration));const sourceHash=c.computed_source_sha256
  if(c.observed_source_sha256!==sourceHash)return NextResponse.json({error:'Source binding mismatch'},{status:409})
  const attempt=await pool.query(`INSERT INTO triage_validation_attempts(study_name,case_id,request_key,source_sha256,configuration_revision,scope,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(study_name,request_key) DO NOTHING RETURNING id`,[a.studyName,b.case_id,b.request_key,sourceHash,revision,b.scope,a.context.userId])
  if(!attempt.rows.length)return NextResponse.json({status:'already_recorded_or_incomplete',message:'Existing attempt preserved; inspect receipts. No new model call.'},{status:409})
  const terminal=await executeValidation({referral_text:c.referral_text,patient_age:c.patient_age,patient_sex:c.patient_sex,temperature:0,model:configuration.models.outpatientScorer},b.scope)
  const receipt=await pool.query(`INSERT INTO triage_validation_receipts(study_name,case_id,request_key,source_sha256,source_commit,configuration,configuration_revision,evaluation_scope,status,result,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,[a.studyName,b.case_id,b.request_key,sourceHash,commit,JSON.stringify(configuration),revision,b.scope,terminal.status,JSON.stringify(terminal.result),a.context.userId])
  // Admin receives receipt identity only while blinded, never the clinical answer.
  return NextResponse.json({receipt_id:receipt.rows[0].id,configuration_revision:revision,status:'recorded'},{status:201})
 }catch{return NextResponse.json({error:'Evaluation could not be recorded; any started attempt remains visible as incomplete'},{status:503})}
}
export async function GET(req:NextRequest) {
 const a=await authorizeValidationStudy(req.nextUrl.searchParams.get('study')||'default','results');if(!a.ok)return a.response
 const revision=req.nextUrl.searchParams.get('revision')
 if(!revision||!/^[a-f0-9]{64}$/.test(revision))return NextResponse.json({error:'Select one exact configuration revision'},{status:400})
 try {
  const {rows}=await(await getPool()).query(`SELECT a.id,a.case_id,a.created_at,r.id AS receipt_id,r.status,r.result,r.source_sha256,r.configuration FROM triage_validation_attempts a LEFT JOIN triage_validation_receipts r ON r.study_name=a.study_name AND r.request_key=a.request_key JOIN validation_cases c ON c.id=a.case_id WHERE a.study_name=$1 AND a.configuration_revision=$2 AND a.source_sha256=c.observed_source_sha256 ORDER BY a.created_at`,[a.studyName,revision])
  return NextResponse.json({attempts:rows,total:rows.length,incomplete:rows.filter(r=>!r.receipt_id).length,errors:rows.filter(r=>r.status==='error').length,scope:'versioned_receipts_only'})
 }catch{return NextResponse.json({error:'Unable to read evaluation receipts'},{status:503})}
}
