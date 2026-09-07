-- SOURCE ONLY; apply explicitly after 061. No historical backfill or rewrite.
BEGIN;
ALTER TABLE validation_reviews ADD COLUMN clinical_assessment jsonb;

CREATE FUNCTION validate_triage_clinical_assessment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE assessment jsonb := NEW.clinical_assessment; timing jsonb; interval jsonb; unit_limit integer; action text;
BEGIN
  -- Closed schema: no missing, null, coerced, or uncontrolled fields.
  IF NOT COALESCE(
    jsonb_typeof(assessment) = 'object' AND
    assessment ?& ARRAY['version','action','latest_safe_assessment','services','decisive_missing_facts'] AND
    (assessment - ARRAY['version','action','latest_safe_assessment','services','decisive_missing_facts']) = '{}'::jsonb AND
    jsonb_typeof(assessment->'version') = 'string' AND assessment->>'version' = 'v1' AND
    jsonb_typeof(assessment->'action') = 'string' AND assessment->>'action' IN ('emergency_now','clinician_review_now','outpatient_assessment','clarify_before_disposition') AND
    jsonb_typeof(assessment->'services') = 'array' AND jsonb_array_length(CASE WHEN jsonb_typeof(assessment->'services') = 'array' THEN assessment->'services' ELSE '[]'::jsonb END) <= 12 AND
    jsonb_typeof(assessment->'decisive_missing_facts') = 'array' AND jsonb_array_length(CASE WHEN jsonb_typeof(assessment->'decisive_missing_facts') = 'array' THEN assessment->'decisive_missing_facts' ELSE '[]'::jsonb END) <= 12 AND
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(assessment->'services') = 'array' THEN assessment->'services' ELSE '[]'::jsonb END) value WHERE jsonb_typeof(value) <> 'string' OR value #>> '{}' NOT IN ('General Neurology','Epilepsy','Movement Disorders','Headache','Neuromuscular','MS / Neuroimmunology','Cognitive/Memory','Stroke','Primary Care / PCP','Orthopedics','Spine Surgery','Pain Management','Rheumatology','Psychiatry','Podiatry','Physical Medicine & Rehab','ENT / Otolaryngology','Ophthalmology','Cardiology','Endocrinology','Vascular Surgery','Other Specialty')) AND
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(assessment->'decisive_missing_facts') = 'array' THEN assessment->'decisive_missing_facts' ELSE '[]'::jsonb END) value WHERE jsonb_typeof(value) <> 'string' OR length(btrim(value #>> '{}')) = 0 OR length(value #>> '{}') > 500),
    FALSE
  ) THEN RAISE EXCEPTION 'Invalid clinical assessment' USING ERRCODE='22023'; END IF;

  action := assessment->>'action'; timing := assessment->'latest_safe_assessment';
  IF NEW.triage_tier IS NULL OR NEW.comfortable_with_wait IS NULL OR NEW.comfortable_with_wait NOT IN ('yes','no','uncertain') OR
     (action = 'emergency_now' AND NEW.triage_tier IS DISTINCT FROM 'emergent') OR
     (action = 'clinician_review_now' AND NEW.triage_tier NOT IN ('urgent','insufficient_data')) OR
     (action = 'outpatient_assessment' AND NEW.triage_tier NOT IN ('urgent','semi_urgent','routine_priority','routine','non_urgent')) OR
     (action = 'clarify_before_disposition' AND NEW.triage_tier IS DISTINCT FROM 'insufficient_data') OR
     (action = 'clinician_review_now' AND NEW.triage_tier = 'urgent' AND NEW.comfortable_with_wait = 'yes') THEN
    RAISE EXCEPTION 'Clinical action, legacy comparison tier, and wait comfort are inconsistent' USING ERRCODE='22023';
  END IF;
  IF NOT COALESCE(
    jsonb_typeof(timing) = 'object' AND timing ? 'origin' AND
    (timing - ARRAY['origin','interval','anchor']) = '{}'::jsonb AND
    jsonb_typeof(timing->'origin') = 'string' AND timing->>'origin' IN ('decision_time','symptom_onset','prior_assessment','unknown'),
    FALSE
  ) THEN RAISE EXCEPTION 'Invalid assessment timing' USING ERRCODE='22023'; END IF;
  IF timing->>'origin' = 'unknown' THEN
    IF action IN ('emergency_now','clinician_review_now') OR timing ? 'interval' OR timing ? 'anchor' THEN RAISE EXCEPTION 'Unknown timing cannot claim an anchor or interval' USING ERRCODE='22023'; END IF;
    RETURN NEW;
  END IF;

  interval := timing->'interval';
  IF NOT COALESCE(
    timing ? 'interval' AND jsonb_typeof(interval) = 'object' AND interval ?& ARRAY['value','unit'] AND
    (interval - ARRAY['value','unit']) = '{}'::jsonb AND jsonb_typeof(interval->'value') = 'number' AND
    jsonb_typeof(interval->'unit') = 'string' AND (interval->>'value') ~ '^(0|[1-9][0-9]*)$' AND length(interval->>'value') <= 5,
    FALSE
  ) THEN RAISE EXCEPTION 'Invalid bounded assessment interval' USING ERRCODE='22023'; END IF;
  IF action IN ('emergency_now','clinician_review_now') THEN
    IF timing->>'origin' <> 'decision_time' OR timing ? 'anchor' OR interval->>'value' <> '0' OR interval->>'unit' <> 'minutes' THEN RAISE EXCEPTION 'Immediate assessment must be decision-time with zero minutes' USING ERRCODE='22023'; END IF;
    RETURN NEW;
  END IF;
  unit_limit := CASE interval->>'unit' WHEN 'minutes' THEN 10080 WHEN 'hours' THEN 8760 WHEN 'days' THEN 3650 WHEN 'weeks' THEN 520 ELSE 0 END;
  IF unit_limit = 0 OR (interval->>'value')::integer <= 0 OR (interval->>'value')::integer > unit_limit OR
     (timing ? 'anchor' AND (jsonb_typeof(timing->'anchor') <> 'string' OR length(btrim(timing->>'anchor')) = 0 OR length(timing->>'anchor') > 200)) THEN RAISE EXCEPTION 'Invalid bounded assessment interval' USING ERRCODE='22023'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER triage_validation_clinical_assessment BEFORE INSERT ON validation_reviews FOR EACH ROW EXECUTE FUNCTION validate_triage_clinical_assessment();
COMMIT;
