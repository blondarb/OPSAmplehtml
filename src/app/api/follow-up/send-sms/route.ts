import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendSms, normalizePhoneNumber } from '@/lib/follow-up/twilioClient'
import { DEMO_SCENARIOS } from '@/lib/follow-up/demoScenarios'
import { from } from '@/lib/db-query'

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


    // Rate limit: max 1 active session per phone
    const { data: existingActive } = await from('followup_phone_sessions')
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

    // Rate limit: max 5 sessions per phone per 24h
    const { count: recentCount } = await from('followup_phone_sessions')
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

    const { error: sessionError } = await from('followup_sessions')
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

    // Create phone→session mapping
    const { error: phoneError } = await from('followup_phone_sessions')
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
