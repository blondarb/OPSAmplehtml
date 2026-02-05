import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const SEED_ADMIN_EMAIL = 'steve@sevaro.com'

// Temporary: allow all authenticated users admin access for feedback review
// TODO: Set to false once admin roles are fully configured in production
const ALLOW_ALL_ADMIN = true

async function getAuthenticatedAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, supabase, error: 'Unauthorized' }

  if (ALLOW_ALL_ADMIN) return { user, supabase, error: null }

  const emailLower = (user.email || '').toLowerCase()
  let isAdmin = emailLower === SEED_ADMIN_EMAIL

  if (!isAdmin) {
    const envAdmins = process.env.FEEDBACK_ADMIN_EMAILS
    if (envAdmins) {
      const adminList = envAdmins.split(',').map(e => e.trim().toLowerCase())
      if (adminList.includes(emailLower)) isAdmin = true
    }
  }

  if (!isAdmin) {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'feedback_admin_emails')
        .single()
      if (data?.value) {
        const adminList = data.value.split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean)
        if (adminList.includes(emailLower)) isAdmin = true
      }
    } catch {
      // No setting yet
    }
  }

  if (!isAdmin) return { user, supabase, error: 'Admin access required' }
  return { user, supabase, error: null }
}

// GET /api/feedback/admin - Get admin list and system prompts overview
export async function GET() {
  const { user, supabase, error } = await getAuthenticatedAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error) return NextResponse.json({ error }, { status: 403 })

  // Get elevated admins
  let elevatedAdmins: string[] = []
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'feedback_admin_emails')
      .single()
    if (data?.value) {
      elevatedAdmins = data.value.split(',').map((e: string) => e.trim()).filter(Boolean)
    }
  } catch {
    // Not configured yet
  }

  // System prompts inventory (read-only overview)
  const systemPrompts = [
    {
      id: 'historian-core',
      name: 'AI Historian - Core',
      file: 'src/lib/historianPrompts.ts',
      model: 'gpt-realtime',
      description: 'Main system prompt for AI neurologic historian voice interviews. Includes safety monitoring, one-question-at-a-time rules, and OLDCARTS framework.',
    },
    {
      id: 'historian-new-patient',
      name: 'AI Historian - New Patient',
      file: 'src/lib/historianPrompts.ts',
      model: 'gpt-realtime',
      description: 'Interview structure for new patient intake using OLDCARTS framework for chief complaint characterization.',
    },
    {
      id: 'historian-follow-up',
      name: 'AI Historian - Follow-up',
      file: 'src/lib/historianPrompts.ts',
      model: 'gpt-realtime',
      description: 'Interview structure for follow-up visits focused on interval changes and treatment response.',
    },
    {
      id: 'ask-ai',
      name: 'Ask AI',
      file: 'src/app/api/ai/ask/route.ts',
      model: 'gpt-5-mini',
      description: 'Clinical AI assistant for neurology Q&A. Provides evidence-based responses with patient context.',
    },
    {
      id: 'chart-prep',
      name: 'Chart Prep',
      file: 'src/app/api/ai/chart-prep/route.ts',
      model: 'gpt-5-mini',
      description: 'Pre-visit summary generator. Returns narrative summary, alerts, suggested HPI/assessment/plan.',
    },
    {
      id: 'field-action-improve',
      name: 'Field Action - Improve',
      file: 'src/app/api/ai/field-action/route.ts',
      model: 'gpt-5-mini',
      description: 'Improves clinical text quality without adding new information.',
    },
    {
      id: 'field-action-expand',
      name: 'Field Action - Expand',
      file: 'src/app/api/ai/field-action/route.ts',
      model: 'gpt-5-mini',
      description: 'Expands clinical text with strict anti-hallucination guardrails (temp 0.3).',
    },
    {
      id: 'field-action-summarize',
      name: 'Field Action - Summarize',
      file: 'src/app/api/ai/field-action/route.ts',
      model: 'gpt-5-mini',
      description: 'Condenses clinical text using only explicitly stated information.',
    },
    {
      id: 'generate-assessment',
      name: 'Generate Assessment',
      file: 'src/app/api/ai/generate-assessment/route.ts',
      model: 'gpt-5.2',
      description: 'Generates clinical assessment from selected diagnoses and patient context.',
    },
    {
      id: 'note-review',
      name: 'Note Review',
      file: 'src/app/api/ai/note-review/route.ts',
      model: 'gpt-5-mini',
      description: 'Reviews notes for consistency, completeness, and quality. Max 6 suggestions.',
    },
    {
      id: 'scale-autofill',
      name: 'Scale Autofill',
      file: 'src/app/api/ai/scale-autofill/route.ts',
      model: 'gpt-5.2',
      description: 'Extracts scale data from clinical notes with confidence scoring (temp 0.1).',
    },
    {
      id: 'synthesize-note',
      name: 'Synthesize Note',
      file: 'src/app/api/ai/synthesize-note/route.ts',
      model: 'gpt-5.2',
      description: 'Merges multiple information sources into a cohesive clinical note. Supports concise/standard/detailed lengths.',
    },
    {
      id: 'transcribe',
      name: 'Transcribe & Cleanup',
      file: 'src/app/api/ai/transcribe/route.ts',
      model: 'gpt-5-mini',
      description: 'Medical transcription editor. Fixes grammar/spelling while preserving all content.',
    },
    {
      id: 'visit-ai',
      name: 'Visit AI',
      file: 'src/app/api/ai/visit-ai/route.ts',
      model: 'gpt-5.2',
      description: 'Extracts HPI, ROS, exam, assessment, and plan from visit transcripts with confidence scores.',
    },
  ]

  return NextResponse.json({
    seedAdmin: SEED_ADMIN_EMAIL,
    elevatedAdmins,
    systemPrompts,
  })
}

