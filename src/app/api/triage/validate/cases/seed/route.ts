import { NextRequest,NextResponse } from 'next/server'
import { POST as insertCases } from '../route'
import { authorizeValidationStudy } from '@/lib/triage/validationAccess'
import { DEMO_SCENARIOS } from '@/lib/triage/demoScenarios'
/** Seed SOURCE ONLY into a new draft. Never overwrite source, run scores or invoke clinical intake. */
export async function POST(req:NextRequest) {
 const a=await authorizeValidationStudy(req.nextUrl.searchParams.get('study')||'default','manage');if(!a.ok)return a.response
 const body=await req.json().catch(()=>({}))
 if(body?.run_ai===true)return NextResponse.json({error:'Import source first; run isolated evaluations after freezing. Clinical intake can emit alerts.'},{status:409})
 const cases=DEMO_SCENARIOS.map((s,i)=>({case_number:i+1,title:`Case ${i+1}`,referral_text:s.files.map(f=>f.previewText).join('\n\n--- Next Document ---\n\n'),patient_age:s.age,patient_sex:s.sex,study_name:a.studyName}))
 const response=await insertCases(new NextRequest(req.url,{method:'POST',headers:req.headers,body:JSON.stringify(cases)}))
 if(!response.ok)return response
 return NextResponse.json({seeded:cases.length,with_ai_results:0,errors:0,message:'Frozen-source preparation only; no model calls.'},{status:201})
}
