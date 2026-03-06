import { createClient } from '@/lib/supabase/server'
import { validateTwilioSignature } from '@/lib/follow-up/twilioClient'
import { processConversationTurn } from '@/lib/follow-up/conversationEngine'
import { DEMO_SCENARIOS } from '@/lib/follow-up/demoScenarios'
import { suggestCptCode, CPT_CODES } from '@/lib/follow-up/cptCodes'
import { from, getOpenAIKey } from '@/lib/db-query'


export const maxDuration = 30

export async function POST(request: Request) {
  try {
    // Parse Twilio form-encoded body
    const formData = await request.formData()
    const params: Record<string, string> = {}
    formData.forEach((value, key) => { params[key] = value.toString() })

    // Validate Twilio signature (skip in development)
    if (process.env.NODE_ENV === 'production') {
      const signature = request.headers.get('X-Twilio-Signature') || ''
      const webhookUrl = `${process.env.TWILIO_WEBHOOK_BASE_URL}/api/follow-up/twilio-sms`
      if (!validateTwilioSignature(signature, webhookUrl, params)) {
        return new Response('Forbidden', { status: 403 })
      }
    }

    const fromPhone = params.From
    const messageBody = params.Body?.trim() || ''

    if (!fromPhone || !messageBody) {
      return twimlResponse('Sorry, something went wrong. Please try again.')
    }


    // Handle STOP opt-out
    if (messageBody.toUpperCase() === 'STOP') {
      await from('followup_phone_sessions')
        .update({ opted_out: true })
        .eq('phone_number', fromPhone)

      return twimlResponse('You have been opted out. You will not receive further messages from this demo. Reply START to re-enable.')
    }

    // Look up phone session
    const { data: phoneSession } = await from('followup_phone_sessions')
      .select('*')
      .eq('phone_number', fromPhone)
      .eq('opted_out', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!phoneSession) {
      return twimlResponse('This demo session has expired or was not found. Please start a new session at sevaro.ai.')
    }

    // Load the session transcript
    const { data: session } = await from('followup_sessions')
      .select('transcript')
      .eq('id', phoneSession.session_id)
      .single()

    const transcript = (session?.transcript as Array<{ role: string; text: string }>) || []

    // Convert transcript to conversation_history format for the engine
    const conversationHistory = transcript.map(entry => ({
      role: entry.role === 'agent' ? 'agent' : 'user',
      content: entry.text,
    }))

    // Find the scenario
    const scenario = DEMO_SCENARIOS.find(s => s.id === phoneSession.scenario_id)
    if (!scenario) {
      return twimlResponse('Session configuration error. Please start a new session.')
    }

    // Get OpenAI API key
    let apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      try {
        const { data: setting } = await getOpenAIKey()
        apiKey = setting
      } catch { /* fallback */ }
    }
    if (!apiKey) {
      return twimlResponse('AI service is temporarily unavailable. Please try again later.')
    }

    // Call the shared conversation engine
    const result = await processConversationTurn(
      { patient_message: messageBody, patient_context: scenario, conversation_history: conversationHistory },
      apiKey
    )

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
        transcript: updatedTranscript,
        medication_status: result.medication_status,
        escalation_level: result.highest_tier !== 'none' ? result.highest_tier : null,
        functional_status: result.extracted_data.functional_status,
        functional_details: result.extracted_data.functional_details,
        patient_questions: result.extracted_data.patient_questions,
        caregiver_info: result.caregiver_info,
        conversation_complete: result.conversation_complete,
      })
      .eq('id', phoneSession.session_id)

    // Append to sms_history on phone session
    const currentSmsHistory = (phoneSession.sms_history as Array<unknown>) || []
    await from('followup_phone_sessions')
      .update({ sms_history: [...currentSmsHistory, ...newEntries] })
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
          patient_id: null,
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
