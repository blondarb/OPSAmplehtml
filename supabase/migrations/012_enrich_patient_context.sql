-- 012_enrich_patient_context.sql
-- Enriches get_patient_context_for_portal to return allergies, ROS, and
-- active diagnoses so the AI Historian has richer context for follow-up visits.
--
-- Must DROP first because PostgreSQL cannot change the return type of an
-- existing function via CREATE OR REPLACE.
-- ================================================================

-- Drop the old function signature so we can recreate with new return columns
DROP FUNCTION IF EXISTS get_patient_context_for_portal(UUID);

CREATE FUNCTION get_patient_context_for_portal(p_patient_id UUID)
RETURNS TABLE (
  patient_name TEXT,
  referral_reason TEXT,
  last_visit_date TIMESTAMPTZ,
  last_visit_type TEXT,
  last_note_hpi TEXT,
  last_note_assessment TEXT,
  last_note_plan TEXT,
  last_note_summary TEXT,
  last_note_allergies TEXT,
  last_note_ros TEXT,
  active_diagnoses TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT
      (pt.first_name || ' ' || pt.last_name)::TEXT AS patient_name,
      pt.referral_reason,
      v.visit_date AS last_visit_date,
      v.visit_type AS last_visit_type,
      cn.hpi AS last_note_hpi,
      cn.assessment AS last_note_assessment,
      cn.plan AS last_note_plan,
      cn.ai_summary AS last_note_summary,
      cn.allergies AS last_note_allergies,
      cn.ros AS last_note_ros,
      (
        SELECT string_agg(d.description || ' (' || d.icd10_code || ')', ', ')
        FROM diagnoses d
        WHERE d.visit_id = v.id
      ) AS active_diagnoses
    FROM patients pt
    LEFT JOIN LATERAL (
      SELECT v2.id, v2.visit_date, v2.visit_type
      FROM visits v2
      WHERE v2.patient_id = pt.id
        AND v2.status = 'completed'
      ORDER BY v2.visit_date DESC
      LIMIT 1
    ) v ON TRUE
    LEFT JOIN clinical_notes cn ON cn.visit_id = v.id
    WHERE pt.id = p_patient_id;
END;
$$;

-- Re-grant execute to anon + authenticated (lost when function was dropped)
GRANT EXECUTE ON FUNCTION get_patient_context_for_portal(UUID) TO anon, authenticated;
