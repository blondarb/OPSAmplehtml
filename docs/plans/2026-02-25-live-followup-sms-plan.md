# Live Follow-Up Agent — Phase A (SMS) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a real-phone SMS demo to the AI Follow-Up Agent — user enters phone number, receives a real text, replies via SMS, clinician dashboard updates in real-time.

**Architecture:** Twilio SDK sends outbound SMS via a new `/api/follow-up/send-sms` route. Inbound replies hit a Twilio webhook at `/api/follow-up/twilio-sms` which reuses the existing conversation engine (extracted into a shared function). A new `LiveDemoPanel` component provides the UI. A new `followup_phone_sessions` Supabase table maps phone numbers to sessions (24hr auto-expiry). The `ClinicianDashboard` gets a Supabase Realtime subscription for server-side updates.

**Tech Stack:** Next.js 15 (App Router), Twilio Node SDK v5, Supabase (PostgreSQL + Realtime), OpenAI GPT-5.2, TypeScript

**Design Doc:** `docs/plans/2026-02-25-live-followup-agent-design.md`

---

## Pre-Implementation: Schema Mismatches

**Critical discovery:** Migration 022 defines `followup_sessions` with column `conversation_status`, but the route code writes to `status`. Additionally, the route writes to 8+ columns that don't exist in the migration (`patient_age`, `patient_gender`, `diagnosis`, `visit_summary`, `medications`, `medication_status`, `caregiver_info`, `current_module`, `conversation_complete`). The `followup_escalations` table has `severity`/`trigger_category` but the code writes `tier`/`category`. All writes silently fail in try/catch blocks.

**Decision:** Fix these with a schema migration (Task 1) before building the Twilio integration, because the SMS webhook needs working Supabase persistence.

---

### Task 1: Fix Schema Mismatches + Add followup_phone_sessions

**Files:**
- Create: `supabase/migrations/031_followup_schema_fix_and_phone_sessions.sql`

**Step 1: Write the migration**

```sql
-- 031_followup_schema_fix_and_phone_sessions.sql
-- Fixes column mismatches in followup_sessions/followup_escalations
-- and adds followup_phone_sessions for Twilio SMS demo.
-- ================================================================

-- 1. Add missing columns to followup_sessions
ALTER TABLE followup_sessions ADD COLUMN IF NOT EXISTS patient_age INTEGER;
ALTER TABLE followup_sessions ADD COLUMN IF NOT EXISTS patient_gender TEXT;
ALTER TABLE followup_sessions ADD COLUMN IF NOT EXISTS diagnosis TEXT;
ALTER TABLE followup_sessions ADD COLUMN IF NOT EXISTS visit_summary TEXT;
ALTER TABLE followup_sessions ADD COLUMN IF NOT EXISTS medications JSONB DEFAULT '[]'::jsonb;
ALTER TABLE followup_sessions ADD COLUMN IF NOT EXISTS medication_status JSONB DEFAULT '[]'::jsonb;
ALTER TABLE followup_sessions ADD COLUMN IF NOT EXISTS caregiver_info JSONB;
ALTER TABLE followup_sessions ADD COLUMN IF NOT EXISTS current_module TEXT DEFAULT 'greeting';
ALTER TABLE followup_sessions ADD COLUMN IF NOT EXISTS conversation_complete BOOLEAN DEFAULT false;

-- 2. Add 'status' as an alias-friendly column (the code writes 'status', migration defined 'conversation_status')
--    Rather than renaming (which could break other queries), add a generated column is not possible for writes.
--    Simplest fix: add 'status' column, keep 'conversation_status' for backward compat.
ALTER TABLE followup_sessions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'in_progress';

-- 3. Fix followup_escalations: add 'tier' and 'category' columns (code writes these, schema has 'severity'/'trigger_category')
ALTER TABLE followup_escalations ADD COLUMN IF NOT EXISTS tier TEXT;
ALTER TABLE followup_escalations ADD COLUMN IF NOT EXISTS category TEXT;

-- 4. New table: followup_phone_sessions (maps phone numbers to sessions for Twilio)
CREATE TABLE IF NOT EXISTS followup_phone_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL,
  session_id UUID REFERENCES followup_sessions(id),
  scenario_id TEXT NOT NULL,
  twilio_number TEXT NOT NULL,
  channel TEXT DEFAULT 'sms',
  sms_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours'),
  opted_out BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_phone_sessions_phone ON followup_phone_sessions(phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_sessions_session ON followup_phone_sessions(session_id);

-- 5. Enable realtime for followup_sessions (needed for dashboard live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE followup_sessions;
```

