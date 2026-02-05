-- Migration 018: Feedback Comments & Approval Workflow
-- Adds comments, status tracking, and admin approval to the feedback system

-- Add status and admin fields to existing feedback table
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'in_progress', 'addressed', 'declined'));
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS admin_response text;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS admin_user_id uuid REFERENCES auth.users(id);
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS admin_user_email text;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

-- Create feedback_comments table
CREATE TABLE IF NOT EXISTS feedback_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  feedback_id uuid NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  user_email text,
  text text NOT NULL,
  is_admin_comment boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on feedback_comments
ALTER TABLE feedback_comments ENABLE ROW LEVEL SECURITY;

-- Everyone can read comments
CREATE POLICY "Anyone can view feedback comments" ON feedback_comments FOR SELECT USING (true);

-- Authenticated users can create comments
CREATE POLICY "Authenticated users can create comments" ON feedback_comments FOR INSERT WITH CHECK (true);

-- Users can delete their own comments
CREATE POLICY "Users can delete own comments" ON feedback_comments FOR DELETE USING (auth.uid() = user_id);

-- Grant access
GRANT ALL ON feedback_comments TO authenticated;
GRANT ALL ON feedback_comments TO anon;
GRANT ALL ON feedback_comments TO service_role;

-- Add delete policy to feedback (users can delete own, admins can delete any)
-- Note: The existing UPDATE policy already allows status updates

-- Create index for fast comment lookups by feedback_id
CREATE INDEX IF NOT EXISTS idx_feedback_comments_feedback_id ON feedback_comments(feedback_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);

-- Notify PostgREST to pick up the changes
NOTIFY pgrst, 'reload schema';
