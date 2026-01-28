-- FIX ROBERT CHEN PRIOR VISIT DATA
-- Run this SQL to ensure Robert Chen has a prior visit with AI summary
-- that appears in the appointment hover preview

-- First, check what user_id owns the data (run this to see):
-- SELECT DISTINCT user_id, first_name, last_name FROM patients LIMIT 10;

-- Find Robert Chen's patient ID
DO $$
DECLARE
  robert_patient_id uuid;
  robert_prior_visit_id uuid;
  owner_user_id uuid;
BEGIN
  -- Get Robert Chen's ID and the user_id that owns his record
  SELECT id, user_id INTO robert_patient_id, owner_user_id
  FROM patients
  WHERE last_name = 'Chen' AND first_name = 'Robert'
  LIMIT 1;

  IF robert_patient_id IS NULL THEN
    RAISE NOTICE 'Robert Chen not found in patients table';
    RETURN;
  END IF;

  RAISE NOTICE 'Found Robert Chen: patient_id=%, owner_user_id=%', robert_patient_id, owner_user_id;

  -- Check if Robert already has a completed prior visit
  SELECT id INTO robert_prior_visit_id
  FROM visits
  WHERE patient_id = robert_patient_id
    AND status = 'completed'
  ORDER BY visit_date DESC
  LIMIT 1;

  IF robert_prior_visit_id IS NOT NULL THEN
    RAISE NOTICE 'Robert already has prior visit: %', robert_prior_visit_id;

    -- Update the appointment to link to this prior visit
    UPDATE appointments
    SET prior_visit_id = robert_prior_visit_id
    WHERE patient_id = robert_patient_id
      AND appointment_type LIKE '%follow-up%'
      AND prior_visit_id IS NULL;

    -- Make sure the visit has an AI summary in clinical_notes
    INSERT INTO clinical_notes (visit_id, ai_summary, status)
    SELECT robert_prior_visit_id,
      '66yo M with Parkinson disease (H&Y Stage 2) presents for routine follow-up. Tremor stable on carbidopa/levodopa + pramipexole. Amantadine added for additional motor benefit. Mild constipation managed conservatively. Follow-up in 3 months.',
      'signed'
    WHERE NOT EXISTS (
      SELECT 1 FROM clinical_notes WHERE visit_id = robert_prior_visit_id
    );

    RAISE NOTICE 'Updated appointment to link to prior visit';
    RETURN;
  END IF;

  -- If no prior visit exists, create one
  RAISE NOTICE 'Creating prior visit for Robert Chen';

  INSERT INTO visits (
    patient_id, user_id, visit_date, visit_type, chief_complaint, status, provider_name
  )
  VALUES (
    robert_patient_id,
    owner_user_id,
    (CURRENT_DATE - INTERVAL '90 days')::TIMESTAMPTZ,
    'follow_up',
    ARRAY['Parkinson disease follow-up', 'Medication management'],
    'completed',
    'Dr. Sarah Kim'
  )
  RETURNING id INTO robert_prior_visit_id;

  RAISE NOTICE 'Created prior visit: %', robert_prior_visit_id;

  -- Insert clinical note with AI summary
  INSERT INTO clinical_notes (
    visit_id, hpi, ros, assessment, plan, ai_summary, status, signed_at
  )
  VALUES (
    robert_prior_visit_id,
    'Mr. Chen presents for 3-month follow-up of Parkinson disease, diagnosed June 2022. He reports his tremor is well-controlled on current medication regimen. No significant changes in gait or balance. Activities of daily living remain independent. No falls since last visit.',
    'Constitutional: No fever, weight loss, or fatigue. Neurological: Right hand resting tremor (stable), no new weakness. Musculoskeletal: No joint pain.',
    'Parkinson disease (G20), Hoehn and Yahr Stage 2 - stable. Tremor well controlled on current regimen.',
    '1. Continue Carbidopa/Levodopa 25/100mg TID - well tolerated
2. Continue Pramipexole 0.5mg TID
3. Follow-up in 3 months',
    '66yo M with Parkinson disease (H&Y Stage 2) presents for routine follow-up. Tremor stable on carbidopa/levodopa + pramipexole. Amantadine added for additional motor benefit. Mild constipation managed conservatively. Follow-up in 3 months.',
    'signed',
    (CURRENT_DATE - INTERVAL '90 days')::TIMESTAMPTZ
  );

  RAISE NOTICE 'Created clinical note with AI summary';

  -- Update Robert's appointment to link to this prior visit
  UPDATE appointments
  SET prior_visit_id = robert_prior_visit_id
  WHERE patient_id = robert_patient_id
    AND appointment_type LIKE '%follow-up%';

  RAISE NOTICE 'Linked appointment to prior visit';

END $$;

-- Verify the data is correct
SELECT
  a.id as appointment_id,
  a.appointment_type,
  a.prior_visit_id,
  p.first_name || ' ' || p.last_name as patient_name,
  v.visit_date as prior_visit_date,
  cn.ai_summary
FROM appointments a
JOIN patients p ON a.patient_id = p.id
LEFT JOIN visits v ON a.prior_visit_id = v.id
LEFT JOIN clinical_notes cn ON v.id = cn.visit_id
WHERE p.last_name = 'Chen';
