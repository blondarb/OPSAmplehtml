import { NextResponse } from 'next/server'
import { from } from '@/lib/db-query'
import { getPool } from '@/lib/db'
import { createConsult, getConsult } from '@/lib/consult/pipeline'
import { createNotification } from '@/lib/notifications'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { authorizeClinicalOrPatientAccess } from '@/lib/patientAccess/routeAuthorization'

// POST /api/patient/intake — Submit a patient intake form
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const access = await authorizeClinicalOrPatientAccess({
      clinicalAction: 'patient.intake_write',
      clinicalRoles: ['scheduler', 'clinician', 'admin'],
      patientScopes: ['patient:intake:submit'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }

    const tenant = access.context.tenantId

    if (
      access.principal === 'patient' &&
      ((body.patient_id !== undefined &&
        body.patient_id !== access.context.patientId) ||
        (body.tenant_id !== undefined &&
          body.tenant_id !== access.context.tenantId) ||
        (body.consult_id !== undefined &&
          body.consult_id !== (access.context.consultId ?? null)))
    ) {
      return NextResponse.json(
        { error: 'Access denied', reason: 'binding_mismatch' },
        { status: 403 },
      )
    }

    const { patient_name, chief_complaint } = body
    if (!patient_name || !chief_complaint) {
      return NextResponse.json(
        { error: 'patient_name and chief_complaint are required' },
        { status: 400 },
      )
    }

    const patientId =
      access.principal === 'patient'
        ? access.context.patientId
        : typeof body.patient_id === 'string' && body.patient_id.trim()
          ? body.patient_id.trim()
          : null

    if (patientId) {
      const pool = await getPool()
      const patientResult = await pool.query(
        `SELECT id
           FROM patients
          WHERE id = $1
            AND tenant_id = $2
          LIMIT 1`,
        [patientId, tenant],
      )
      if (!patientResult.rows[0]) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
      }
    }

    const capabilityConsultId =
      access.principal === 'patient' ? access.context.consultId ?? null : null
    if (capabilityConsultId) {
      const boundConsult = await getConsult(capabilityConsultId, tenant)
      if (!boundConsult || boundConsult.patient_id !== patientId) {
        return NextResponse.json(
          { error: 'Access denied', reason: 'binding_mismatch' },
          { status: 403 },
        )
      }
    }

    const insertData: Record<string, unknown> = {
      tenant_id: tenant,
      patient_name: body.patient_name,
      date_of_birth: body.date_of_birth || null,
      email: body.email || null,
      phone: body.phone || null,
      chief_complaint: body.chief_complaint,
      current_medications: body.current_medications || null,
      allergies: body.allergies || null,
      medical_history: body.medical_history || null,
      family_history: body.family_history || null,
      notes: body.notes || null,
    }

    // Link to patient record if patient_id is provided
    if (patientId) {
      insertData.patient_id = patientId
    }

    const { data, error } = await from('patient_intake_forms')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.error('Intake insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Auto-create a consult pipeline record so the intake feeds into the
    // clinical workflow (triage -> historian -> physician review).
    let consultId: string | null = capabilityConsultId
    try {
      const referralText = `Patient intake: ${body.chief_complaint}${body.medical_history ? ` | History: ${body.medical_history}` : ''}`
      if (!consultId) {
        const consultResult = await createConsult(
          referralText,
          undefined, // No triage data yet — consult starts in 'triage_pending'
          patientId || undefined,
          tenant,
        )
        consultId = consultResult.data?.id || null
      }

      if (consultId && data?.id) {
        // Link the intake form to the consult record
        await from('neurology_consults')
          .update({
            intake_session_id: data.id.toString(),
            intake_status: 'completed',
            intake_summary: body.chief_complaint,
            intake_completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', consultId)
          .eq('tenant_id', tenant)
      }
    } catch (consultErr) {
      // Non-fatal — the intake is saved regardless
      console.error('[intake] Consult pipeline creation error (non-fatal):', consultErr)
    }

    // Generate a notification for the clinical team
    try {
      await createNotification({
        sourceType: 'intake_received',
        title: `New intake from ${body.patient_name}`,
        body: body.chief_complaint,
        priority: 'normal',
        sourceId: data?.id?.toString() || null,
        patientId,
        tenantId: tenant,
      })
    } catch (notifErr) {
      // Non-fatal
      console.error('[intake] Notification error (non-fatal):', notifErr)
    }

    return NextResponse.json({ intake: data, consult_id: consultId }, { status: 201 })
  } catch {
    console.error('[patient-intake] request failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/patient/intake — List intake forms for current tenant
export async function GET() {
  try {
    const access = await authorizeClinicalAccess({
      action: 'patient.intake_read',
      allowedRoles: ['viewer', 'scheduler', 'clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }
    const tenant = access.context.tenantId

    const { data, error } = await from('patient_intake_forms')
      .select('*')
      .eq('tenant_id', tenant)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ intakes: data })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
