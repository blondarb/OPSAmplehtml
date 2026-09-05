import { NextRequest,NextResponse } from 'next/server'
import { POST as insertCases } from '../route'
import { authorizeValidationStudy } from '@/lib/triage/validationAccess'
/** Legacy path retained for source import. AI evaluation is an explicit isolated step. */
export async function POST(req:NextRequest) {
 const a=await authorizeValidationStudy(req.nextUrl.searchParams.get('study')||'default','manage');if(!a.ok)return a.response
 const body=await req.json().catch(()=>null)
 if(!body)return NextResponse.json({error:'Source cases required'},{status:400})
 if(body?.run_ai===true)return NextResponse.json({error:'Use the isolated evaluations endpoint after source freeze; no clinical intake calls from study import.'},{status:409})
 const notes=Array.isArray(body.notes)?body.notes:[body]
 if(notes.some((n:unknown)=>!n||typeof n!=='object'||Array.isArray(n)))return NextResponse.json({error:'Invalid source batch'},{status:400})
 const cases=notes.map((n:Record<string,unknown>)=>({case_number:n.case_number,title:typeof n.case_number==='number'?`Case ${n.case_number}`:'Case',referral_text:n.referral_text,patient_age:n.patient_age,patient_sex:n.patient_sex,study_name:a.studyName}))
 return insertCases(new NextRequest(req.url,{method:'POST',headers:req.headers,body:JSON.stringify(cases)}))
}
