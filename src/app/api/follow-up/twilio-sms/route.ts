import { validateTwilioSignature } from '@/lib/follow-up/twilioClient'
import { processConversationTurn } from '@/lib/follow-up/conversationEngine'
import { DEMO_SCENARIOS } from '@/lib/follow-up/demoScenarios'
import type { PatientScenario } from '@/lib/follow-up/types'
import { suggestCptCode, CPT_CODES } from '@/lib/follow-up/cptCodes'
import { from } from '@/lib/db-query'
import { getPool } from '@/lib/db'
import { getTwilioCredentials } from '@/lib/secrets'
import { loadSchedulingAuthorization } from '@/lib/triage/schedulingAuthorization'


export const maxDuration = 30

export async function POST(request: Request) {
  try {
    // Pre-flight: verify Twilio is configured before processing webhook
    const creds = await getTwilioCredentials()
    if (!creds.account_sid || !creds.auth_token) {
      return twimlResponse('SMS service is not configured. Please contact your administrator.')
    }

    // Parse Twilio form-encoded body
    const formData = await request.formData()
    const params: Record<string, string> = {}
    formData.forEach((value, key) => { params[key] = value.toString() })

    // This endpoint is intentionally public so Twilio can reach it, but it is
    // never unsigned. Preview/staging endpoints are internet-reachable too, so
    // do not weaken authentication based on NODE_ENV.
    const webhookBaseUrl = process.env.TWILIO_WEBHOOK_BASE_URL?.trim()
    if (!webhookBaseUrl) {
      return new Response('Service unavailable', { status: 503 })
    }
    let webhookUrl: string
    try {
      webhookUrl = new URL('/api/follow-up/twilio-sms', webhookBaseUrl).toString()
    } catch {
      return new Response('Service unavailable', { status: 503 })
    }
    const signature = request.headers.get('X-Twilio-Signature') || ''
    if (!signature || !await validateTwilioSignature(signature, webhookUrl, params)) {
      return new Response('Forbidden', { status: 403 })
    }

    const fromPhone = params.From
    const toPhone = params.To
    const messageBody = params.Body?.trim() || ''

    if (!fromPhone || !toPhone || !messageBody) {
      return twimlResponse('Sorry, something went wrong. Please try again.')
    }


    // Handle STOP opt-out
    if (messageBody.toUpperCase() === 'STOP') {
      await from('followup_phone_sessions')
        .update({ opted_out: true })
        .eq('phone_number', fromPhone)
        .eq('twilio_number', toPhone)

      return twimlResponse('You have been opted out. You will not receive further messages from this demo. Reply START to re-enable.')
    }

    // Look up phone session
    const { data: phoneSession } = await from('followup_phone_sessions')
      .select('*')
      .eq('phone_number', fromPhone)
      .eq('twilio_number', toPhone)
      .eq('opted_out', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!phoneSession) {
      return twimlResponse('This demo session has expired or was not found. Please start a new session at sevaro.ai.')
    }

    // The signed phone mapping supplies the opaque session id. Resolve all
    // clinical context on the server and preserve the owning tenant.
    const pool = await getPool()
    const { rows: sessionRows } = await pool.query(
      `SELECT fs.*,
              p.id AS tenant_patient_id,
              nc.id AS consult_id,
              nc.triage_session_id
         FROM followup_sessions fs
         LEFT JOIN patients p
           ON p.id = fs.patient_id
          AND p.tenant_id = fs.tenant_id
         LEFT JOIN neurology_consults nc
           ON nc.intake_session_id = fs.id
          AND nc.tenant_id = fs.tenant_id
        WHERE fs.id = $1
        LIMIT 2`,
      [phoneSession.session_id],
    )
    if (sessionRows.length !== 1) {
      return twimlResponse('This follow-up session is unavailable. Please contact your care team.')
    }
    const session = sessionRows[0] as Record<string, unknown>

    const transcript = parseTranscript(session.transcript)

    // Convert transcript to conversation_history format for the engine
    const conversationHistory = transcript.map(entry => ({
      role: entry.role === 'agent' ? 'agent' : 'user',
      content: entry.text,
    }))

    // Legacy synthetic mappings remain usable until their 24-hour expiry.
    // New clinical mappings use only the authoritative tenant session.
    const legacyScenario = DEMO_SCENARIOS.find(
      scenario => scenario.id === phoneSession.scenario_id,
    )
    const scenario =
      phoneSession.scenario_id === 'tenant-session'
        ? scenarioFromSession(session)
        : legacyScenario
    if (!scenario) {
      return twimlResponse('Session configuration error. Please start a new session.')
    }
    if (
      phoneSession.scenario_id === 'tenant-session' &&
      (!session.patient_id || session.patient_id !== session.tenant_patient_id)
    ) {
      return twimlResponse('This follow-up session is unavailable. Please contact your care team.')
    }

    const tenantId = String(session.tenant_id || '')
    const consultId = session.consult_id ? String(session.consult_id) : null
    const triageSessionId = session.triage_session_id
      ? String(session.triage_session_id)
      : null
    if (consultId && !triageSessionId) {
      return twimlResponse(
        'Your care team needs to review this follow-up before the conversation can continue. If this is an emergency, call 911.',
      )
    }
    if (triageSessionId) {
      const safety = await loadSchedulingAuthorization(triageSessionId, tenantId)
      if (!safety.decision.allowed) {
        return twimlResponse(
          'Your care team needs to review this follow-up before the conversation can continue. If this is an emergency, call 911.',
        )
      }
    }

    // Call the shared conversation engine (uses Bedrock — no API key needed)
    const result = await processConversationTurn(
      { patient_message: messageBody, patient_context: scenario, conversation_history: conversationHistory },
      '' // API key param kept for backward compatibility; engine uses Bedrock env credentials
    )

    if (triageSessionId) {
      const currentSafety = await loadSchedulingAuthorization(
        triageSessionId,
        tenantId,
      )
      if (!currentSafety.decision.allowed) {
        return twimlResponse(
          'Your care team needs to review this follow-up before the conversation can continue. If this is an emergency, call 911.',
        )
      }
    }

    // Build new transcript entries
    const newEntries = [
      { role: 'patient', text: messageBody, timestamp: Date.now() },
      { role: 'agent', text: result.agent_response, timestamp: Date.now() },
    ]
    const updatedTranscript = [...transcript, ...newEntries]

    // Update followup_sessions
    await from('followup_sessions')
      .update({
        status: result.dashboard_update.status,
        current_module: result.current_module,
        // db-query preserves JavaScript arrays for PostgreSQL array columns.
        // These columns are JSONB, so encode explicitly rather than relying on
        // node-postgres array serialization (which produces a PG array literal).
        transcript: JSON.stringify(updatedTranscript),
        medication_status: JSON.stringify(result.medication_status),
        escalation_level: result.highest_tier !== 'none' ? result.highest_tier : null,
        functional_status: result.extracted_data.functional_status,
        functional_details: result.extracted_data.functional_details,
        patient_questions: JSON.stringify(result.extracted_data.patient_questions),
        caregiver_info: result.caregiver_info,
        conversation_complete: result.conversation_complete,
      })
      .eq('id', phoneSession.session_id)
      .eq('tenant_id', tenantId)

    // Append to sms_history on phone session
    const currentSmsHistory = (phoneSession.sms_history as Array<unknown>) || []
    await from('followup_phone_sessions')
      .update({ sms_history: JSON.stringify([...currentSmsHistory, ...newEntries]) })
      .eq('id', phoneSession.id)

    // Insert escalation record if triggered
    if (result.escalation_triggered && result.all_flags.length > 0) {
      const topFlag = result.all_flags[0]
      await from('followup_escalations').insert({
        session_id: phoneSession.session_id,
        tier: topFlag.tier,
        severity: topFlag.tier,
        trigger_text: topFlag.triggerText,
        category: topFlag.category,
        trigger_category: topFlag.category,
        ai_assessment: topFlag.aiAssessment,
        recommended_action: topFlag.recommendedAction,
      })
    }

    // Auto-create billing entry on completion
    if (result.conversation_complete) {
      try {
        const turnCount = updatedTranscript.length
        const callMinutes = Math.max(Math.ceil(turnCount / 2), 5)
        const hasEscalation = result.highest_tier === 'urgent' || result.highest_tier === 'same_day'
        const coordMinutes = hasEscalation ? 10 : 0
        const billingTotal = 2 + callMinutes + 5 + coordMinutes
        const cptCode = suggestCptCode('ccm', billingTotal)
        const cptRate = CPT_CODES[cptCode]?.rate || 37.07

        await from('followup_billing_entries').insert({
          session_id: phoneSession.session_id,
          patient_id: session.patient_id || null,
          patient_name: scenario.name,
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
      } catch (err) {
        console.error('Billing entry error (non-fatal):', err)
      }
    }

    return twimlResponse(result.agent_response)
  } catch (error) {
    console.error('twilio-sms webhook error:', error)
    return twimlResponse('I apologize, but I encountered an error. Please try sending your message again.')
  }
}

function parseTranscript(
  value: unknown,
): Array<{ role: string; text: string; timestamp?: number }> {
  if (Array.isArray(value)) {
    return value as Array<{ role: string; text: string; timestamp?: number }>
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed)
        ? (parsed as Array<{ role: string; text: string; timestamp?: number }>)
        : []
    } catch {
      return []
    }
  }
  return []
}

function scenarioFromSession(session: Record<string, unknown>): PatientScenario | null {
  if (!session.patient_id) return null
  const medications = (() => {
    if (Array.isArray(session.medications)) return session.medications
    if (typeof session.medications === 'string') {
      try {
        const parsed = JSON.parse(session.medications)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }
    return []
  })()
  const visitDate =
    session.visit_date instanceof Date
      ? session.visit_date.toISOString().split('T')[0]
      : String(session.visit_date || '')

  return {
    id: String(session.patient_id),
    name: String(session.patient_name || 'Patient'),
    age: Number.isFinite(Number(session.patient_age))
      ? Number(session.patient_age)
      : 0,
    gender: String(session.patient_gender || 'Unknown'),
    diagnosis: String(session.diagnosis || 'Not documented'),
    visitDate,
    providerName: String(session.provider_name || 'Provider'),
    medications: medications as PatientScenario['medications'],
    visitSummary: String(session.visit_summary || 'Follow-up session'),
  }
}

function twimlResponse(message: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
  return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
