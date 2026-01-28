-- Create feedback table for cross-user feedback
-- Run this on the production Supabase project: czspsioerfaktnnrnmcw (outpatient_synapse)

CREATE TABLE IF NOT EXISTS feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  text text NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  user_email text,
  upvotes text[] DEFAULT '{}',
  downvotes text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS but make it visible to ALL users (cross-user feedback)
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Everyone can read all feedback
CREATE POLICY "Anyone can view feedback" ON feedback FOR SELECT USING (true);

-- Authenticated users can insert
CREATE POLICY "Authenticated users can create feedback" ON feedback FOR INSERT WITH CHECK (true);

-- Anyone can update (for voting)
CREATE POLICY "Anyone can update feedback" ON feedback FOR UPDATE USING (true);

-- Grant access
GRANT ALL ON feedback TO authenticated;
GRANT ALL ON feedback TO anon;
GRANT ALL ON feedback TO service_role;

-- Notify PostgREST to pick up the new table
NOTIFY pgrst, 'reload schema';
