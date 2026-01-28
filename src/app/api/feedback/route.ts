import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/feedback - List all feedback (visible to all users)
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

  return NextResponse.json({ feedback, currentUserId: user.id })
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
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ feedback })
}

// PATCH /api/feedback - Vote on feedback (upvote/downvote)
export async function PATCH(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { feedbackId, voteType } = body

  if (!feedbackId || !['up', 'down'].includes(voteType)) {
    return NextResponse.json({ error: 'feedbackId and voteType (up/down) are required' }, { status: 400 })
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
      // Toggle off upvote
      upvotes = upvotes.filter(id => id !== userId)
    } else {
      // Add upvote, remove downvote if exists
      upvotes = [...upvotes, userId]
      downvotes = downvotes.filter(id => id !== userId)
    }
  } else {
    if (downvotes.includes(userId)) {
      // Toggle off downvote
      downvotes = downvotes.filter(id => id !== userId)
    } else {
      // Add downvote, remove upvote if exists
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
