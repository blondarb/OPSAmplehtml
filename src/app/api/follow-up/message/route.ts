import { NextResponse } from 'next/server'
import { processConversationTurn } from '@/lib/follow-up/conversationEngine'
import type {
  FollowUpMessageRequest,
  FollowUpMessageResponse,
  PatientScenario,
} from '@/lib/follow-up/types'
import { suggestCptCode, CPT_CODES } from '@/lib/follow-up/cptCodes'
import { from } from '@/lib/db-query'
import { getConsult, linkIntakeToConsult } from '@/lib/consult/pipeline'
import { notifyFollowUpEscalation } from '@/lib/notifications'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { getPool } from '@/lib/db'
import { loadSchedulingAuthorization } from '@/lib/triage/schedulingAuthorization'


export const maxDuration = 30

interface ExistingFollowUpBinding {
  id: string
  session_patient_id: string | null
  patient_name: string | null
  patient_age: number | null
  patient_gender: string | null
  diagnosis: string | null
  visit_date: string | Date | null
  provider_name: string | null
  medications: unknown
  visit_summary: string | null
  consult_id: string | null
  consult_patient_id: string | null
  triage_session_id: string | null
}

function parseMedications(value: unknown): PatientScenario['medications'] {
  if (Array.isArray(value)) return value as PatientScenario['medications']
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed)
        ? (parsed as PatientScenario['medications'])
        : []
    } catch {
      return []
    }
  }
  return []
}

function authoritativePatientContext(
  binding: ExistingFollowUpBinding,
  requested: PatientScenario,
  patientId: string,
): PatientScenario {
  const visitDate =
    binding.visit_date instanceof Date
      ? binding.visit_date.toISOString().split('T')[0]
      : binding.visit_date

  return {
    id: patientId,
    name: binding.patient_name || requested.name,
    age: binding.patient_age != null && Number.isFinite(Number(binding.patient_age))
      ? Number(binding.patient_age)
      : requested.age,
    gender: binding.patient_gender || requested.gender,
    diagnosis: binding.diagnosis || requested.diagnosis,
    visitDate: visitDate || requested.visitDate,
    providerName: binding.provider_name || requested.providerName,
    medications:
      binding.medications == null
        ? requested.medications
        : parseMedications(binding.medications),
    visitSummary: binding.visit_summary || requested.visitSummary,
  }
}

