import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processConversationTurn } from '@/lib/follow-up/conversationEngine'
import type { FollowUpMessageRequest, FollowUpMessageResponse } from '@/lib/follow-up/types'
import { suggestCptCode, CPT_CODES } from '@/lib/follow-up/cptCodes'

export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const body: FollowUpMessageRequest = await request.json()
    const { session_id, patient_message, patient_context, conversation_history } = body

    // Validate input
    if (!patient_context) {
      return NextResponse.json(
        { error: 'patient_context is required' },
        { status: 400 }
      )
    }

    // Get OpenAI API key — env var first, then Supabase app_settings
    let apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      try {
        const supabase = await createClient()
        const { data: setting } = await supabase.rpc('get_openai_key')
        apiKey = setting
      } catch {
        // Supabase may not be available in demo mode
      }
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Please add your API key to the environment variables.' },
        { status: 500 }
      )
    }

    // Call shared conversation engine
    const result = await processConversationTurn(
      { patient_message, patient_context, conversation_history },
      apiKey
    )

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

    // Supabase operations
    try {
      const supabase = await createClient()

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
        const { data: inserted, error: insertError } = await supabase
          .from('followup_sessions')
          .insert({
            id: newSessionId,
            patient_id: patient_context.id,
            patient_name: patient_context.name,
            patient_age: patient_context.age,
            patient_gender: patient_context.gender,
            diagnosis: patient_context.diagnosis,
            visit_date: patient_context.visitDate,
            provider_name: patient_context.providerName,
            medications: patient_context.medications,
            visit_summary: patient_context.visitSummary,
            follow_up_method: 'sms',
            status: result.dashboard_update.status,
            current_module: result.current_module,
            transcript: newTranscriptEntries,
            medication_status: result.medication_status,
            escalation_level: result.highest_tier !== 'none' ? result.highest_tier : null,
            functional_status: result.extracted_data.functional_status,
            functional_details: result.extracted_data.functional_details,
            patient_questions: result.extracted_data.patient_questions,
            caregiver_info: result.caregiver_info,
          })
          .select('id')
          .single()

        if (insertError) {
          console.error('Supabase insert error (non-fatal):', insertError)
        } else if (inserted) {
          responsePayload.session_id = inserted.id
        }
      } else {
        // Existing session — UPDATE
        const { data: existing } = await supabase
          .from('followup_sessions')
          .select('transcript')
          .eq('id', session_id)
          .single()

        const currentTranscript = (existing?.transcript as Array<unknown>) || []
        const updatedTranscript = [...currentTranscript, ...newTranscriptEntries]

        const { error: updateError } = await supabase
          .from('followup_sessions')
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
          .eq('id', session_id)

        if (updateError) {
          console.error('Supabase update error (non-fatal):', updateError)
        }
      }

      // Insert escalation record if triggered
      if (result.escalation_triggered && result.all_flags.length > 0) {
        const topFlag = result.all_flags[0]
        const { error: escError } = await supabase
          .from('followup_escalations')
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
          console.error('Supabase escalation insert error (non-fatal):', escError)
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

          await supabase.from('followup_billing_entries').insert({
            session_id: responsePayload.session_id,
            patient_id: patient_context.id || null,
            patient_name: patient_context.name,
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
      console.error('Supabase storage error (non-fatal):', err)
    }

    return NextResponse.json(responsePayload)
  } catch (error: unknown) {
    console.error('Follow-up message API error:', error)

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Processing is taking longer than expected. Please try again.' },
        { status: 504 }
      )
    }

    const message = error instanceof Error ? error.message : 'An error occurred while processing your request'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
