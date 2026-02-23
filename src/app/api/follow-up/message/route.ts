import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { buildFollowUpSystemPrompt } from '@/lib/follow-up/systemPrompt'
import {
  scanForEscalationTriggers,
  mergeEscalations,
  getHighestTier,
} from '@/lib/follow-up/escalationRules'
import type {
  FollowUpMessageRequest,
  FollowUpMessageResponse,
  EscalationFlag,
  FollowUpModule,
  MedicationStatus,
  CaregiverInfo,
} from '@/lib/follow-up/types'
import { suggestCptCode, CPT_CODES } from '@/lib/follow-up/cptCodes'

export const maxDuration = 30

const AI_MODEL = 'gpt-5.2'

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

    const openai = new OpenAI({ apiKey })

    // Build system prompt
    const systemPrompt = buildFollowUpSystemPrompt(patient_context)

    // Construct messages array for OpenAI
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ]

    // Add conversation history — convert 'agent' role to 'assistant' for OpenAI
    if (conversation_history && conversation_history.length > 0) {
      for (const entry of conversation_history) {
        const role = entry.role === 'agent' ? 'assistant' : entry.role
        messages.push({
          role: role as 'user' | 'assistant',
          content: entry.content,
        })
      }
    }

    // Add the new patient message (unless it's the first greeting trigger with empty message)
    if (patient_message !== undefined && patient_message !== '') {
      messages.push({ role: 'user', content: patient_message })
    }

    // Call OpenAI
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25000)

    let completion
    try {
      completion = await openai.chat.completions.create(
        {
          model: AI_MODEL,
          messages,
          response_format: { type: 'json_object' },
          temperature: 1,
        },
        { signal: controller.signal }
      )
    } finally {
      clearTimeout(timeout)
    }

    const rawContent = completion.choices[0]?.message?.content
    if (!rawContent) {
      return NextResponse.json(
        { error: 'The follow-up system is temporarily unavailable. Please try again.' },
        { status: 500 }
      )
    }

    // Parse AI response
    let aiOutput: {
      agent_message?: string
      current_module?: FollowUpModule
      escalation_triggered?: boolean
      escalation_details?: {
        tier?: string
        trigger_text?: string
        category?: string
        recommended_action?: string
      } | null
      conversation_complete?: boolean
      extracted_data?: {
        medication_status?: Array<{
          medication?: string
          filled?: boolean | null
          taking?: boolean | null
          side_effects?: string[]
        }>
        new_symptoms?: string[]
        functional_status?: string | null
        functional_details?: string | null
        patient_questions?: string[]
        caregiver_info?: {
          is_caregiver?: boolean
          name?: string | null
          relationship?: string | null
        }
      }
    }

    try {
      aiOutput = JSON.parse(rawContent)
    } catch {
      console.error('Failed to parse follow-up AI response:', rawContent)
      // Return a graceful fallback response
      const fallbackResponse: FollowUpMessageResponse = {
        session_id: session_id || crypto.randomUUID(),
        agent_response: "I'm sorry, could you repeat that?",
        current_module: 'greeting',
        escalation_triggered: false,
        escalation_details: null,
        conversation_complete: false,
        dashboard_update: {
          status: 'in_progress',
          currentModule: 'greeting',
          flags: [],
          medicationStatus: [],
          functionalStatus: null,
          functionalDetails: null,
          patientQuestions: [],
          caregiverInfo: { isCaregiver: false, name: null, relationship: null },
        },
      }
      return NextResponse.json(fallbackResponse)
    }

    // Run regex-based escalation safety net on patient message
    const regexFlags = patient_message ? scanForEscalationTriggers(patient_message) : []

    // Build AI-detected escalation flags
    const aiFlags: EscalationFlag[] = []
    if (aiOutput.escalation_triggered && aiOutput.escalation_details) {
      const details = aiOutput.escalation_details
      aiFlags.push({
        tier: (details.tier as EscalationFlag['tier']) || 'informational',
        triggerText: details.trigger_text || '',
        category: details.category || 'ai_detected',
        aiAssessment: `AI detected escalation: ${details.category || 'unknown'}`,
        recommendedAction: details.recommended_action || '',
        timestamp: new Date().toISOString(),
      })
    }

    // Merge escalations from AI and regex safety net
    const allFlags = mergeEscalations(aiFlags, regexFlags)
    const highestTier = getHighestTier(allFlags)
    const escalationTriggered = allFlags.length > 0

    // Map extracted data
    const extractedData = aiOutput.extracted_data || {}

    const medicationStatus: MedicationStatus[] = (extractedData.medication_status || []).map(
      (ms) => ({
        medication: ms.medication || '',
        filled: ms.filled ?? null,
        taking: ms.taking ?? null,
        sideEffects: ms.side_effects || [],
      })
    )

    const caregiverInfo: CaregiverInfo = {
      isCaregiver: extractedData.caregiver_info?.is_caregiver || false,
      name: extractedData.caregiver_info?.name || null,
      relationship: extractedData.caregiver_info?.relationship || null,
    }

    const currentModule: FollowUpModule = aiOutput.current_module || 'greeting'
    const conversationComplete = aiOutput.conversation_complete || false

    // Build the response
    const responsePayload: FollowUpMessageResponse = {
      session_id: session_id || crypto.randomUUID(),
      agent_response: aiOutput.agent_message || "I'm sorry, could you repeat that?",
      current_module: currentModule,
      escalation_triggered: escalationTriggered,
      escalation_details: allFlags.length > 0 ? allFlags[0] : null,
      conversation_complete: conversationComplete,
      dashboard_update: {
        status: conversationComplete
          ? 'completed'
          : escalationTriggered && highestTier === 'urgent'
            ? 'escalated'
            : 'in_progress',
        currentModule,
        flags: allFlags,
        medicationStatus,
        functionalStatus: extractedData.functional_status || null,
        functionalDetails: extractedData.functional_details || null,
        patientQuestions: extractedData.patient_questions || [],
        caregiverInfo,
      },
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
            status: responsePayload.dashboard_update.status,
            current_module: currentModule,
            transcript: newTranscriptEntries,
            medication_status: medicationStatus,
            escalation_level: highestTier !== 'none' ? highestTier : null,
            functional_status: extractedData.functional_status || null,
            functional_details: extractedData.functional_details || null,
            patient_questions: extractedData.patient_questions || [],
            caregiver_info: caregiverInfo,
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
        // Fetch current transcript to append
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
            status: responsePayload.dashboard_update.status,
            current_module: currentModule,
            transcript: updatedTranscript,
            medication_status: medicationStatus,
            escalation_level: highestTier !== 'none' ? highestTier : null,
            functional_status: extractedData.functional_status || null,
            functional_details: extractedData.functional_details || null,
            patient_questions: extractedData.patient_questions || [],
            caregiver_info: caregiverInfo,
            conversation_complete: conversationComplete,
          })
          .eq('id', session_id)

        if (updateError) {
          console.error('Supabase update error (non-fatal):', updateError)
        }
      }

      // Insert escalation record if triggered
      if (escalationTriggered && allFlags.length > 0) {
        const topFlag = allFlags[0]
        const { error: escError } = await supabase
          .from('followup_escalations')
          .insert({
            session_id: responsePayload.session_id,
            tier: topFlag.tier,
            trigger_text: topFlag.triggerText,
            category: topFlag.category,
            ai_assessment: topFlag.aiAssessment,
            recommended_action: topFlag.recommendedAction,
          })

        if (escError) {
          console.error('Supabase escalation insert error (non-fatal):', escError)
        }
      }

      // Auto-create billing entry when conversation completes
      if (conversationComplete) {
        try {
          // Estimate call duration from conversation turns (clinician adjusts actual time later)
          const turnCount = (conversation_history?.length || 0) + 2
          const callMinutes = Math.max(Math.ceil(turnCount / 2), 5)
          const hasEscalation = highestTier === 'urgent' || highestTier === 'same_day'
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
