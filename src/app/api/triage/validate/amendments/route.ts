import { NextRequest, NextResponse } from 'next/server'
import { authorizeValidationStudy } from '@/lib/triage/validationAccess'
import { getPool } from '@/lib/db'
export async function POST(req: NextRequest) {
  const access = await authorizeValidationStudy(req.nextUrl.searchParams.get('study') || 'default')
  if (!access.ok) return access.response
  if (!['labeling','unblinded'].includes(access.phase) || access.memberRole !== 'reviewer') return NextResponse.json({error:'Study does not accept amendment requests'}, {status:409})
  const body = await req.json().catch(()=>null)
  if (!body || typeof body.review_id !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.review_id) || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length>2000) return NextResponse.json({error:'Review and correction reason are required'}, {status:400})
  try {
    const { rows } = await (await getPool()).query(`INSERT INTO triage_validation_amendments(review_id,study_name,requested_by,reason)
      SELECT r.id,c.study_name,$3,$4 FROM validation_reviews r JOIN validation_cases c ON c.id=r.case_id
      WHERE r.id=$1 AND c.study_name=$2 AND r.reviewer_id::text=$3 RETURNING id`, [body.review_id,access.studyName,access.context.userId,body.reason.trim()])
    if (!rows.length) return NextResponse.json({error:'Review not found'}, {status:404})
    return NextResponse.json({id:rows[0].id,message:'Correction request saved. Original rating remains unchanged.'},{status:201})
  } catch { return NextResponse.json({error:'Unable to save correction request'}, {status:503}) }
}
