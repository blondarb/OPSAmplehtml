-- SYNTHETIC TEST DATA ONLY - NOT FOR CLINICAL CARE.
-- The Cognito subject is provided by the temporary initializer as a psql
-- variable and is never written to source control or build logs.

\if :{?cognito_sub}
\else
  \echo 'FAIL cognito_sub was not supplied'
  \quit 1
\endif

INSERT INTO public.user_profiles (
  id,
  display_name,
  role,
  organization,
  specialty
) VALUES (
  CAST(:'cognito_sub' AS uuid),
  'Synthetic QA Clinician',
  'clinician',
  'Sevaro Historian QA - Synthetic Only',
  'Neurology QA'
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  role = EXCLUDED.role,
  organization = EXCLUDED.organization,
  specialty = EXCLUDED.specialty;

INSERT INTO public.clinical_access_memberships (
  user_id,
  tenant_id,
  role,
  active,
  provisioned_by
) VALUES (
  :'cognito_sub',
  'historian-mvp-qa',
  'clinician',
  true,
  'qa-bootstrap'
)
ON CONFLICT (user_id, tenant_id) DO UPDATE SET
  role = EXCLUDED.role,
  active = true,
  provisioned_by = EXCLUDED.provisioned_by,
  revoked_by = NULL,
  revoked_at = NULL;

INSERT INTO public.patients (
  id,
  user_id,
  mrn,
  first_name,
  last_name,
  date_of_birth,
  gender,
  phone,
  email,
  address,
  timezone,
  referring_physician,
  referral_reason,
  tenant_id
) VALUES (
  '10000000-0000-4000-8000-000000000001',
  CAST(:'cognito_sub' AS uuid),
  'SYNTH-QA-001',
  'Synthetic',
  'Casey',
  DATE '1985-01-15',
  'other',
  NULL,
  NULL,
  NULL,
  'America/Denver',
  'Synthetic Referring Clinician',
  'Synthetic recurrent headaches with light sensitivity; no real patient data.',
  'historian-mvp-qa'
)
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  mrn = EXCLUDED.mrn,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  date_of_birth = EXCLUDED.date_of_birth,
  gender = EXCLUDED.gender,
  phone = NULL,
  email = NULL,
  address = NULL,
  referral_reason = EXCLUDED.referral_reason,
  tenant_id = EXCLUDED.tenant_id,
  updated_at = now();

INSERT INTO public.neurology_consults (
  id,
  patient_id,
  status,
  triage_chief_complaint,
  referral_text,
  notes,
  tenant_id
) VALUES (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'historian_pending',
  'Synthetic recurrent headaches with light sensitivity',
  'SYNTHETIC QA ONLY: evaluate a fictional headache history before a neurology visit.',
  'SYNTHETIC TEST DATA - NOT FOR CLINICAL CARE',
  'historian-mvp-qa'
)
ON CONFLICT (id) DO UPDATE SET
  patient_id = EXCLUDED.patient_id,
  status = EXCLUDED.status,
  triage_chief_complaint = EXCLUDED.triage_chief_complaint,
  referral_text = EXCLUDED.referral_text,
  notes = EXCLUDED.notes,
  tenant_id = EXCLUDED.tenant_id,
  updated_at = now();
