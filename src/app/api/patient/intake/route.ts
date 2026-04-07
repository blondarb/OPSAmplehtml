import { NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { getTenantServer } from '@/lib/tenant'
import { from } from '@/lib/db-query'
import { createConsult } from '@/lib/consult/pipeline'
import { createNotification } from '@/lib/notifications'

// POST /api/patient/intake — Submit a patient intake form
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const tenant = body.tenant_id || getTenantServer()

    const { patient_name, chief_complaint } = body
    if (!patient_name || !chief_complaint) {
      return NextResponse.json(
        { error: 'patient_name and chief_complaint are required' },
        { status: 400 },
      )
    }


    const insertData: Record<string, any> = {
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
    if (body.patient_id) {
      insertData.patient_id = body.patient_id
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
    let consultId: string | null = null
    try {
      const referralText = `Patient intake: ${body.chief_complaint}${body.medical_history ? ` | History: ${body.medical_history}` : ''}`
      const consultResult = await createConsult(
        referralText,
        undefined, // No triage data yet — consult starts in 'triage_pending'
        body.patient_id || undefined,
      )
      consultId = consultResult.data?.id || null

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
        patientId: body.patient_id || null,
      })
    } catch (notifErr) {
      // Non-fatal
      console.error('[intake] Notification error (non-fatal):', notifErr)
    }

    return NextResponse.json({ intake: data, consult_id: consultId }, { status: 201 })
  } catch (err: any) {
    console.error('Intake API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET /api/patient/intake — List intake forms for current tenant
export async function GET() {
  try {
    const tenant = getTenantServer()

    const { data, error } = await from('patient_intake_forms')
      .select('*')
      .eq('tenant_id', tenant)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ intakes: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