**Step 2: Apply the migration**

Run: `npx supabase db push` (or apply via Supabase dashboard)

**Step 3: Commit**

```bash
git add supabase/migrations/031_followup_schema_fix_and_phone_sessions.sql
git commit -m "fix: add missing followup_sessions columns + followup_phone_sessions table"
```

---

### Task 2: Install Twilio SDK

**Step 1: Install**

```bash
npm install twilio
```

**Step 2: Verify**

```bash
node -e "require('twilio'); console.log('OK')"
```

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add twilio SDK dependency"
```

---

### Task 3: Build twilioClient.ts

**Files:**
- Create: `src/lib/follow-up/twilioClient.ts`

**Step 1: Write the helper**

```typescript
import twilio from 'twilio'

// Lazy-init Twilio client (avoid build-time env var access)
let _client: twilio.Twilio | null = null

function getClient(): twilio.Twilio {
  if (!_client) {
    const sid = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    if (!sid || !token) {
      throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set')
    }
    _client = twilio(sid, token)
  }
  return _client
}

/**
 * Send an SMS via Twilio.
 */
export async function sendSms(to: string, body: string): Promise<string> {
  const from = process.env.TWILIO_PHONE_NUMBER
  if (!from) throw new Error('TWILIO_PHONE_NUMBER must be set')

  const message = await getClient().messages.create({ to, from, body })
  return message.sid
}

/**
 * Validate an inbound Twilio webhook signature.
 * Returns true if the request is authentic.
 */
export function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!token) return false
  return twilio.validateRequest(token, signature, url, params)
}

/**
 * Validate and normalize a US phone number to E.164 format.
 * Returns null if invalid.
 */
export function normalizePhoneNumber(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.startsWith('+') && digits.length >= 11) return input.replace(/[^\d+]/g, '')
  return null
}
```

**Step 2: Commit**

```bash
git add src/lib/follow-up/twilioClient.ts
git commit -m "feat: add Twilio client helper (sendSms, validateSignature, normalizePhone)"
```

---

### Task 4: Extract Shared Conversation Logic from Message Route

**Files:**
- Create: `src/lib/follow-up/conversationEngine.ts`
- Modify: `src/app/api/follow-up/message/route.ts`

This is the most critical refactor. Extract the core AI conversation turn logic (system prompt build → OpenAI call → escalation detection → response construction) into a shared function. Both the existing browser chat route and the new Twilio SMS webhook will call this function.

**Step 1: Create the shared engine**

Extract lines 59-232 of `src/app/api/follow-up/message/route.ts` into a new file `src/lib/follow-up/conversationEngine.ts`:

```typescript
import OpenAI from 'openai'
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

const AI_MODEL = 'gpt-5.2'

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

/**
 * Core conversation turn logic — shared between browser chat and Twilio SMS webhook.
 * Takes a patient message + context, calls OpenAI, runs escalation detection,
 * returns structured output. Does NOT handle Supabase persistence (caller does that).
 */
