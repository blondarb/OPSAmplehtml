-- Seed Demo Data for Sevaro Clinical
-- This creates a function to seed demo data for a new user

CREATE OR REPLACE FUNCTION seed_demo_data(user_uuid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  patient_id UUID;
  visit1_id UUID;
  visit2_id UUID;
  visit3_id UUID;
BEGIN
  -- Create demo patient: Test Test
  INSERT INTO patients (id, user_id, mrn, first_name, last_name, date_of_birth, gender, phone, timezone)
  VALUES (
    uuid_generate_v4(),
    user_uuid,
    '123123',
    'Test',
    'Test',
    '1976-01-15',
    'M',
    '555-123-4567',
    'America/Los_Angeles'
  )
  RETURNING id INTO patient_id;

  -- Create Visit 1: Most recent (Today's visit - in progress)
  INSERT INTO visits (id, patient_id, user_id, visit_date, visit_type, chief_complaint, status)
  VALUES (
    uuid_generate_v4(),
    patient_id,
    user_uuid,
    NOW(),
    'follow_up',
    ARRAY['Headache'],
    'in_progress'
  )
  RETURNING id INTO visit1_id;

  -- Create Visit 2: Previous follow-up
  INSERT INTO visits (id, patient_id, user_id, visit_date, visit_type, chief_complaint, status)
  VALUES (
    uuid_generate_v4(),
    patient_id,
    user_uuid,
    NOW() - INTERVAL '11 days',
    'follow_up',
    ARRAY['Headache', 'Memory problem'],
    'completed'
  )
  RETURNING id INTO visit2_id;

  -- Create Visit 3: Initial new patient visit
  INSERT INTO visits (id, patient_id, user_id, visit_date, visit_type, chief_complaint, status)
  VALUES (
    uuid_generate_v4(),
    patient_id,
    user_uuid,
    NOW() - INTERVAL '37 days',
    'new_patient',
    ARRAY['Headache'],
    'completed'
  )
  RETURNING id INTO visit3_id;

  -- Clinical Note for current visit
  INSERT INTO clinical_notes (visit_id, hpi, ros, allergies, assessment, plan)
  VALUES (
    visit1_id,
    '50-year-old male presents for follow-up of chronic daily headaches. Patient reports headaches have improved from daily to approximately 3-4 per week since starting topiramate. Current dose is 50mg twice daily. Denies aura, nausea, or photophobia with recent episodes.',
    'Reviewed',
    'NKDA',
    NULL,
    NULL
  );

  -- Clinical Note for previous visit
  INSERT INTO clinical_notes (visit_id, hpi, ros, allergies, assessment, plan, ai_summary, is_signed, signed_at)
  VALUES (
    visit2_id,
    'Patient reports improved headache frequency with current prophylaxis. MoCA stable at 26/30.',
    'Reviewed',
    'NKDA',
    'Chronic migraine without aura, improving on topiramate. Cognitive function stable.',
    'Continue current regimen. Follow up in 1 month.',
    'Patient reports improved headache frequency with current prophylaxis. MoCA stable at 26/30. Continue current regimen.',
    TRUE,
    NOW() - INTERVAL '11 days'
  );

  -- Clinical Note for initial visit
  INSERT INTO clinical_notes (visit_id, hpi, ros, allergies, assessment, plan, ai_summary, is_signed, signed_at)
  VALUES (
    visit3_id,
    'New patient presents with 3-month history of daily headaches. Describes as bilateral pressure-type pain, worse in the afternoon. Associated with stress at work. No nausea, vomiting, or photophobia.',
    'Reviewed',
    'NKDA',
    'Chronic daily headache, likely chronic tension-type vs chronic migraine. Rule out secondary causes.',
    'Start topiramate 25mg daily, titrate to 50mg BID. Order MRI brain. Return in 4 weeks.',
    'Initial evaluation for chronic daily headache. Started on topiramate 25mg. MRI brain ordered.',
    TRUE,
    NOW() - INTERVAL '37 days'
  );

  -- MIDAS Scores (improving trend)
  INSERT INTO clinical_scales (visit_id, patient_id, scale_type, score, interpretation) VALUES
  (visit1_id, patient_id, 'MIDAS', 18, 'Moderate disability'),
  (visit2_id, patient_id, 'MIDAS', 24, 'Moderate disability'),
  (visit3_id, patient_id, 'MIDAS', 42, 'Severe disability');

  -- HIT-6 Scores
  INSERT INTO clinical_scales (visit_id, patient_id, scale_type, score, interpretation) VALUES
  (visit1_id, patient_id, 'HIT6', 58, 'Substantial impact'),
  (visit2_id, patient_id, 'HIT6', 60, 'Severe impact'),
  (visit3_id, patient_id, 'HIT6', 62, 'Severe impact');

  -- PHQ-9 Scores
  INSERT INTO clinical_scales (visit_id, patient_id, scale_type, score, interpretation) VALUES
  (visit1_id, patient_id, 'PHQ9', 6, 'Mild'),
  (visit3_id, patient_id, 'PHQ9', 11, 'Moderate');

  -- Diagnoses
  INSERT INTO diagnoses (visit_id, patient_id, icd10_code, description, is_primary) VALUES
  (visit1_id, patient_id, 'G43.909', 'Migraine, unspecified, not intractable', TRUE),
  (visit2_id, patient_id, 'G43.909', 'Migraine, unspecified, not intractable', TRUE),
  (visit3_id, patient_id, 'G44.209', 'Tension-type headache, unspecified', TRUE),
  (visit3_id, patient_id, 'R51.9', 'Headache, unspecified', FALSE);

  -- Imaging Studies
  INSERT INTO imaging_studies (patient_id, study_type, study_date, description, findings, impression) VALUES
  (patient_id, 'MRI', NOW() - INTERVAL '30 days', 'MRI Brain without contrast', 'No acute intracranial abnormality. Normal ventricular size. No mass effect or midline shift. White matter appears normal for age.', 'Normal MRI brain.'),
  (patient_id, 'CT', NOW() - INTERVAL '35 days', 'CT Head without contrast', 'No acute intracranial hemorrhage. No mass effect. Ventricles normal in size.', 'Negative CT head.');

END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION seed_demo_data(UUID) TO authenticated;