export async function POST(request: Request) {
  const access = await authorizeClinicalAccess({
    action: 'follow_up.message',
    allowedRoles: ['clinician', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: 'Access denied', reason: access.reason },
      { status: access.status },
    )
  }

  try {
    const body = await request.json()
    const {
      session_id,
      patient_message,
      patient_context: requestedPatientContext,
      conversation_history,
      // Phase 1 pipeline — optional consult linkage
      consult_id,
    } = body as FollowUpMessageRequest & { consult_id?: string }

    // Validate input
    if (!requestedPatientContext) {
      return NextResponse.json(
        { error: 'patient_context is required' },
        { status: 400 }
      )
    }

    const pool = await getPool()
    if (requestedPatientContext.id) {
      const { rows } = await pool.query(
        `SELECT id
           FROM patients
          WHERE id = $1
            AND tenant_id = $2
          LIMIT 1`,
        [requestedPatientContext.id, access.context.tenantId],
      )
      if (!rows[0]) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
      }
    }

    const requestedConsultId =
      typeof consult_id === 'string' && consult_id.trim()
        ? consult_id.trim()
        : undefined
    let consultId = requestedConsultId
    let triageSessionId: string | null = null
    let patientContext = requestedPatientContext

    if (session_id) {
      const { rows } = await pool.query(
        `SELECT fs.id,
                fs.patient_id AS session_patient_id,
                fs.patient_name,
                fs.patient_age,
                fs.patient_gender,
                fs.diagnosis,
                fs.visit_date,
                fs.provider_name,
                fs.medications,
                fs.visit_summary,
                nc.id AS consult_id,
                nc.patient_id AS consult_patient_id,
                nc.triage_session_id
           FROM followup_sessions fs
           LEFT JOIN neurology_consults nc
             ON nc.intake_session_id = fs.id
            AND nc.tenant_id = fs.tenant_id
          WHERE fs.id = $1
            AND fs.tenant_id = $2
          LIMIT 2`,
        [session_id, access.context.tenantId],
      )
      if (rows.length === 0) {
        return NextResponse.json(
          { error: 'Follow-up session not found' },
          { status: 404 },
        )
      }
      if (rows.length !== 1) {
        return NextResponse.json(
          {
            error: 'Follow-up session binding is inconsistent',
            reason: 'follow_up_session_binding_conflict',
          },
          { status: 409 },
        )
      }

      const binding = rows[0] as ExistingFollowUpBinding
      if (
        binding.session_patient_id &&
        binding.consult_patient_id &&
        binding.session_patient_id !== binding.consult_patient_id
      ) {
        return NextResponse.json(
          {
            error: 'Follow-up session binding is inconsistent',
            reason: 'follow_up_session_binding_conflict',
          },
          { status: 409 },
        )
      }

      const boundPatientId =
        binding.consult_patient_id || binding.session_patient_id
      if (!boundPatientId) {
        return NextResponse.json(
          {
            error: 'Follow-up session has no authoritative patient binding',
            reason: 'follow_up_session_patient_unbound',
          },
          { status: 409 },
        )
      }
      if (
        requestedPatientContext.id &&
        requestedPatientContext.id !== boundPatientId
      ) {
        return NextResponse.json(
          {
            error: 'Patient context does not match the follow-up session',
            reason: 'follow_up_session_patient_mismatch',
          },
          { status: 409 },
        )
      }
      if (
        requestedConsultId &&
        requestedConsultId !== binding.consult_id
      ) {
        return NextResponse.json(
          {
            error: 'Consult does not match the follow-up session',
            reason: 'follow_up_session_consult_mismatch',
          },
          { status: 409 },
        )
      }

      consultId = binding.consult_id || undefined
      triageSessionId = binding.triage_session_id
      patientContext = authoritativePatientContext(
        binding,
        requestedPatientContext,
        boundPatientId,
      )
    }

    if (consultId && !session_id) {
      const consult = await getConsult(consultId, access.context.tenantId)
      if (!consult) {
        return NextResponse.json({ error: 'Consult not found' }, { status: 404 })
      }
      if (!consult.patient_id || !patientContext.id) {
        return NextResponse.json(
          {
            error: 'Consult-linked follow-up requires an authoritative patient binding',
            reason: 'follow_up_consult_patient_binding_required',
          },
          { status: 409 },
        )
      }
      if (
        consult.patient_id !== patientContext.id
      ) {
        return NextResponse.json(
          { error: 'Patient and consult binding do not match' },
          { status: 409 },
        )
      }
      if (!consult.triage_session_id) {
        return NextResponse.json(
          {
            error: 'Follow-up agent is blocked by triage safety state',
            reason: 'triage_authorization_missing',
          },
          { status: 409 },
        )
      }
      triageSessionId = consult.triage_session_id
    }

    if (consultId) {
      if (!triageSessionId) {
        return NextResponse.json(
          {
            error: 'Follow-up agent is blocked by triage safety state',
            reason: 'triage_authorization_missing',
          },
          { status: 409 },
        )
      }
      const safetyAuthorization = await loadSchedulingAuthorization(
        triageSessionId,
        access.context.tenantId,
      )
      if (!safetyAuthorization.decision.allowed) {
        return NextResponse.json(
          {
            error: 'Follow-up agent is blocked by triage safety state',
            reason: safetyAuthorization.decision.reason,
          },
          { status: 409 },
        )
      }
    }

    // Call shared conversation engine (uses Bedrock — no API key needed)
    const result = await processConversationTurn(
      { patient_message, patient_context: patientContext, conversation_history },
      '' // API key param kept for backward compatibility; engine uses Bedrock env credentials
    )

    // Bedrock processing is an external call. Re-read the safety state before
    // returning its response or writing any turn data so an emergency hold
    // raised while the model was running wins the race.
    if (consultId && triageSessionId) {
      const currentSafetyAuthorization = await loadSchedulingAuthorization(
        triageSessionId,
        access.context.tenantId,
      )
      if (!currentSafetyAuthorization.decision.allowed) {
        return NextResponse.json(
          {
            error: 'Follow-up agent is blocked by triage safety state',
            reason: currentSafetyAuthorization.decision.reason,
          },
          { status: 409 },
        )
      }
    }

    // Build the response
    const responsePayload: FollowUpMessageResponse = {
      session_id: session_id || crypto.randomUUID(),
      agent_response: result.agent_response,
      current_module: result.current_module,
      escalation_triggered: result.escalation_triggered,
      escalation_details: result.all_flags.length > 0 ? result.all_flags[0] : null,
      conversation_complete: result.conversation_complete,
      dashboard_update: result.dashboard_update,
    }

    // DB operations
    try {

      // Build transcript entry for this turn
      const newTranscriptEntries = []
      if (patient_message) {
        newTranscriptEntries.push({
          role: 'patient',
          text: patient_message,
          timestamp: Date.now(),
        })
      }
      newTranscriptEntries.push({
        role: 'agent',
        text: responsePayload.agent_response,
        timestamp: Date.now(),
      })

      if (!session_id) {
        // First message — INSERT new session
        const newSessionId = responsePayload.session_id
        const { data: inserted, error: insertError } = await from('followup_sessions')
          .insert({
            id: newSessionId,
            tenant_id: access.context.tenantId,
            patient_id: patientContext.id,
            patient_name: patientContext.name,
            patient_age: patientContext.age,
            patient_gender: patientContext.gender,
            diagnosis: patientContext.diagnosis,
            visit_date: patientContext.visitDate,
            provider_name: patientContext.providerName,
            medications: JSON.stringify(patientContext.medications || []),
            visit_summary: patientContext.visitSummary,
            follow_up_method: 'sms',
            status: result.dashboard_update.status,
            current_module: result.current_module,
            // db-query intentionally leaves arrays untouched for PostgreSQL
            // array columns. Encode these JSONB arrays explicitly.
            transcript: JSON.stringify(newTranscriptEntries),
            medication_status: JSON.stringify(result.medication_status),
            escalation_level: result.highest_tier !== 'none' ? result.highest_tier : null,
            functional_status: result.extracted_data.functional_status,
            functional_details: result.extracted_data.functional_details,
            patient_questions: JSON.stringify(result.extracted_data.patient_questions),
            caregiver_info: result.caregiver_info,
          })
          .select('id')
          .single()

        if (insertError) {
          console.error('DB insert error (non-fatal):', insertError)
        } else if (inserted) {
          responsePayload.session_id = inserted.id
        }
      } else {
        // Existing session — UPDATE
        const { data: existing } = await from('followup_sessions')
          .select('transcript')
          .eq('id', session_id)
          .eq('tenant_id', access.context.tenantId)
          .single()

        const currentTranscript = (existing?.transcript as Array<unknown>) || []
        const updatedTranscript = [...currentTranscript, ...newTranscriptEntries]

        const { error: updateError } = await from('followup_sessions')
          .update({
            status: result.dashboard_update.status,
            current_module: result.current_module,
            transcript: JSON.stringify(updatedTranscript),
            medication_status: JSON.stringify(result.medication_status),
            escalation_level: result.highest_tier !== 'none' ? result.highest_tier : null,
            functional_status: result.extracted_data.functional_status,
            functional_details: result.extracted_data.functional_details,
            patient_questions: JSON.stringify(result.extracted_data.patient_questions),
            caregiver_info: result.caregiver_info,
            conversation_complete: result.conversation_complete,
          })
          .eq('id', session_id)
          .eq('tenant_id', access.context.tenantId)

        if (updateError) {
          console.error('DB update error (non-fatal):', updateError)
        }
      }

      // Insert escalation record if triggered
      if (result.escalation_triggered && result.all_flags.length > 0) {
        const topFlag = result.all_flags[0]
        const { error: escError } = await from('followup_escalations')
          .insert({
            session_id: responsePayload.session_id,
            tier: topFlag.tier,
            severity: topFlag.tier,
            trigger_text: topFlag.triggerText,
            category: topFlag.category,
            trigger_category: topFlag.category,
            ai_assessment: topFlag.aiAssessment,
            recommended_action: topFlag.recommendedAction,
          })

        if (escError) {
          console.error('DB escalation insert error (non-fatal):', escError)
        }

        // Fire escalation notification (non-blocking)
        notifyFollowUpEscalation(
          responsePayload.session_id,
          patientContext.name || 'Unknown Patient',
          topFlag.tier,
          topFlag.tier,
          topFlag.category,
          patientContext.id || null,
          access.context.tenantId,
        ).catch(err => console.error('Follow-up escalation notification error (non-fatal):', err))
      }

      // ── Phase 1: Link intake session to consult pipeline ──────────────────
      // Non-fatal — follow-up still works without consult linkage.
      if (consultId) {
        try {
          const linkedSessionId = responsePayload.session_id
          if (result.conversation_complete) {
            // Build a brief intake summary from extracted data
            const summaryParts: string[] = []
            if (result.extracted_data?.functional_status) {
              summaryParts.push(`Functional status: ${result.extracted_data.functional_status}`)
            }
            if (result.medication_status && result.medication_status.length > 0) {
              const medSummary = result.medication_status
                .map((m: { medication: string; taking: boolean | null; sideEffects: string[] }) =>
                  `${m.medication}: ${m.taking ? 'taking' : 'not taking'}${m.sideEffects?.length ? ` (SE: ${m.sideEffects.join(', ')})` : ''}`,
                )
                .join('; ')
              summaryParts.push(`Medications: ${medSummary}`)
            }
            if (result.extracted_data?.patient_questions?.length > 0) {
              summaryParts.push(`Patient questions: ${result.extracted_data.patient_questions.join('; ')}`)
            }
            await linkIntakeToConsult(
              consultId,
              linkedSessionId,
              'intake_complete',
              summaryParts.join('\n'),
              result.highest_tier !== 'none' ? result.highest_tier : null,
              access.context.tenantId,
            )
          } else if (!session_id) {
            // First message — mark intake as in progress
            await linkIntakeToConsult(
              consultId,
              linkedSessionId,
              'intake_in_progress',
              undefined,
              undefined,
              access.context.tenantId,
            )
          }
        } catch (pipelineErr) {
          console.error('Consult pipeline linkage error (non-fatal):', pipelineErr)
        }
      }

      // Auto-create billing entry when conversation completes
      if (result.conversation_complete) {
        try {
          const turnCount = (conversation_history?.length || 0) + 2
          const callMinutes = Math.max(Math.ceil(turnCount / 2), 5)
          const hasEscalation = result.highest_tier === 'urgent' || result.highest_tier === 'same_day'
          const coordMinutes = hasEscalation ? 10 : 0
          const billingTotal = 2 + callMinutes + 5 + coordMinutes
          const cptCode = suggestCptCode('ccm', billingTotal)
          const cptRate = CPT_CODES[cptCode]?.rate || 37.07

          await from('followup_billing_entries').insert({
            session_id: responsePayload.session_id,
            patient_id: patientContext.id || null,
            patient_name: patientContext.name,
            service_date: new Date().toISOString().split('T')[0],
            billing_month: new Date().toISOString().slice(0, 7),
            program: 'ccm',
            cpt_code: cptCode,
            cpt_rate: cptRate,
            prep_minutes: 2,
            call_minutes: callMinutes,
            documentation_minutes: 5,
            coordination_minutes: coordMinutes,
            total_minutes: billingTotal,
            meets_threshold: billingTotal >= (CPT_CODES[cptCode]?.minMinutes || 20),
            billing_status: 'not_reviewed',
          })
        } catch (billingErr) {
          console.error('Billing entry auto-create error (non-fatal):', billingErr)
        }
      }
    } catch (err) {
      // Non-fatal — follow-up still works without DB storage in demo mode
      console.error('DB storage error (non-fatal):', err)
    }

    return NextResponse.json(responsePayload)
  } catch (error: unknown) {
    console.error('[follow-up/message] request failed')

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Processing is taking longer than expected. Please try again.' },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: 'An error occurred while processing your request' },
      { status: 500 },
    )
  }
}