export async function processConversationTurn(
  input: ConversationTurnInput,
  apiKey: string
): Promise<ConversationTurnOutput> {
  const { patient_message, patient_context, conversation_history } = input
  const openai = new OpenAI({ apiKey })

  // Build system prompt
  const systemPrompt = buildFollowUpSystemPrompt(patient_context)

  // Construct messages array
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]

  if (conversation_history && conversation_history.length > 0) {
    for (const entry of conversation_history) {
      const role = entry.role === 'agent' ? 'assistant' : entry.role
      messages.push({
        role: role as 'user' | 'assistant',
        content: entry.content,
      })
    }
  }

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
    throw new Error('Empty response from AI model')
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
    // Return a graceful fallback
    return {
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
```

**Step 2: Refactor the existing message route to use the shared engine**

Replace the core logic in `src/app/api/follow-up/message/route.ts` (lines 59-232) with a call to `processConversationTurn()`. Keep the Supabase persistence logic (lines 234-376) and the HTTP request/response handling in the route. The route becomes:

1. Parse request body, validate `patient_context`
2. Resolve API key (env var → Supabase fallback)
3. Call `processConversationTurn({ patient_message, patient_context, conversation_history }, apiKey)`
4. Build `FollowUpMessageResponse` from the output
5. Persist to Supabase (unchanged)
6. Return JSON response

The key change is replacing ~170 lines of inline logic with a single function call. The Supabase persistence stays in the route because the Twilio webhook will do its own persistence (slightly different: it also updates `followup_phone_sessions`).

**Step 3: Verify the existing browser chat still works**

Run: `npm run build` — should compile clean
Manual: Start dev server, go to `/follow-up/conversation`, pick a scenario, send a message, verify AI responds

**Step 4: Commit**

```bash
git add src/lib/follow-up/conversationEngine.ts src/app/api/follow-up/message/route.ts
git commit -m "refactor: extract conversation engine into shared function for Twilio reuse"
```

---

### Task 5: Build POST /api/follow-up/send-sms

**Files:**
- Create: `src/app/api/follow-up/send-sms/route.ts`

This route is called by the `LiveDemoPanel` when the user clicks "Send Me a Text." It:
1. Validates the phone number
2. Looks up the selected demo scenario
3. Creates a `followup_sessions` row
4. Creates a `followup_phone_sessions` row (maps phone → session)
5. Sends the initial SMS via Twilio
6. Returns `{ session_id, status: 'sent' }`

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendSms, normalizePhoneNumber } from '@/lib/follow-up/twilioClient'
import { DEMO_SCENARIOS } from '@/lib/follow-up/demoScenarios'

export async function POST(request: Request) {
  try {
    const { phone_number, scenario_id } = await request.json()

    // Validate phone
    const normalized = normalizePhoneNumber(phone_number)
    if (!normalized) {
      return NextResponse.json({ error: 'Invalid US phone number' }, { status: 400 })
    }

    // Find scenario
    const scenario = DEMO_SCENARIOS.find(s => s.id === scenario_id)
    if (!scenario) {
      return NextResponse.json({ error: 'Unknown scenario' }, { status: 400 })
    }

    const twilioNumber = process.env.TWILIO_PHONE_NUMBER
    if (!twilioNumber) {
      return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 })
    }

    const supabase = await createClient()

    // Check rate limit: max 1 active session per phone, 5 per 24h
    const { data: existingActive } = await supabase
      .from('followup_phone_sessions')
      .select('id')
      .eq('phone_number', normalized)
      .eq('opted_out', false)
      .gt('expires_at', new Date().toISOString())
      .limit(1)

    if (existingActive && existingActive.length > 0) {
      return NextResponse.json(
        { error: 'You already have an active session. Please wait for it to complete or expire.' },
        { status: 429 }
      )
    }

    const { count: recentCount } = await supabase
      .from('followup_phone_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('phone_number', normalized)

    if (recentCount && recentCount >= 5) {
      return NextResponse.json(
        { error: 'Maximum demo sessions reached for this number. Try again later.' },
        { status: 429 }
      )
    }

    // Create followup_sessions row
    const sessionId = crypto.randomUUID()
    const med = scenario.medications[0]
    const initialGreeting = `Hi ${scenario.name.split(' ')[0]}, this is the Sevaro Neurology care team following up after your recent visit with Dr. ${scenario.providerName} on ${scenario.visitDate}. We'd like to check in about your ${med?.name || 'treatment'}. You can reply here by text, or call this number if you'd prefer to talk. Reply STOP to opt out.`

    const { error: sessionError } = await supabase
      .from('followup_sessions')
      .insert({
        id: sessionId,
        patient_id: null,
        patient_name: scenario.name,
        patient_age: scenario.age,
        patient_gender: scenario.gender,
        diagnosis: scenario.diagnosis,
        visit_date: scenario.visitDate,
        provider_name: scenario.providerName,
        medications: scenario.medications,
        visit_summary: scenario.visitSummary,
        follow_up_method: 'sms',
        status: 'in_progress',
        current_module: 'greeting',
        transcript: [{ role: 'agent', text: initialGreeting, timestamp: Date.now() }],
      })

    if (sessionError) {
      console.error('Failed to create session:', sessionError)
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }

    // Create phone session mapping
    const { error: phoneError } = await supabase
      .from('followup_phone_sessions')
      .insert({
        phone_number: normalized,
        session_id: sessionId,
        scenario_id: scenario.id,
        twilio_number: twilioNumber,
        channel: 'sms',
        sms_history: [{ role: 'agent', text: initialGreeting, timestamp: Date.now() }],
      })

    if (phoneError) {
      console.error('Failed to create phone session:', phoneError)
      return NextResponse.json({ error: 'Failed to create phone session' }, { status: 500 })
    }

    // Send SMS via Twilio
    const messageSid = await sendSms(normalized, initialGreeting)
    console.log(`SMS sent to ${normalized}, SID: ${messageSid}, session: ${sessionId}`)

    return NextResponse.json({ session_id: sessionId, status: 'sent' })
  } catch (error) {
    console.error('send-sms error:', error)
    const msg = error instanceof Error ? error.message : 'Failed to send SMS'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/follow-up/send-sms/route.ts
git commit -m "feat: add send-sms API route (outbound Twilio SMS for live demo)"
```

---

### Task 6: Build POST /api/follow-up/twilio-sms Webhook

**Files:**
- Create: `src/app/api/follow-up/twilio-sms/route.ts`

This is the Twilio webhook that receives inbound SMS replies. It:
1. Validates the Twilio signature
2. Looks up the phone session
3. Loads the conversation history from the session
4. Calls `processConversationTurn()` (shared engine)
5. Updates both `followup_sessions` and `followup_phone_sessions`
6. Responds with TwiML containing the AI reply

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateTwilioSignature } from '@/lib/follow-up/twilioClient'
import { processConversationTurn } from '@/lib/follow-up/conversationEngine'
import { DEMO_SCENARIOS } from '@/lib/follow-up/demoScenarios'
import { suggestCptCode, CPT_CODES } from '@/lib/follow-up/cptCodes'

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

    const fromPhone = params.From // E.164 format
    const messageBody = params.Body?.trim() || ''

    if (!fromPhone || !messageBody) {
      return twimlResponse('Sorry, something went wrong. Please try again.')
    }

    // Handle STOP opt-out
    if (messageBody.toUpperCase() === 'STOP') {
      const supabase = await createClient()
      await supabase
        .from('followup_phone_sessions')
        .update({ opted_out: true })
        .eq('phone_number', fromPhone)

      return twimlResponse('You have been opted out. You will not receive further messages from this demo. Reply START to re-enable.')
    }

    // Look up phone session
    const supabase = await createClient()
    const { data: phoneSession } = await supabase
      .from('followup_phone_sessions')
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
    const { data: session } = await supabase
      .from('followup_sessions')
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
        const { data: setting } = await supabase.rpc('get_openai_key')
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
      .eq('id', phoneSession.session_id)

    if (updateError) {
      console.error('Session update error:', updateError)
    }

    // Append to sms_history on phone session
    const currentSmsHistory = (phoneSession.sms_history as Array<unknown>) || []
    await supabase
      .from('followup_phone_sessions')
      .update({
        sms_history: [...currentSmsHistory, ...newEntries],
      })
      .eq('id', phoneSession.id)

    // Insert escalation record if triggered
    if (result.escalation_triggered && result.all_flags.length > 0) {
      const topFlag = result.all_flags[0]
      await supabase.from('followup_escalations').insert({
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

        await supabase.from('followup_billing_entries').insert({
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

    // Respond with TwiML
    return twimlResponse(result.agent_response)
  } catch (error) {
    console.error('twilio-sms webhook error:', error)
    return twimlResponse('I apologize, but I encountered an error. Please try sending your message again.')
  }
}

/**
 * Build a TwiML XML response with a <Message> body.
 */
function twimlResponse(message: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
  return new Response(xml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
```

**Step 2: Commit**

```bash
git add src/app/api/follow-up/twilio-sms/route.ts
git commit -m "feat: add Twilio SMS webhook (inbound reply handler with conversation engine)"
```

---

### Task 7: Build LiveDemoPanel Component

**Files:**
- Create: `src/components/follow-up/LiveDemoPanel.tsx`

The panel shows a phone number input, scenario dropdown, and "Send Me a Text" button. After sending, it shows status and the session ID (so the parent page can subscribe to Supabase Realtime updates).

```typescript
'use client'

import { useState } from 'react'
import { DEMO_SCENARIOS } from '@/lib/follow-up/demoScenarios'
import { Smartphone, Send, Shield } from 'lucide-react'

interface LiveDemoPanelProps {
  onSessionStarted: (sessionId: string) => void
}

export default function LiveDemoPanel({ onSessionStarted }: LiveDemoPanelProps) {
  const [phone, setPhone] = useState('')
  const [scenarioId, setScenarioId] = useState(DEMO_SCENARIOS[0].id)
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSend() {
    if (!phone.trim()) return
    setStatus('sending')
    setErrorMsg('')

    try {
      const res = await fetch('/api/follow-up/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: phone, scenario_id: scenarioId }),
      })
      const data = await res.json()

      if (!res.ok) {
        setStatus('error')
        setErrorMsg(data.error || 'Failed to send SMS')
        return
      }

      setStatus('sent')
      onSessionStarted(data.session_id)
    } catch {
      setStatus('error')
      setErrorMsg('Network error. Please try again.')
    }
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      border: '1px solid #334155',
      borderRadius: 12,
      padding: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'linear-gradient(135deg, #16A34A, #22C55E)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Smartphone size={18} color="white" />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#fff' }}>
            Try It Live on Your Phone
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
            Get a real text message from the AI agent
          </p>
        </div>
      </div>

      {status !== 'sent' ? (
        <>
          {/* Scenario dropdown */}
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Scenario</span>
            <select
              value={scenarioId}
              onChange={e => setScenarioId(e.target.value)}
              disabled={status === 'sending'}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                background: '#334155', color: '#fff', border: '1px solid #475569',
                fontSize: 14, cursor: 'pointer',
              }}
            >
              {DEMO_SCENARIOS.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.diagnosis}
                </option>
              ))}
            </select>
          </label>

          {/* Phone input */}
          <label style={{ display: 'block', marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Your Phone Number</span>
            <input
              type="tel"
              placeholder="(555) 123-4567"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              disabled={status === 'sending'}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                background: '#334155', color: '#fff', border: '1px solid #475569',
                fontSize: 14, boxSizing: 'border-box',
              }}
            />
          </label>

          {/* Error message */}
          {status === 'error' && (
            <div style={{ color: '#F87171', fontSize: 13, marginBottom: 12 }}>
              {errorMsg}
            </div>
          )}

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!phone.trim() || status === 'sending'}
            style={{
              width: '100%', padding: '12px', borderRadius: 8,
              background: status === 'sending' ? '#334155' : '#16A34A',
              color: '#fff', border: 'none', fontSize: 14, fontWeight: 600,
              cursor: status === 'sending' ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Send size={16} />
            {status === 'sending' ? 'Sending...' : 'Send Me a Text'}
          </button>

          {/* Privacy note */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginTop: 12, fontSize: 11, color: '#64748b',
          }}>
            <Shield size={12} />
            Your number is used only for this demo and automatically deleted after 24 hours.
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 16px', borderRadius: 8,
            background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80',
            fontSize: 14, fontWeight: 500, marginBottom: 12,
          }}>
            SMS sent! Check your phone.
          </div>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: '8px 0 0' }}>
            Reply to the text to continue the conversation. The clinician dashboard on the right will update in real-time.
          </p>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/follow-up/LiveDemoPanel.tsx
