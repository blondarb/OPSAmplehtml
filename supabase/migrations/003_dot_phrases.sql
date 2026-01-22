-- Dot Phrases table for quick text expansion
-- Migration: 003_dot_phrases.sql

-- Create dot_phrases table
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

-- Enable Row Level Security
ALTER TABLE dot_phrases ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own phrases" ON dot_phrases
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own phrases" ON dot_phrases
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own phrases" ON dot_phrases
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own phrases" ON dot_phrases
  FOR DELETE USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX idx_dot_phrases_user_id ON dot_phrases(user_id);
CREATE INDEX idx_dot_phrases_trigger ON dot_phrases(user_id, trigger_text);
CREATE INDEX idx_dot_phrases_category ON dot_phrases(user_id, category);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_dot_phrases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dot_phrases_updated_at
  BEFORE UPDATE ON dot_phrases
  FOR EACH ROW
  EXECUTE FUNCTION update_dot_phrases_updated_at();

-- Insert default neurology phrases for new users (function to call on user creation)
CREATE OR REPLACE FUNCTION seed_default_dot_phrases(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO dot_phrases (user_id, trigger_text, expansion_text, category, description) VALUES
  -- Physical Exam
  (p_user_id, '.neuroexam', 'Mental status: Alert and oriented x3, appropriate affect, normal attention and concentration. Speech fluent without dysarthria. Cranial nerves II-XII intact. Motor: 5/5 strength in all extremities, normal bulk and tone. Sensory: Intact to light touch, pinprick, vibration, and proprioception. Reflexes: 2+ and symmetric throughout. Coordination: Normal finger-to-nose and heel-to-shin. Gait: Normal, tandem intact.', 'Physical Exam', 'Complete normal neurological examination'),

  (p_user_id, '.wnl', 'Within normal limits', 'General', 'Quick normal finding'),

  (p_user_id, '.nfnd', 'No focal neurological deficits', 'Physical Exam', 'No focal deficits'),

  -- Review of Systems
  (p_user_id, '.rosneg', 'Constitutional: Denies fever, chills, weight loss, fatigue. HEENT: Denies vision changes, hearing loss, tinnitus. Cardiovascular: Denies chest pain, palpitations. Respiratory: Denies shortness of breath, cough. GI: Denies nausea, vomiting, abdominal pain. Neurological: See HPI.', 'ROS', 'Negative review of systems'),

  (p_user_id, '.deny', 'Patient denies any recent changes in symptoms, new symptoms, or concerning features.', 'General', 'General denial statement'),

  -- Allergies
  (p_user_id, '.nkda', 'No known drug allergies', 'Allergies', 'No known allergies'),

  -- Headache/Migraine
  (p_user_id, '.migraine', 'Chronic migraine without aura. Patient reports [X] headache days per month. Current preventive therapy: [medication]. Acute therapy: [medication]. MIDAS score: [X]. HIT-6 score: [X].', 'Assessment', 'Migraine assessment template'),

  (p_user_id, '.haplan', 'Plan:
1. Continue current preventive therapy
2. Acute treatment: Use at headache onset, limit to 2 days/week to prevent medication overuse
3. Lifestyle modifications: Regular sleep schedule, hydration, stress management
4. Headache diary to track frequency and triggers
5. Follow up in [X] weeks/months', 'Plan', 'Headache management plan'),

  -- Seizure
  (p_user_id, '.seizure', 'Epilepsy, [type]. Last seizure: [date]. Current AED: [medication] [dose]. Seizure frequency: [X] per [timeframe]. Adherence: [status]. Last AED level: [value] on [date].', 'Assessment', 'Seizure assessment template'),

  -- General Plans
  (p_user_id, '.fu1mo', 'Follow up in 1 month or sooner if symptoms worsen.', 'Plan', 'One month follow-up'),

  (p_user_id, '.fu3mo', 'Follow up in 3 months or sooner if symptoms worsen.', 'Plan', 'Three month follow-up'),

  (p_user_id, '.labs', 'Labs ordered: CBC, CMP, [additional tests]. Results to be reviewed at next visit.', 'Plan', 'Lab order template'),

  (p_user_id, '.mri', 'MRI brain [with/without contrast] ordered to evaluate [indication]. Results to be reviewed and discussed.', 'Plan', 'MRI order template'),

  -- Patient Education
  (p_user_id, '.educated', 'Patient educated on diagnosis, treatment options, and expected outcomes. Questions answered. Patient verbalized understanding and agrees with plan.', 'General', 'Patient education statement')

  ON CONFLICT (user_id, trigger_text) DO NOTHING;
END;
$$ LANGUAGE plpgsql;
