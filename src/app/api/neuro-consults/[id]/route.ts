/**
 * GET  /api/neuro-consults/[id]  — Fetch a single consult record
 * PUT  /api/neuro-consults/[id]  — Update a consult record (notes, status)
 */

import { NextResponse } from 'next/server'
import { getConsult } from '@/lib/consult/pipeline'
import { getPool } from '@/lib/db'
import { from } from '@/lib/db-query'
import { loadHistorianAuthorization } from '@/lib/triage/historianAuthorization'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/neuro-consults/[id]
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const access = await authorizeClinicalAccess({
      action: 'consult.read',
      allowedRoles: ['viewer', 'scheduler', 'clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }

    const consult = await getConsult(id, access.context.tenantId)

    if (!consult) {
      return NextResponse.json({ error: 'Consult not found' }, { status: 404 })
    }

    let historianAuthorization = {
      allowed: false,
      reason: 'triage_authorization_missing',
      approved_question_count: 0,
    }
    if (consult.triage_session_id) {
      try {
        const authorization = await loadHistorianAuthorization(
          consult.triage_session_id,
          access.context.tenantId,
        )
        historianAuthorization = authorization.decision.allowed
          ? {
              allowed: true,
              reason: '',
              approved_question_count: authorization.approvedQuestions.length,
            }
          : {
              allowed: false,
              reason: authorization.decision.reason,
              approved_question_count: 0,
            }
      } catch {
        console.error('[neuro-consults] historian authorization unavailable')
        historianAuthorization = {
          allowed: false,
          reason: 'triage_authorization_unavailable',
          approved_question_count: 0,
        }
      }
    }

    return NextResponse.json({
      consult: { ...consult, historian_authorization: historianAuthorization },
    })
  } catch (error: unknown) {
    console.error(`GET /api/neuro-consults/${id} error:`, error)
    const message = error instanceof Error ? error.message : 'Failed to fetch consult'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/neuro-consults/[id]
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Allows updating free-form fields on the consult record.
 * Permitted fields: notes, status (advance only — the pipeline helpers
 * handle status transitions, but this allows manual corrections).
 */

// Valid status progression — each status can only advance to the next
const STATUS_ORDER = [
  'triage_pending', 'triage_complete',
  'intake_pending', 'intake_in_progress', 'intake_complete',
  'historian_pending', 'historian_in_progress', 'historian_complete',
  'complete',
] as const

function isValidStatusTransition(current: string, next: string): boolean {
  const currentIdx = STATUS_ORDER.indexOf(current as typeof STATUS_ORDER[number])
  const nextIdx = STATUS_ORDER.indexOf(next as typeof STATUS_ORDER[number])
  // Allow advancing forward only (not skipping more than one step or going backward)
  return currentIdx >= 0 && nextIdx >= 0 && nextIdx > currentIdx
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const access = await authorizeClinicalAccess({
      action: 'consult.update',
      allowedRoles: ['clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }

    const body = await request.json()

    // Only allow updating safe, manually-editable fields via this endpoint.
    // Pipeline transitions (triage_*, intake_*, historian_*) are handled
    // by the dedicated pipeline helper functions.
    const allowedFields = ['notes', 'status', 'patient_id']
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field]
      }
    }

    if (Object.keys(updateData).length === 1) {
      // Only updated_at — nothing to update
      return NextResponse.json(
        { error: 'No valid fields provided for update' },
        { status: 400 },
      )
    }

    const requiresCurrentConsult =
      'status' in updateData || 'patient_id' in updateData
    const currentConsult = requiresCurrentConsult
      ? await getConsult(id, access.context.tenantId)
      : null
    if (
      requiresCurrentConsult &&
      !currentConsult &&
      !('patient_id' in updateData)
    ) {
      return NextResponse.json({ error: 'Consult not found' }, { status: 404 })
    }

    // Validate status transitions if status is being changed
    if ('status' in updateData && currentConsult) {
      if (!isValidStatusTransition(currentConsult.status, updateData.status as string)) {
        return NextResponse.json(
          { error: `Invalid status transition: ${currentConsult.status} → ${updateData.status}` },
          { status: 400 },
        )
      }
    }

    if ('patient_id' in updateData && currentConsult?.triage_session_id) {
      return NextResponse.json(
        {
          error: 'The consult patient assignment could not be updated.',
          reason: 'consult_patient_reassignment_conflict',
        },
        { status: 409 },
      )
    }

    if ('patient_id' in updateData) {
      const values: unknown[] = [
        id,
        access.context.tenantId,
        updateData.patient_id,
        currentConsult?.patient_id ?? null,
      ]
      const assignments = ['patient_id = target_patient.id']

      if ('notes' in updateData) {
        values.push(updateData.notes)
        assignments.push(`notes = $${values.length}`)
      }
      if ('status' in updateData) {
        values.push(updateData.status)
        assignments.push(`status = $${values.length}`)
      }
      values.push(updateData.updated_at)
      assignments.push(`updated_at = $${values.length}`)

      const reassignment = await (await getPool()).query(
        `WITH valid_patient AS MATERIALIZED (
           SELECT id
             FROM patients
            WHERE id = $3
              AND tenant_id = $2
            FOR KEY SHARE
         ),
         target_patient AS MATERIALIZED (
           SELECT id FROM valid_patient
           UNION ALL
           SELECT NULL::uuid WHERE $3::uuid IS NULL
         )
         UPDATE neurology_consults AS consult
            SET ${assignments.join(', ')}
           FROM target_patient
          WHERE consult.id = $1
            AND consult.tenant_id = $2
            AND consult.patient_id IS NOT DISTINCT FROM $4
            AND consult.triage_session_id IS NULL
      RETURNING consult.*`,
        values,
      )
      const data = reassignment.rows[0]
      if (reassignment.rowCount !== 1 || !data) {
        return NextResponse.json(
          {
            error: 'The consult patient assignment could not be updated.',
            reason: 'consult_patient_reassignment_conflict',
          },
          { status: 409 },
        )
      }

      return NextResponse.json({ consult: data })
    }

    const { data, error } = await from('neurology_consults')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', access.context.tenantId)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ consult: data })
  } catch (error: unknown) {
    console.error(`PUT /api/neuro-consults/${id} error:`, error)
    const message = error instanceof Error ? error.message : 'Failed to update consult'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