git commit -m "feat: add LiveDemoPanel component (phone input + scenario picker for live SMS demo)"
```

---

### Task 8: Add Supabase Realtime Subscription to ClinicianDashboard

**Files:**
- Modify: `src/components/follow-up/ClinicianDashboard.tsx`

Add an optional `liveSessionId` prop. When provided, subscribe to Supabase Realtime on the `followup_sessions` table filtered by that session ID. On changes, update the dashboard state from the DB row (convert the stored `transcript`, `medication_status`, `current_module`, etc. into a `DashboardUpdate`).

Add to the component props:
```typescript
interface ClinicianDashboardProps {
  dashboard: DashboardUpdate | null
  escalationAlert: EscalationFlag | null
  sessionId: string | null
  liveSessionId?: string | null  // NEW: enables Supabase Realtime subscription
}
```

Add a `useEffect` that subscribes when `liveSessionId` is set:
- Subscribe to `postgres_changes` on `followup_sessions` with filter `id=eq.{liveSessionId}`
- On `UPDATE` events, map the payload row into a `DashboardUpdate` and call a local `setLiveDashboard` state setter
- The component renders `liveDashboard ?? dashboard` (live takes priority when available)
- Cleanup: unsubscribe on unmount or when `liveSessionId` changes

This is a targeted ~30-line addition to the existing component. The existing prop-driven behavior remains untouched for the browser chat path.

**Step 2: Commit**

```bash
git add src/components/follow-up/ClinicianDashboard.tsx
git commit -m "feat: add Supabase Realtime subscription to ClinicianDashboard for live SMS demo"
```

---

### Task 9: Integrate LiveDemoPanel into Conversation Page

**Files:**
- Modify: `src/app/follow-up/conversation/page.tsx`

Add the `LiveDemoPanel` above the existing `PatientSelector` in the `select` state. When a live session starts, store the `liveSessionId` and pass it to `ClinicianDashboard`. The page needs:

1. New state: `const [liveSessionId, setLiveSessionId] = useState<string | null>(null)`
2. Import `LiveDemoPanel`
3. In the `select` state block (line 148-152), add the panel:
   ```tsx
   <LiveDemoPanel onSessionStarted={(id) => setLiveSessionId(id)} />
   <div style={{ textAlign: 'center', color: '#64748b', fontSize: 13, margin: '8px 0' }}>— or try the in-browser simulation —</div>
   ```
4. Pass `liveSessionId` to `ClinicianDashboard`: `<ClinicianDashboard ... liveSessionId={liveSessionId} />`
5. Reset `liveSessionId` in `handleNewFollowUp()`

**Step 2: Commit**

```bash
git add src/app/follow-up/conversation/page.tsx
git commit -m "feat: integrate LiveDemoPanel into follow-up conversation page"
```

---

### Task 10: Build & Verify

**Step 1: Build**

```bash
npm run build
```

Expected: Clean compile, no TypeScript errors.

**Step 2: Manual verification checklist**

- [ ] Dev server starts (`npm run dev`)
- [ ] `/follow-up/conversation` loads with LiveDemoPanel visible above the patient selector
- [ ] Scenario dropdown shows 6 scenarios
- [ ] Phone number input accepts digits
- [ ] "Send Me a Text" button calls `/api/follow-up/send-sms` (check network tab)
- [ ] If Twilio env vars are missing, error message displays gracefully
- [ ] Existing in-browser simulation still works (select patient → chat → dashboard updates)

**Step 3: End-to-end test (requires Twilio credentials)**

1. Set env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_WEBHOOK_BASE_URL`
2. Configure Twilio webhook URL to point to `{TWILIO_WEBHOOK_BASE_URL}/api/follow-up/twilio-sms`
3. Enter real phone number → click "Send Me a Text" → receive SMS
4. Reply to SMS → AI responds → dashboard updates on screen
5. Text "STOP" → receive opt-out confirmation → no further messages

