import { NextRequest, NextResponse } from 'next/server'
import { authorizeValidationStudy } from '@/lib/triage/validationAccess'

// Legacy runners either overwrite evidence or mistake a 202 response for a
// completed evaluation. Keep them closed until the full-pipeline runner exists.
export async function POST(req: NextRequest) {
  const access = await authorizeValidationStudy(req.nextUrl.searchParams.get('study') || 'default', 'manage')
  if (!access.ok) return access.response
  return NextResponse.json({
    error: 'Legacy evaluation is disabled. Use source-only case setup and the governed full-pipeline validation protocol.',
    reason: 'full_pipeline_evaluation_required',
  }, { status: 409 })
}
