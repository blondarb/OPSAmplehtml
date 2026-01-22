-- ============================================
-- DOT PHRASES SETUP SCRIPT
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Create the dot_phrases table
CREATE TABLE IF NOT EXISTS dot_phrases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_text TEXT NOT NULL,
  expansion_text TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  use_count INTEGER DEFAULT 0,
  last_used TIMESTAMPTZ,
  UNIQUE(user_id, trigger_text)
);

-- Step 2: Enable Row Level Security
ALTER TABLE dot_phrases ENABLE ROW LEVEL SECURITY;

-- Step 3: Create RLS Policies (drop first if they exist to avoid errors)
DROP POLICY IF EXISTS "Users can view own phrases" ON dot_phrases;
DROP POLICY IF EXISTS "Users can insert own phrases" ON dot_phrases;
DROP POLICY IF EXISTS "Users can update own phrases" ON dot_phrases;
DROP POLICY IF EXISTS "Users can delete own phrases" ON dot_phrases;

CREATE POLICY "Users can view own phrases" ON dot_phrases
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own phrases" ON dot_phrases
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own phrases" ON dot_phrases
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own phrases" ON dot_phrases
  FOR DELETE USING (auth.uid() = user_id);

-- Step 4: Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_dot_phrases_user_id ON dot_phrases(user_id);
CREATE INDEX IF NOT EXISTS idx_dot_phrases_trigger ON dot_phrases(user_id, trigger_text);
CREATE INDEX IF NOT EXISTS idx_dot_phrases_category ON dot_phrases(user_id, category);

-- Step 5: Create updated_at trigger
CREATE OR REPLACE FUNCTION update_dot_phrases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dot_phrases_updated_at ON dot_phrases;
CREATE TRIGGER dot_phrases_updated_at
  BEFORE UPDATE ON dot_phrases
  FOR EACH ROW
  EXECUTE FUNCTION update_dot_phrases_updated_at();

-- Step 6: Add scope column for field-specific phrases
ALTER TABLE dot_phrases
ADD COLUMN IF NOT EXISTS scope text DEFAULT 'global';

-- Step 7: Add check constraint for valid scope values (drop first if exists)
ALTER TABLE dot_phrases DROP CONSTRAINT IF EXISTS dot_phrases_scope_check;
ALTER TABLE dot_phrases
ADD CONSTRAINT dot_phrases_scope_check
CHECK (scope IN ('global', 'hpi', 'assessment', 'plan', 'ros', 'allergies'));

-- Step 8: Update existing phrases with appropriate scopes based on category
UPDATE dot_phrases SET scope = 'hpi' WHERE category = 'Physical Exam' AND scope = 'global';
UPDATE dot_phrases SET scope = 'assessment' WHERE category = 'Assessment' AND scope = 'global';
UPDATE dot_phrases SET scope = 'plan' WHERE category = 'Plan' AND scope = 'global';
UPDATE dot_phrases SET scope = 'ros' WHERE category = 'ROS' AND scope = 'global';
UPDATE dot_phrases SET scope = 'allergies' WHERE category = 'Allergies' AND scope = 'global';

-- Step 9: Create index for scope filtering
CREATE INDEX IF NOT EXISTS idx_dot_phrases_scope ON dot_phrases(scope);

-- ============================================
-- DONE! Dot phrases table is now ready.
-- ============================================
