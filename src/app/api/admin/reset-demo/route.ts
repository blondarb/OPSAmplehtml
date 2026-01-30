import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/admin/reset-demo
 *
 * Deletes all demo data for a single tenant.
 *
 * Required headers:
 *   x-admin-secret: must match ADMIN_RESET_SECRET env var
 *
 * Required body:
 *   { "tenant_id": "demo_full" }   (the tenant to wipe)
 *
 * Tables cleared (in order to respect FK constraints):
 *   patient_messages, patient_intake_forms, clinical_notes,
 *   diagnoses, clinical_scales, scale_results, imaging_studies,
 *   visits, dot_phrases, patients
 */
export async function POST(request: NextRequest) {
  // 1. Verify admin secret
  const secret = process.env.ADMIN_RESET_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'ADMIN_RESET_SECRET is not configured on the server' },
      { status: 500 },
    )
  }

  const providedSecret = request.headers.get('x-admin-secret')
  if (providedSecret !== secret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 2. Parse body
  let tenantId: string
  try {
    const body = await request.json()
    tenantId = body.tenant_id
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!tenantId || typeof tenantId !== 'string') {
    return NextResponse.json(
      { error: 'tenant_id (string) is required in the request body' },
      { status: 400 },
    )
  }

  // 3. Delete rows in dependency order
  const supabase = await createClient()
  const tables = [
    'patient_messages',
    'patient_intake_forms',
    'clinical_notes',
    'diagnoses',
    'scale_results',
    'clinical_scales',
    'imaging_studies',
    'dot_phrases',
    'visits',
    'patients',
  ]

  const results: Record<string, string> = {}

  for (const table of tables) {
    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('tenant_id', tenantId)

      results[table] = error ? `error: ${error.message}` : 'cleared'
    } catch (err: any) {
      // Table may not exist yet (pre-migration)
      results[table] = `skipped: ${err.message}`
    }
  }

  return NextResponse.json({
    message: `Demo data reset for tenant "${tenantId}"`,
    results,
  })
}
