/**
 * GET  /api/neuro-consults/[id]  — Fetch a single consult record
 * PUT  /api/neuro-consults/[id]  — Update a consult record (notes, status)
 */

import { NextResponse } from 'next/server'
import { getConsult } from '@/lib/consult/pipeline'
import { from } from '@/lib/db-query'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/neuro-consults/[id]
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const consult = await getConsult(id)

    if (!consult) {
      return NextResponse.json({ error: 'Consult not found' }, { status: 404 })
    }

    return NextResponse.json({ consult })
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
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
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

    const { data, error } = await from('neurology_consults')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ consult: data })
  } catch (error: unknown) {
    console.error(`PUT /api/neuro-consults/${id} error:`, error)
    const message = error instanceof Error ? error.message : 'Failed to update consult'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
