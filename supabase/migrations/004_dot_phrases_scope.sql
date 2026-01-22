-- Add scope column to dot_phrases table
-- Scope determines which text fields a phrase appears in
-- 'global' = available in all fields
-- field-specific values: 'hpi', 'assessment', 'plan', 'ros', 'allergies'

ALTER TABLE dot_phrases
ADD COLUMN IF NOT EXISTS scope text DEFAULT 'global';

-- Add check constraint to ensure valid scope values
ALTER TABLE dot_phrases
ADD CONSTRAINT dot_phrases_scope_check
CHECK (scope IN ('global', 'hpi', 'assessment', 'plan', 'ros', 'allergies'));

-- Update existing phrases to have appropriate scopes based on category
UPDATE dot_phrases SET scope = 'hpi' WHERE category = 'Physical Exam';
UPDATE dot_phrases SET scope = 'assessment' WHERE category = 'Assessment';
UPDATE dot_phrases SET scope = 'plan' WHERE category = 'Plan';
UPDATE dot_phrases SET scope = 'ros' WHERE category = 'ROS';
UPDATE dot_phrases SET scope = 'allergies' WHERE category = 'Allergies';
-- Keep General phrases as global
UPDATE dot_phrases SET scope = 'global' WHERE category = 'General' OR category IS NULL;

-- Create index for faster scope filtering
CREATE INDEX IF NOT EXISTS idx_dot_phrases_scope ON dot_phrases(scope);
