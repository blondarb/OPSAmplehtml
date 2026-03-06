import { invokeBedrockJSON } from '@/lib/bedrock'
import type { BedrockMessage } from '@/lib/bedrock'
import { buildFollowUpSystemPrompt } from '@/lib/follow-up/systemPrompt'
import {
  scanForEscalationTriggers,
  mergeEscalations,
  getHighestTier,
} from '@/lib/follow-up/escalationRules'
import type {
  PatientScenario,
  EscalationFlag,
  FollowUpModule,
  MedicationStatus,
  CaregiverInfo,
  DashboardUpdate,
} from '@/lib/follow-up/types'

export interface ConversationTurnInput {
  patient_message: string
  patient_context: PatientScenario
  conversation_history: Array<{ role: string; content: string }>
}

export interface ConversationTurnOutput {
  agent_response: string
  current_module: FollowUpModule
  escalation_triggered: boolean
  all_flags: EscalationFlag[]
  highest_tier: string
  medication_status: MedicationStatus[]
  caregiver_info: CaregiverInfo
  conversation_complete: boolean
  dashboard_update: DashboardUpdate
  extracted_data: {
    functional_status: string | null
    functional_details: string | null
    patient_questions: string[]
  }
}

const FALLBACK_OUTPUT: ConversationTurnOutput = {
  agent_response: "I'm sorry, could you repeat that?",
  current_module: 'greeting',
  escalation_triggered: false,
  all_flags: [],
  highest_tier: 'none',
  medication_status: [],
  caregiver_info: { isCaregiver: false, name: null, relationship: null },
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
  extracted_data: {
    functional_status: null,
    functional_details: null,
    patient_questions: [],
  },
}

/**
 * Core conversation turn logic — shared between browser chat and Twilio SMS webhook.
 * Takes a patient message + context, calls AWS Bedrock Claude, runs escalation detection,
 * returns structured output. Does NOT handle Supabase persistence (caller does that).
 *
 * Note: The `apiKey` parameter is kept for backward compatibility but is no longer used.
 * AWS credentials come from environment variables.
 */
export async function processConversationTurn(
  input: ConversationTurnInput,
  _apiKey: string
): Promise<ConversationTurnOutput> {
  const { patient_message, patient_context, conversation_history } = input

  // Build system prompt
  const systemPrompt = buildFollowUpSystemPrompt(patient_context)

  // Construct messages array — Bedrock Claude uses user/assistant only (no system role in messages)
  const messages: BedrockMessage[] = []

  if (conversation_history && conversation_history.length > 0) {
    for (const entry of conversation_history) {
      const role = entry.role === 'agent' ? 'assistant' : entry.role
      if (role === 'user' || role === 'assistant') {
        messages.push({
          role: role as 'user' | 'assistant',
          content: entry.content,
        })
      }
    }
  }

  if (patient_message !== undefined && patient_message !== '') {
    messages.push({ role: 'user', content: patient_message })
  }

  // Call Bedrock with timeout
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25000)

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
    const result = await invokeBedrockJSON({
      system: systemPrompt,
      messages,
      maxTokens: 2000,
      temperature: 1,
      signal: controller.signal,
    })
    aiOutput = result.parsed as typeof aiOutput
  } catch (parseErr) {
    // If JSON parse fails, check if it's an abort
    if (parseErr instanceof Error && parseErr.name === 'AbortError') {
      throw parseErr
    }
    console.error('Failed to parse follow-up AI response:', parseErr)
    return { ...FALLBACK_OUTPUT }
  } finally {
    clearTimeout(timeout)
  }

  // Run regex escalation safety net
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

  // Merge escalations
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

  const status = conversationComplete
    ? 'completed'
    : escalationTriggered && highestTier === 'urgent'
      ? 'escalated'
      : 'in_progress'

  return {
    agent_response: aiOutput.agent_message || "I'm sorry, could you repeat that?",
    current_module: currentModule,
    escalation_triggered: escalationTriggered,
    all_flags: allFlags,
    highest_tier: highestTier,
    medication_status: medicationStatus,
    caregiver_info: caregiverInfo,
    conversation_complete: conversationComplete,
    dashboard_update: {
      status: status as DashboardUpdate['status'],
      currentModule: currentModule,
      flags: allFlags,
      medicationStatus: medicationStatus,
      functionalStatus: extractedData.functional_status || null,
      functionalDetails: extractedData.functional_details || null,
      patientQuestions: extractedData.patient_questions || [],
      caregiverInfo: caregiverInfo,
    },
    extracted_data: {
      functional_status: extractedData.functional_status || null,
      functional_details: extractedData.functional_details || null,
      patient_questions: extractedData.patient_questions || [],
    },
  }
}
