import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Seed admin - always has admin access and cannot be removed
const SEED_ADMIN_EMAIL = 'steve@sevaro.com'

// Temporary: allow all authenticated users admin access for feedback review
// TODO: Set to false once admin roles are fully configured in production
const ALLOW_ALL_ADMIN = true

// Get list of elevated admin emails from app_settings
async function getElevatedAdmins(): Promise<string[]> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'feedback_admin_emails')
      .single()
    if (data?.value) {
      return data.value.split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean)
    }
  } catch {
    // No admin setting configured yet
  }
  return []
}

// Check if user is a feedback admin
async function isAdmin(email: string | undefined): Promise<boolean> {
  if (ALLOW_ALL_ADMIN) return true
  if (!email) return false
  const emailLower = email.toLowerCase()
  // Seed admin always has access
  if (emailLower === SEED_ADMIN_EMAIL) return true
  // Check environment variable (comma-separated emails)
  const envAdmins = process.env.FEEDBACK_ADMIN_EMAILS
  if (envAdmins) {
    const adminList = envAdmins.split(',').map(e => e.trim().toLowerCase())
    if (adminList.includes(emailLower)) return true
  }
  // Check elevated admins from app_settings
  const elevated = await getElevatedAdmins()
  return elevated.includes(emailLower)
}

// GET /api/feedback - List all feedback with comments count
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: feedback, error } = await supabase
    .from('feedback')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get comment counts for all feedback items
  const feedbackIds = (feedback || []).map(f => f.id)
  let commentCounts: Record<string, number> = {}
  if (feedbackIds.length > 0) {
    const { data: comments } = await supabase
      .from('feedback_comments')
      .select('feedback_id')
      .in('feedback_id', feedbackIds)
    if (comments) {
      for (const c of comments) {
        commentCounts[c.feedback_id] = (commentCounts[c.feedback_id] || 0) + 1
      }
    }
  }

  const enriched = (feedback || []).map(f => ({
    ...f,
    comment_count: commentCounts[f.id] || 0,
  }))

  const userIsAdmin = await isAdmin(user.email || undefined)

  return NextResponse.json({
    feedback: enriched,
    currentUserId: user.id,
    isAdmin: userIsAdmin,
  })
}

// POST /api/feedback - Submit new feedback
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { text } = body

  if (!text || !text.trim()) {
    return NextResponse.json({ error: 'Feedback text is required' }, { status: 400 })
  }

  const { data: feedback, error } = await supabase
    .from('feedback')
    .insert({
      text: text.trim(),
      user_id: user.id,
      user_email: user.email || 'Anonymous',
      upvotes: [],
      downvotes: [],
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ feedback })
}

// PATCH /api/feedback - Vote on feedback OR update status (admin)
export async function PATCH(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { feedbackId, voteType, action, status, adminResponse, text } = body

  if (!feedbackId) {
    return NextResponse.json({ error: 'feedbackId is required' }, { status: 400 })
  }

  // Edit feedback text (own feedback only)
  if (action === 'updateText') {
    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Feedback text is required' }, { status: 400 })
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from('feedback')
      .select('user_id')
      .eq('id', feedbackId)
      .single()

    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: 'You can only edit your own feedback' }, { status: 403 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('feedback')
      .update({ text: text.trim(), updated_at: new Date().toISOString() })
      .eq('id', feedbackId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ feedback: updated })
  }

  // Admin status update action
  if (action === 'updateStatus') {
    const userIsAdmin = await isAdmin(user.email || undefined)
    if (!userIsAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const validStatuses = ['pending', 'approved', 'in_progress', 'addressed', 'declined']
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Valid status required: ' + validStatuses.join(', ') }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {
      status,
      admin_user_id: user.id,
      admin_user_email: user.email,
      status_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (adminResponse !== undefined) {
      updateData.admin_response = adminResponse
    }

    const { data: updated, error: updateError } = await supabase
      .from('feedback')
      .update(updateData)
      .eq('id', feedbackId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ feedback: updated })
  }

  // Vote action (existing behavior)
  if (!voteType || !['up', 'down'].includes(voteType)) {
    return NextResponse.json({ error: 'voteType (up/down) is required' }, { status: 400 })
  }

  // Get current feedback item
  const { data: existing, error: fetchError } = await supabase
    .from('feedback')
    .select('upvotes, downvotes')
    .eq('id', feedbackId)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Feedback not found' }, { status: 404 })
  }

  const userId = user.id
  let upvotes: string[] = existing.upvotes || []
  let downvotes: string[] = existing.downvotes || []

  if (voteType === 'up') {
    if (upvotes.includes(userId)) {
      upvotes = upvotes.filter(id => id !== userId)
    } else {
      upvotes = [...upvotes, userId]
      downvotes = downvotes.filter(id => id !== userId)
    }
  } else {
    if (downvotes.includes(userId)) {
      downvotes = downvotes.filter(id => id !== userId)
    } else {
      downvotes = [...downvotes, userId]
      upvotes = upvotes.filter(id => id !== userId)
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('feedback')
    .update({ upvotes, downvotes, updated_at: new Date().toISOString() })
    .eq('id', feedbackId)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ feedback: updated })
}
