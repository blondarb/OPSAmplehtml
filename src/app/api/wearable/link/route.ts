import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { from } from '@/lib/db-query'

/**
 * POST /api/wearable/link
 *
 * Link a wearable patient (sevaro_monitor) to an OPSAmple patient.
 * Body: { patient_id: UUID, wearable_patient_id: string, source?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { patient_id, wearable_patient_id, source } = body

    if (!patient_id || !wearable_patient_id) {
      return NextResponse.json(
        { error: 'patient_id and wearable_patient_id are required.' },
        { status: 400 },
      )
    }

    // Verify the OPSAmple patient exists
    const { data: patient, error: patientError } = await from('patients')
      .select('id')
      .eq('id', patient_id)
      .maybeSingle()

    if (patientError) {
      return NextResponse.json({ error: patientError.message }, { status: 500 })
    }
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found.' }, { status: 404 })
    }

    const { data, error } = await from('patient_wearable_links')
      .insert({
        patient_id,
        wearable_patient_id,
        source: source || 'sevaro_monitor',
        linked_by: user.email || user.id,
      })
      .select()
      .single()

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate')) {
        return NextResponse.json(
          { error: 'This wearable patient is already linked to this patient.' },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ link: data }, { status: 201 })
  } catch (err: unknown) {
    console.error('Wearable link POST error:', err)
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/wearable/link?patient_id=UUID
 *
 * List linked wearable patients for a given OPSAmple patient.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const patientId = request.nextUrl.searchParams.get('patient_id')
    if (!patientId) {
      return NextResponse.json(
        { error: 'patient_id query parameter is required.' },
        { status: 400 },
      )
    }

    const { data, error } = await from('patient_wearable_links')
      .select('*')
      .eq('patient_id', patientId)
      .order('linked_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ links: data || [] })
  } catch (err: unknown) {
    console.error('Wearable link GET error:', err)
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/wearable/link
 *
 * Unlink a wearable patient from an OPSAmple patient.
 * Body: { patient_id: UUID, wearable_patient_id: string }
 *   OR: { link_id: UUID }
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { link_id, patient_id, wearable_patient_id } = body

    if (!link_id && (!patient_id || !wearable_patient_id)) {
      return NextResponse.json(
        { error: 'Provide link_id, or both patient_id and wearable_patient_id.' },
        { status: 400 },
      )
    }

    let query = from('patient_wearable_links').delete()
    if (link_id) {
      query = query.eq('id', link_id)
    } else {
      query = query.eq('patient_id', patient_id).eq('wearable_patient_id', wearable_patient_id)
    }

    const { data, error } = await query.select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Link not found.' }, { status: 404 })
    }

    return NextResponse.json({ deleted: data })
  } catch (err: unknown) {
    console.error('Wearable link DELETE error:', err)
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
