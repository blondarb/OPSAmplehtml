import { createClient } from '@/lib/supabase/server'
import { NextResponse, NextRequest } from 'next/server'

// GET /api/feedback/comments?feedbackId=xxx - Get comments for a feedback item
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const feedbackId = request.nextUrl.searchParams.get('feedbackId')
  if (!feedbackId) {
    return NextResponse.json({ error: 'feedbackId query param is required' }, { status: 400 })
  }

  const { data: comments, error } = await supabase
    .from('feedback_comments')
    .select('*')
    .eq('feedback_id', feedbackId)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ comments: comments || [] })
}

// POST /api/feedback/comments - Add a comment to a feedback item
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { feedbackId, text, isAdminComment } = body

  if (!feedbackId || !text || !text.trim()) {
    return NextResponse.json({ error: 'feedbackId and text are required' }, { status: 400 })
  }

  const { data: comment, error } = await supabase
    .from('feedback_comments')
    .insert({
      feedback_id: feedbackId,
      user_id: user.id,
      user_email: user.email || 'Anonymous',
      text: text.trim(),
      is_admin_comment: isAdminComment || false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ comment })
}

// DELETE /api/feedback/comments - Delete a comment (own comments only)
export async function DELETE(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { commentId } = body

  if (!commentId) {
    return NextResponse.json({ error: 'commentId is required' }, { status: 400 })
  }

  // Verify ownership
  const { data: existing } = await supabase
    .from('feedback_comments')
    .select('user_id')
    .eq('id', commentId)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  }

  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Cannot delete another user\'s comment' }, { status: 403 })
  }

  const { error } = await supabase
    .from('feedback_comments')
    .delete()
    .eq('id', commentId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
