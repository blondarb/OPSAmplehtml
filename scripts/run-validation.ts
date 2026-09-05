#!/usr/bin/env tsx
/** Existing runner, now append-only and dry by default. No direct DB delete/upsert.
 * --study=<id> --case-id=<uuid> [--scope=scorer_consistency|clinical_ensemble]
 * --origin=https://approved-synthetic-host [--execute]
 * Execution uses TRIAGE_VALIDATION_COOKIE supplied by the operator; never prints it.
 * Models/configuration are server-owned. One attempt per command; retain its request key.
 */
import { randomUUID } from 'node:crypto'
const args=process.argv.slice(2)
const arg=(name:string)=>args.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)
async function main(){
 const study=arg('study');const caseId=arg('case-id');const scope=arg('scope')||'scorer_consistency';const origin=arg('origin')
 if(!study||!/^[A-Za-z0-9_-]{1,100}$/.test(study)||!caseId||!/^[a-f0-9-]{36}$/i.test(caseId)||!['scorer_consistency','clinical_ensemble'].includes(scope)||!origin||args.some(a=>!a.startsWith('--'))){throw new Error('Use --study, --case-id, --origin and optional --scope; model selection is server-owned. Legacy destructive runner retired.')}
 const url=new URL('/api/triage/validate/evaluations',origin)
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('HTTPS or local synthetic host required')
 url.searchParams.set('study',study)
 const body={case_id:caseId,request_key:randomUUID(),scope}
 console.log(JSON.stringify({mode:args.includes('--execute')?'execute':'dry',url:url.toString(),...body}))
 if(!args.includes('--execute'))return
 const cookie=process.env.TRIAGE_VALIDATION_COOKIE;if(!cookie)throw new Error('Operator authentication required; do not paste credentials into reports')
 const r=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)})
 const result=await r.json()
 // The server returns receipt metadata only while blinded.
 console.log(JSON.stringify({http_status:r.status,receipt_id:result.receipt_id??null,configuration_revision:result.configuration_revision??null,status:result.status??null}))
 if(!r.ok)process.exitCode=1
}
main().catch(()=>{console.error('Validation command failed. Check arguments, authentication, study state and server enablement; prior evidence remains unchanged.');process.exitCode=1})