// POST /api/feedback/admin - Add an elevated admin
export async function POST(request: Request) {
  const { user, supabase, error } = await getAuthenticatedAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error) return NextResponse.json({ error }, { status: 403 })

  const body = await request.json()
  const { email } = body

  if (!email || !email.trim() || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }

  const newEmail = email.trim().toLowerCase()
  if (newEmail === SEED_ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Seed admin is already permanent' }, { status: 400 })
  }

  // Get current list
  let currentAdmins: string[] = []
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'feedback_admin_emails')
      .single()
    if (data?.value) {
      currentAdmins = data.value.split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean)
    }
  } catch {
    // Not configured yet
  }

  if (currentAdmins.includes(newEmail)) {
    return NextResponse.json({ error: 'Email is already an admin' }, { status: 400 })
  }

  const updatedList = [...currentAdmins, newEmail].join(',')

  // Upsert into app_settings
  const { error: upsertError } = await supabase
    .from('app_settings')
    .upsert(
      { key: 'feedback_admin_emails', value: updatedList, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({ elevatedAdmins: [...currentAdmins, newEmail] })
}

// DELETE /api/feedback/admin - Remove an elevated admin
export async function DELETE(request: Request) {
  const { user, supabase, error } = await getAuthenticatedAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error) return NextResponse.json({ error }, { status: 403 })

  const body = await request.json()
  const { email } = body

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const removeEmail = email.trim().toLowerCase()
  if (removeEmail === SEED_ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Cannot remove the seed admin' }, { status: 400 })
  }

  // Get current list
  let currentAdmins: string[] = []
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'feedback_admin_emails')
      .single()
    if (data?.value) {
      currentAdmins = data.value.split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean)
    }
  } catch {
    return NextResponse.json({ error: 'No admin list found' }, { status: 404 })
  }

  const updatedList = currentAdmins.filter(e => e !== removeEmail)

  const { error: updateError } = await supabase
    .from('app_settings')
    .upsert(
      { key: 'feedback_admin_emails', value: updatedList.join(','), updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ elevatedAdmins: updatedList })
}
