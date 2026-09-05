import { NextRequest,NextResponse } from 'next/server'
import { POST as evaluate } from '../../evaluations/route'
import { authorizeValidationStudy } from '@/lib/triage/validationAccess'
/** One append-only consistency attempt per request. Old batch/run-index upserts are not reused. */
export async function POST(req:NextRequest) {
 const a=await authorizeValidationStudy(req.nextUrl.searchParams.get('study')||'default','manage');if(!a.ok)return a.response
 const b=await req.json().catch(()=>null)
 if(!b||!b.case_id||!b.request_key)return NextResponse.json({error:'Use case_id and a fresh request_key for one scorer consistency attempt; prior runs remain unchanged.'},{status:400})
 return evaluate(new NextRequest(req.url,{method:'POST',headers:req.headers,body:JSON.stringify({case_id:b.case_id,request_key:b.request_key,scope:'scorer_consistency'})}))
}