---

### Task 11: Update Documentation

**Files:**
- Modify: `CLAUDE.md` — update Recent Changes, add new routes to Project Structure
- Modify: `docs/IMPLEMENTATION_STATUS.md` — mark Phase A SMS as COMPLETE
- Modify: `playbooks/04_post_visit_agent.md` — update Phase 1.5 status

**Step 1: Commit all doc updates with the final code**

```bash
git add CLAUDE.md docs/IMPLEMENTATION_STATUS.md playbooks/04_post_visit_agent.md
git commit -m "docs: update implementation status and CLAUDE.md for Phase A SMS"
```

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | `supabase/migrations/031_*` | Fix schema mismatches + add `followup_phone_sessions` |
| 2 | `package.json` | Install `twilio` |
| 3 | `src/lib/follow-up/twilioClient.ts` | Send SMS, validate webhooks, normalize phones |
| 4 | `src/lib/follow-up/conversationEngine.ts` + refactor route | Extract shared AI conversation logic |
| 5 | `src/app/api/follow-up/send-sms/route.ts` | Outbound SMS trigger |
| 6 | `src/app/api/follow-up/twilio-sms/route.ts` | Inbound SMS webhook |
| 7 | `src/components/follow-up/LiveDemoPanel.tsx` | Phone input UI |
| 8 | Modify `ClinicianDashboard.tsx` | Supabase Realtime subscription |
| 9 | Modify `conversation/page.tsx` | Wire LiveDemoPanel into page |
| 10 | — | Build + verify |
| 11 | Docs | CLAUDE.md, implementation status, playbook |

**Estimated new/modified lines:** ~600 new + ~50 modified
**New dependencies:** `twilio` (npm)
**New env vars needed:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_WEBHOOK_BASE_URL`
