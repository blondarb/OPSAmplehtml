# Sevaro Clinical - Database Schema Reference

> **Database**: PostgreSQL via Supabase
> **Multi-tenancy**: `tenant_id TEXT` column on data tables (default: `'default'`)
> **Auth**: Supabase Auth (`auth.users` / `auth.uid()`)
> **RLS**: Row Level Security enabled on every table
> **Generated from**: All migrations in `supabase/migrations/` (001 through 018) and `FEEDBACK_TABLE.sql`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tables](#2-tables)
   - [patients](#patients)
   - [visits](#visits)
   - [clinical_notes](#clinical_notes)
   - [clinical_scales](#clinical_scales) (legacy)
   - [diagnoses](#diagnoses)
   - [imaging_studies](#imaging_studies)
   - [app_settings](#app_settings)
   - [dot_phrases](#dot_phrases)
   - [scale_definitions](#scale_definitions)
   - [condition_scale_mapping](#condition_scale_mapping)
   - [scale_results](#scale_results)
   - [historian_sessions](#historian_sessions)
   - [patient_intake_forms](#patient_intake_forms)
   - [patient_messages](#patient_messages)
   - [clinical_plans](#clinical_plans)
   - [saved_plans](#saved_plans)
   - [patient_medications](#patient_medications)
   - [patient_allergies](#patient_allergies)
   - [medication_reviews](#medication_reviews)
   - [appointments](#appointments)
   - [feedback](#feedback)
   - [feedback_comments](#feedback_comments)
3. [Relationships](#3-relationships)
4. [Multi-Tenancy](#4-multi-tenancy)
5. [CHECK Constraints](#5-check-constraints)
6. [Functions](#6-functions)
7. [Triggers](#7-triggers)

---

## 1. Overview

The Sevaro Clinical database is a PostgreSQL database managed through Supabase. It stores all data for an AI-powered neurology clinical documentation platform.

**Key architectural decisions:**

- **UUID primary keys** on all tables, generated via `uuid_generate_v4()` or `gen_random_uuid()`.
- **Multi-tenant isolation** via a `tenant_id TEXT` column (default `'default'`) on all patient-facing data tables. Reference/global tables (`app_settings`, `clinical_plans`, `scale_definitions`, `condition_scale_mapping`) do not have `tenant_id`.
- **Row Level Security (RLS)** is enabled on every table. Current policies use `USING (true)` for most shared clinical data tables (allowing all authenticated users access), while per-user tables like `dot_phrases` and `saved_plans` restrict to `auth.uid() = user_id`. The `app_settings` table has no user-facing policies (service role only).
- **Automatic timestamps** via `update_updated_at()` / `update_updated_at_column()` triggers on tables with `updated_at`.
- **Extension**: `uuid-ossp` is enabled for UUID generation.

---

## 2. Tables

### patients

Patient demographics and identification.

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `uuid_generate_v4()` | NO | PRIMARY KEY |
| `created_at` | TIMESTAMPTZ | `NOW()` | YES | |
| `updated_at` | TIMESTAMPTZ | `NOW()` | YES | |
| `user_id` | UUID | - | NO | FK -> `auth.users(id)` ON DELETE CASCADE |
| `mrn` | TEXT | - | NO | UNIQUE(user_id, mrn) |
| `first_name` | TEXT | - | NO | |
| `last_name` | TEXT | - | NO | |
| `date_of_birth` | DATE | - | NO | |
| `gender` | TEXT | - | NO | CHECK (`gender IN ('M', 'F', 'O')`) |
| `phone` | TEXT | - | YES | |
| `email` | TEXT | - | YES | |
| `address` | TEXT | - | YES | |
| `timezone` | TEXT | `'America/Los_Angeles'` | YES | |
| `tenant_id` | TEXT | `'default'` | NO | Added in migration 008 |
| `referral_reason` | TEXT | - | YES | Added in migration 011 |
| `referring_physician` | TEXT | - | YES | Added in migration 011 |

**Unique Constraints:**
- `UNIQUE(user_id, mrn)`

**Indexes:**
- `idx_patients_user_id` ON `(user_id)`
- `idx_patients_tenant` ON `(tenant_id)`

**Triggers:**
- `update_patients_updated_at` BEFORE UPDATE -> `update_updated_at()`

**RLS Policies** (after migration 017 -- shared across practice):
| Policy | Operation | Rule |
|--------|-----------|------|
| Authenticated users can view patients | SELECT | `USING (true)` |
| Authenticated users can insert patients | INSERT | `WITH CHECK (true)` |
| Authenticated users can update patients | UPDATE | `USING (true) WITH CHECK (true)` |
| Authenticated users can delete patients | DELETE | `USING (true)` |

---

### visits

Patient visit records tracking encounters.

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `uuid_generate_v4()` | NO | PRIMARY KEY |
| `created_at` | TIMESTAMPTZ | `NOW()` | YES | |
| `updated_at` | TIMESTAMPTZ | `NOW()` | YES | |
| `patient_id` | UUID | - | NO | FK -> `patients(id)` ON DELETE CASCADE |
| `user_id` | UUID | - | NO | FK -> `auth.users(id)` ON DELETE CASCADE |
| `visit_date` | TIMESTAMPTZ | - | NO | |
| `visit_type` | TEXT | - | NO | CHECK (`visit_type IN ('new_patient', 'follow_up', 'urgent', 'telehealth')`) |
| `chief_complaint` | TEXT[] | `'{}'` | YES | |
| `status` | TEXT | `'scheduled'` | YES | CHECK (`status IN ('scheduled', 'in_progress', 'completed', 'cancelled')`) |
| `tenant_id` | TEXT | `'default'` | NO | Added in migration 008 |

**Indexes:**
- `idx_visits_patient_id` ON `(patient_id)`
- `idx_visits_user_id` ON `(user_id)`
- `idx_visits_date` ON `(visit_date)`
- `idx_visits_tenant` ON `(tenant_id)`
- `idx_visits_tenant_status` ON `(tenant_id, status)`

**Triggers:**
- `update_visits_updated_at` BEFORE UPDATE -> `update_updated_at()`

**RLS Policies** (after migration 017):
| Policy | Operation | Rule |
|--------|-----------|------|
| Authenticated users can view visits | SELECT | `USING (true)` |
| Authenticated users can insert visits | INSERT | `WITH CHECK (true)` |
| Authenticated users can update visits | UPDATE | `USING (true) WITH CHECK (true)` |
| Authenticated users can delete visits | DELETE | `USING (true)` |

---

### clinical_notes

Clinical documentation per visit (HPI, assessment, plan, etc.).

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `uuid_generate_v4()` | NO | PRIMARY KEY |
| `created_at` | TIMESTAMPTZ | `NOW()` | YES | |
| `updated_at` | TIMESTAMPTZ | `NOW()` | YES | |
| `visit_id` | UUID | - | NO | FK -> `visits(id)` ON DELETE CASCADE; UNIQUE |
| `hpi` | TEXT | - | YES | |
| `ros` | TEXT | - | YES | |
| `allergies` | TEXT | - | YES | |
| `physical_exam` | JSONB | - | YES | |
| `assessment` | TEXT | - | YES | |
| `plan` | TEXT | - | YES | |
| `ai_summary` | TEXT | - | YES | |
| `is_signed` | BOOLEAN | `FALSE` | YES | |
| `signed_at` | TIMESTAMPTZ | - | YES | |
| `raw_dictation` | JSONB | `'{}'` | YES | Original dictation text keyed by field name (migration 005) |
| `tenant_id` | TEXT | `'default'` | NO | Added in migration 008 |
| `status` | TEXT | `'draft'` | YES | Added in migration 015 |
| `ros_details` | TEXT | - | YES | Added in migration 015 |
| `allergy_details` | TEXT | - | YES | Added in migration 015 |
| `history_available` | TEXT | - | YES | Added in migration 015 |
| `history_details` | TEXT | - | YES | Added in migration 015 |
| `exam_free_text` | TEXT | - | YES | Added in migration 015 |
| `vitals` | JSONB | - | YES | Added in migration 015 |

**Unique Constraints:**
- `UNIQUE(visit_id)` -- one note per visit

**Indexes:**
- `idx_clinical_notes_visit_id` ON `(visit_id)`
- `idx_clinical_notes_tenant` ON `(tenant_id)`

**Triggers:**
- `update_clinical_notes_updated_at` BEFORE UPDATE -> `update_updated_at()`

**RLS Policies** (after migration 017):
| Policy | Operation | Rule |
|--------|-----------|------|
| Authenticated users can view clinical notes | SELECT | `USING (true)` |
| Authenticated users can insert clinical notes | INSERT | `WITH CHECK (true)` |
| Authenticated users can update clinical notes | UPDATE | `USING (true) WITH CHECK (true)` |

---

### clinical_scales

Legacy clinical scale assessment scores (predates `scale_results`).

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `uuid_generate_v4()` | NO | PRIMARY KEY |
| `created_at` | TIMESTAMPTZ | `NOW()` | YES | |
| `visit_id` | UUID | - | NO | FK -> `visits(id)` ON DELETE CASCADE |
| `patient_id` | UUID | - | NO | FK -> `patients(id)` ON DELETE CASCADE |
| `scale_type` | TEXT | - | NO | CHECK (`scale_type IN ('MIDAS', 'HIT6', 'PHQ9', 'GAD7', 'MOCA', 'MINICOG')`) |
| `score` | INTEGER | - | NO | |
| `interpretation` | TEXT | - | YES | |
| `answers` | JSONB | - | YES | |
| `tenant_id` | TEXT | `'default'` | NO | Added in migration 008 |

**Indexes:**
- `idx_clinical_scales_patient_id` ON `(patient_id)`
- `idx_clinical_scales_visit_id` ON `(visit_id)`
- `idx_clinical_scales_tenant` ON `(tenant_id)`

**RLS Policies** (after migration 017):
| Policy | Operation | Rule |
|--------|-----------|------|
| Authenticated users can view clinical scales | SELECT | `USING (true)` |
| Authenticated users can insert clinical scales | INSERT | `WITH CHECK (true)` |
| Authenticated users can update clinical scales | UPDATE | `USING (true) WITH CHECK (true)` |

---

### diagnoses

Patient diagnoses with ICD-10 codes per visit.

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `uuid_generate_v4()` | NO | PRIMARY KEY |
| `created_at` | TIMESTAMPTZ | `NOW()` | YES | |
| `visit_id` | UUID | - | NO | FK -> `visits(id)` ON DELETE CASCADE |
| `patient_id` | UUID | - | NO | FK -> `patients(id)` ON DELETE CASCADE |
| `icd10_code` | TEXT | - | NO | |
| `description` | TEXT | - | NO | |
| `is_primary` | BOOLEAN | `FALSE` | YES | |
| `tenant_id` | TEXT | `'default'` | NO | Added in migration 008 |

**Indexes:**
- `idx_diagnoses_patient_id` ON `(patient_id)`
- `idx_diagnoses_tenant` ON `(tenant_id)`

**RLS Policies** (after migration 017):
| Policy | Operation | Rule |
|--------|-----------|------|
| Authenticated users can view diagnoses | SELECT | `USING (true)` |
| Authenticated users can insert diagnoses | INSERT | `WITH CHECK (true)` |
| Authenticated users can update diagnoses | UPDATE | `USING (true) WITH CHECK (true)` |

---

### imaging_studies

Imaging and diagnostic study records per patient.

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `uuid_generate_v4()` | NO | PRIMARY KEY |
| `created_at` | TIMESTAMPTZ | `NOW()` | YES | |
| `patient_id` | UUID | - | NO | FK -> `patients(id)` ON DELETE CASCADE |
| `study_type` | TEXT | - | NO | CHECK (`study_type IN ('CT', 'MRI', 'XRAY', 'US', 'OTHER')`) |
| `study_date` | DATE | - | NO | |
| `description` | TEXT | - | NO | |
| `findings` | TEXT | - | YES | |
| `impression` | TEXT | - | YES | |
| `tenant_id` | TEXT | `'default'` | NO | Added in migration 008 |

**Indexes:**
- `idx_imaging_studies_patient_id` ON `(patient_id)`
- `idx_imaging_studies_tenant` ON `(tenant_id)`

**RLS Policies** (after migration 017):
| Policy | Operation | Rule |
|--------|-----------|------|
| Authenticated users can view imaging studies | SELECT | `USING (true)` |
| Authenticated users can insert imaging studies | INSERT | `WITH CHECK (true)` |
| Authenticated users can update imaging studies | UPDATE | `USING (true) WITH CHECK (true)` |

---

### app_settings

Secure key-value storage for application settings (e.g., OpenAI API key). **No tenant_id** -- global reference data.

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `uuid_generate_v4()` | NO | PRIMARY KEY |
| `key` | TEXT | - | NO | UNIQUE |
| `value` | TEXT | - | NO | |
| `created_at` | TIMESTAMPTZ | `NOW()` | YES | |
| `updated_at` | TIMESTAMPTZ | `NOW()` | YES | |

**Triggers:**
- `update_app_settings_updated_at` BEFORE UPDATE -> `update_updated_at()`

**RLS Policies:**
- RLS enabled but **no user-facing policies**. Only the service role can read/write.
- The `get_openai_key()` function (SECURITY DEFINER) provides controlled read access for authenticated users.

---

### dot_phrases

User-defined text expansion shortcuts for clinical documentation. **Per-user** (not shared across practice).

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `uuid_generate_v4()` | NO | PRIMARY KEY |
| `created_at` | TIMESTAMPTZ | `NOW()` | YES | |
| `updated_at` | TIMESTAMPTZ | `NOW()` | YES | |
| `user_id` | UUID | - | NO | FK -> `auth.users(id)` ON DELETE CASCADE |
| `trigger_text` | TEXT | - | NO | UNIQUE(user_id, trigger_text) |
| `expansion_text` | TEXT | - | NO | |
| `category` | TEXT | `'General'` | YES | |
| `description` | TEXT | - | YES | |
| `is_active` | BOOLEAN | `TRUE` | YES | |
| `use_count` | INTEGER | `0` | YES | |
| `last_used` | TIMESTAMPTZ | - | YES | |
| `scope` | TEXT | `'global'` | YES | CHECK (`scope IN ('global', 'hpi', 'assessment', 'plan', 'ros', 'allergies')`) |
| `tenant_id` | TEXT | `'default'` | NO | Added in migration 008 |

**Unique Constraints:**
- `UNIQUE(user_id, trigger_text)`

**Indexes:**
- `idx_dot_phrases_user_id` ON `(user_id)`
- `idx_dot_phrases_trigger` ON `(user_id, trigger_text)`
- `idx_dot_phrases_category` ON `(user_id, category)`
- `idx_dot_phrases_scope` ON `(scope)`
- `idx_dot_phrases_tenant` ON `(tenant_id)`

**Triggers:**
- `dot_phrases_updated_at` BEFORE UPDATE -> `update_dot_phrases_updated_at()`

**RLS Policies** (per-user -- not shared):
| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view own phrases | SELECT | `USING (auth.uid() = user_id)` |
| Users can insert own phrases | INSERT | `WITH CHECK (auth.uid() = user_id)` |
| Users can update own phrases | UPDATE | `USING (auth.uid() = user_id)` |
| Users can delete own phrases | DELETE | `USING (auth.uid() = user_id)` |

---

### scale_definitions

Clinical scale definitions including questions and scoring logic. **No tenant_id** -- shared reference data.

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | TEXT | - | NO | PRIMARY KEY (e.g., `'midas'`, `'phq9'`) |
| `name` | TEXT | - | NO | |
| `abbreviation` | TEXT | - | NO | |
| `description` | TEXT | - | YES | |
| `category` | TEXT | - | NO | CHECK (see below) |
| `questions` | JSONB | - | NO | Array of question objects |
| `scoring_method` | TEXT | `'sum'` | NO | CHECK (`scoring_method IN ('sum', 'weighted', 'custom', 'average')`) |
| `scoring_ranges` | JSONB | - | NO | Array of `{min, max, grade, interpretation, severity, recommendations}` |
| `alerts` | JSONB | - | YES | Array of `{condition, type, message}` |
| `time_to_complete` | INTEGER | - | YES | Estimated minutes |
| `source` | TEXT | - | YES | Citation or source |
| `created_at` | TIMESTAMPTZ | `NOW()` | YES | |
| `updated_at` | TIMESTAMPTZ | `NOW()` | YES | |

**CHECK on `category`:** `category IN ('headache', 'cognitive', 'mental_health', 'movement', 'sleep', 'functional', 'quality_of_life', 'other')`

**Triggers:**
- `update_scale_definitions_updated_at` BEFORE UPDATE -> `update_updated_at()`

**RLS Policies:**
| Policy | Operation | Rule |
|--------|-----------|------|
| Authenticated users can view scale definitions | SELECT | `USING (auth.uid() IS NOT NULL)` |

---

### condition_scale_mapping

Maps clinical conditions/diagnoses to relevant scales. **No tenant_id** -- shared reference data.

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `gen_random_uuid()` | NO | PRIMARY KEY |
| `condition` | TEXT | - | NO | UNIQUE(condition, scale_id) |
| `scale_id` | TEXT | - | NO | FK -> `scale_definitions(id)` ON DELETE CASCADE |
| `priority` | INTEGER | `1` | YES | Lower = higher priority |
| `is_required` | BOOLEAN | `FALSE` | YES | |
| `created_at` | TIMESTAMPTZ | `NOW()` | YES | |

**Indexes:**
- `idx_condition_scale_mapping_condition` ON `(condition)`
- `idx_condition_scale_mapping_scale_id` ON `(scale_id)`

**RLS Policies:**
| Policy | Operation | Rule |
|--------|-----------|------|
| Authenticated users can view condition mapping | SELECT | `USING (auth.uid() IS NOT NULL)` |

---

### scale_results

Completed scale assessments with responses and scores (replaces/extends `clinical_scales`).

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `gen_random_uuid()` | NO | PRIMARY KEY |
| `created_at` | TIMESTAMPTZ | `NOW()` | YES | |
| `updated_at` | TIMESTAMPTZ | `NOW()` | YES | |
| `patient_id` | UUID | - | NO | FK -> `patients(id)` ON DELETE CASCADE |
| `visit_id` | UUID | - | YES | FK -> `visits(id)` ON DELETE SET NULL |
| `scale_id` | TEXT | - | NO | FK -> `scale_definitions(id)` ON DELETE CASCADE |
| `responses` | JSONB | - | NO | `{question_id: answer_value}` |
| `raw_score` | INTEGER | - | NO | |
| `interpretation` | TEXT | - | YES | |
| `severity_level` | TEXT | - | YES | CHECK (see below) |
| `grade` | TEXT | - | YES | e.g., `"Grade III"` |
| `triggered_alerts` | JSONB | - | YES | Array of triggered alerts |
| `notes` | TEXT | - | YES | Provider notes |
| `completed_by` | UUID | - | YES | FK -> `auth.users(id)` |
| `completed_at` | TIMESTAMPTZ | `NOW()` | YES | |
| `added_to_note` | BOOLEAN | `FALSE` | YES | |
| `added_to_note_at` | TIMESTAMPTZ | - | YES | |
| `tenant_id` | TEXT | `'default'` | NO | Added in migration 008 |

**CHECK on `severity_level`:** `severity_level IN ('minimal', 'mild', 'moderate', 'moderately_severe', 'severe')`

**Indexes:**
- `idx_scale_results_patient_id` ON `(patient_id)`
- `idx_scale_results_visit_id` ON `(visit_id)`
- `idx_scale_results_scale_id` ON `(scale_id)`
- `idx_scale_results_completed_at` ON `(completed_at)`
- `idx_scale_results_tenant` ON `(tenant_id)`

**Triggers:**
- `update_scale_results_updated_at` BEFORE UPDATE -> `update_updated_at()`

**RLS Policies** (after migration 017):
| Policy | Operation | Rule |
|--------|-----------|------|
| Authenticated users can view scale results | SELECT | `USING (true)` |
| Authenticated users can insert scale results | INSERT | `WITH CHECK (true)` |
| Authenticated users can update scale results | UPDATE | `USING (true) WITH CHECK (true)` |
| Authenticated users can delete scale results | DELETE | `USING (true)` |

---

### historian_sessions

AI Neurologic Historian voice interview sessions.

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `gen_random_uuid()` | NO | PRIMARY KEY |
| `tenant_id` | TEXT | `'default'` | NO | |
| `session_type` | TEXT | `'new_patient'` | NO | `new_patient` or `follow_up` |
| `patient_name` | TEXT | `''` | NO | |
| `referral_reason` | TEXT | - | YES | |
| `structured_output` | JSONB | - | YES | Full structured clinical data |
| `narrative_summary` | TEXT | - | YES | AI-generated narrative summary |
| `transcript` | JSONB | - | YES | Array of `{ role, text, timestamp }` |
| `red_flags` | JSONB | - | YES | Array of `{ flag, severity, context }` |
| `safety_escalated` | BOOLEAN | `FALSE` | NO | |
| `duration_seconds` | INTEGER | `0` | YES | |
| `question_count` | INTEGER | `0` | YES | |
| `status` | TEXT | `'in_progress'` | NO | `in_progress`, `completed`, or `abandoned` |
| `reviewed` | BOOLEAN | `FALSE` | NO | |
| `imported_to_note` | BOOLEAN | `FALSE` | NO | |
| `created_at` | TIMESTAMPTZ | `now()` | NO | |
| `updated_at` | TIMESTAMPTZ | `now()` | NO | |
| `patient_id` | UUID | - | YES | FK -> `patients(id)` ON DELETE SET NULL (migration 011) |

**Indexes:**
- `idx_historian_sessions_tenant` ON `(tenant_id)`
- `idx_historian_sessions_tenant_status` ON `(tenant_id, status)`
- `idx_historian_sessions_patient` ON `(patient_id)`

**RLS Policies:**
| Policy | Operation | Role | Rule |
|--------|-----------|------|------|
| Allow all for authenticated | ALL | authenticated | `USING (true) WITH CHECK (true)` |
| Allow anon inserts | INSERT | anon | `WITH CHECK (true)` |
| Allow anon selects | SELECT | anon | `USING (true)` |

---

### patient_intake_forms

Patient portal intake form submissions.

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `gen_random_uuid()` | NO | PRIMARY KEY |
| `tenant_id` | TEXT | `'default'` | NO | |
| `patient_name` | TEXT | - | NO | |
| `date_of_birth` | DATE | - | YES | |
| `email` | TEXT | - | YES | |
| `phone` | TEXT | - | YES | |
| `chief_complaint` | TEXT | - | YES | |
| `current_medications` | TEXT | - | YES | |
| `allergies` | TEXT | - | YES | |
| `medical_history` | TEXT | - | YES | |
| `family_history` | TEXT | - | YES | |
| `notes` | TEXT | - | YES | |
| `status` | TEXT | `'submitted'` | NO | `submitted` or `reviewed` |
| `created_at` | TIMESTAMPTZ | `now()` | NO | |
| `updated_at` | TIMESTAMPTZ | `now()` | NO | |

**Indexes:**
- `idx_intake_forms_tenant` ON `(tenant_id)`
- `idx_intake_forms_status` ON `(tenant_id, status)`

**RLS Policies:**
| Policy | Operation | Rule |
|--------|-----------|------|
| Allow all for authenticated | ALL | `USING (true) WITH CHECK (true)` |

---

### patient_messages

Patient portal messaging (inbound/outbound).

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `gen_random_uuid()` | NO | PRIMARY KEY |
| `tenant_id` | TEXT | `'default'` | NO | |
| `patient_name` | TEXT | - | NO | |
| `subject` | TEXT | `''` | NO | |
| `body` | TEXT | - | NO | |
| `direction` | TEXT | `'inbound'` | NO | `inbound` (patient to physician) or `outbound` |
| `is_read` | BOOLEAN | `FALSE` | NO | |
| `created_at` | TIMESTAMPTZ | `now()` | NO | |

**Indexes:**
- `idx_patient_messages_tenant` ON `(tenant_id)`
- `idx_patient_messages_tenant_read` ON `(tenant_id, is_read)`

**RLS Policies:**
| Policy | Operation | Rule |
|--------|-----------|------|
| Allow all for authenticated | ALL | `USING (true) WITH CHECK (true)` |

---

### clinical_plans

Shared reference library of clinical treatment plans. **No tenant_id** -- global reference data.

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `gen_random_uuid()` | NO | PRIMARY KEY |
| `plan_key` | TEXT | - | NO | UNIQUE |
| `title` | TEXT | - | NO | |
| `icd10_codes` | TEXT[] | `'{}'` | YES | |
| `scope` | TEXT | - | YES | |
| `notes` | TEXT[] | `'{}'` | YES | |
| `sections` | JSONB | `'{}'` | NO | Structured plan sections |
| `patient_instructions` | TEXT[] | `'{}'` | YES | |
| `referrals` | TEXT[] | `'{}'` | YES | |
| `differential` | JSONB | - | YES | |
| `evidence` | JSONB | - | YES | |
| `monitoring` | JSONB | - | YES | |
| `disposition` | JSONB | - | YES | |
| `source` | TEXT | `'neuro-plans'` | YES | |
| `created_at` | TIMESTAMPTZ | `now()` | YES | |
| `updated_at` | TIMESTAMPTZ | `now()` | YES | |

**Triggers:**
- `update_clinical_plans_updated_at` BEFORE UPDATE -> `update_updated_at_column()`

**RLS Policies:**
| Policy | Operation | Rule |
|--------|-----------|------|
| Authenticated users can read clinical plans | SELECT | `USING (true)` |

---

### saved_plans

User-owned saved/customized plans. **Per-user** (not shared across practice).

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `gen_random_uuid()` | NO | PRIMARY KEY |
| `tenant_id` | TEXT | `'default'` | NO | |
| `user_id` | UUID | - | NO | FK -> `auth.users(id)` ON DELETE CASCADE |
| `name` | TEXT | - | NO | |
| `description` | TEXT | - | YES | |
| `source_plan_key` | TEXT | - | YES | References `clinical_plans.plan_key` (no FK) |
| `selected_items` | JSONB | `'{}'` | NO | |
| `custom_items` | JSONB | `'{}'` | NO | |
| `plan_overrides` | JSONB | `'{}'` | YES | |
| `is_default` | BOOLEAN | `FALSE` | YES | |
| `use_count` | INTEGER | `0` | YES | |
| `last_used` | TIMESTAMPTZ | - | YES | |
| `created_at` | TIMESTAMPTZ | `now()` | YES | |
| `updated_at` | TIMESTAMPTZ | `now()` | YES | |

**Indexes:**
- `idx_saved_plans_user_id` ON `(user_id)`
- `idx_saved_plans_tenant_id` ON `(tenant_id)`
- `idx_saved_plans_source_plan_key` ON `(source_plan_key)`

**Triggers:**
- `update_saved_plans_updated_at` BEFORE UPDATE -> `update_updated_at_column()`

**RLS Policies** (per-user):
| Policy | Operation | Rule |
|--------|-----------|------|
| Users can read own saved plans | SELECT | `USING (auth.uid() = user_id)` |
| Users can insert own saved plans | INSERT | `WITH CHECK (auth.uid() = user_id)` |
| Users can update own saved plans | UPDATE | `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)` |
| Users can delete own saved plans | DELETE | `USING (auth.uid() = user_id)` |

---

### patient_medications

Patient medication records with dosage, frequency, and provenance tracking.

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `gen_random_uuid()` | NO | PRIMARY KEY |
| `patient_id` | UUID | - | NO | FK -> `patients(id)` ON DELETE CASCADE |
| `tenant_id` | TEXT | `'default'` | NO | |
| `medication_name` | TEXT | - | NO | |
| `generic_name` | TEXT | - | YES | |
| `dosage` | TEXT | - | YES | |
| `frequency` | TEXT | - | YES | |
| `route` | TEXT | `'PO'` | YES | |
| `start_date` | DATE | - | YES | |
| `end_date` | DATE | - | YES | |
| `prescriber` | TEXT | - | YES | |
| `indication` | TEXT | - | YES | |
| `status` | TEXT | `'active'` | NO | CHECK (`status IN ('active', 'discontinued', 'held', 'completed', 'failed')`) |
| `discontinue_reason` | TEXT | - | YES | |
| `source` | TEXT | `'manual'` | YES | CHECK (`source IN ('manual', 'ai_historian', 'ai_scribe', 'import')`) |
| `ai_confidence` | REAL | - | YES | |
| `confirmed_by_user` | BOOLEAN | `FALSE` | YES | |
| `notes` | TEXT | - | YES | |
| `is_active` | BOOLEAN | GENERATED ALWAYS AS (`status = 'active'`) STORED | NO | Computed column |
| `created_at` | TIMESTAMPTZ | `now()` | YES | |
| `updated_at` | TIMESTAMPTZ | `now()` | YES | |

**Indexes:**
- `idx_patient_medications_patient_id` ON `(patient_id)`
- `idx_patient_medications_patient_active` ON `(patient_id, is_active)`
- `idx_patient_medications_tenant_id` ON `(tenant_id)`

**Triggers:**
- `update_patient_medications_updated_at` BEFORE UPDATE -> `update_updated_at_column()`

**RLS Policies:**
| Policy | Operation | Rule |
|--------|-----------|------|
| Authenticated users can read medications | SELECT | `USING (true)` |
| Authenticated users can insert medications | INSERT | `WITH CHECK (true)` |
| Authenticated users can update medications | UPDATE | `USING (true) WITH CHECK (true)` |
| Authenticated users can delete medications | DELETE | `USING (true)` |

---

### patient_allergies

Patient allergy records with severity and reaction type.

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `gen_random_uuid()` | NO | PRIMARY KEY |
| `patient_id` | UUID | - | NO | FK -> `patients(id)` ON DELETE CASCADE |
| `tenant_id` | TEXT | `'default'` | NO | |
| `allergen` | TEXT | - | NO | |
| `allergen_type` | TEXT | `'drug'` | NO | CHECK (`allergen_type IN ('drug', 'food', 'environmental', 'other')`) |
| `reaction` | TEXT | - | YES | |
| `severity` | TEXT | `'unknown'` | YES | CHECK (`severity IN ('mild', 'moderate', 'severe', 'life-threatening', 'unknown')`) |
| `onset_date` | DATE | - | YES | |
| `source` | TEXT | `'manual'` | YES | CHECK (`source IN ('manual', 'ai_historian', 'ai_scribe', 'import')`) |
| `confirmed_by_user` | BOOLEAN | `FALSE` | YES | |
| `is_active` | BOOLEAN | `TRUE` | YES | |
| `notes` | TEXT | - | YES | |
| `created_at` | TIMESTAMPTZ | `now()` | YES | |
| `updated_at` | TIMESTAMPTZ | `now()` | YES | |

**Indexes:**
- `idx_patient_allergies_patient_id` ON `(patient_id)`
- `idx_patient_allergies_patient_active` ON `(patient_id, is_active)`
- `idx_patient_allergies_tenant_id` ON `(tenant_id)`

**Triggers:**
- `update_patient_allergies_updated_at` BEFORE UPDATE -> `update_updated_at_column()`

**RLS Policies:**
| Policy | Operation | Rule |
|--------|-----------|------|
| Authenticated users can read allergies | SELECT | `USING (true)` |
| Authenticated users can insert allergies | INSERT | `WITH CHECK (true)` |
| Authenticated users can update allergies | UPDATE | `USING (true) WITH CHECK (true)` |
| Authenticated users can delete allergies | DELETE | `USING (true)` |

---

### medication_reviews

Audit trail for medication reconciliation events.

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `gen_random_uuid()` | NO | PRIMARY KEY |
| `patient_id` | UUID | - | NO | FK -> `patients(id)` ON DELETE CASCADE |
| `visit_id` | UUID | - | YES | FK -> `visits(id)` |
| `tenant_id` | TEXT | `'default'` | NO | |
| `reviewed_by` | UUID | - | YES | FK -> `auth.users(id)` |
| `review_type` | TEXT | `'reconciliation'` | YES | CHECK (`review_type IN ('reconciliation', 'renewal', 'initial')`) |
| `changes_made` | JSONB | `'[]'` | YES | |
| `notes` | TEXT | - | YES | |
| `created_at` | TIMESTAMPTZ | `now()` | YES | |

**Indexes:**
- `idx_medication_reviews_patient_id` ON `(patient_id)`
- `idx_medication_reviews_visit_id` ON `(visit_id)`
- `idx_medication_reviews_tenant_id` ON `(tenant_id)`

**RLS Policies:**
| Policy | Operation | Rule |
|--------|-----------|------|
| Authenticated users can read medication reviews | SELECT | `USING (true)` |
| Authenticated users can insert medication reviews | INSERT | `WITH CHECK (true)` |

---

### appointments

Scheduled patient appointments with follow-up tracking.

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `gen_random_uuid()` | NO | PRIMARY KEY |
| `created_at` | TIMESTAMPTZ | `now()` | YES | |
| `updated_at` | TIMESTAMPTZ | `now()` | YES | |
| `tenant_id` | TEXT | `'default'` | NO | |
| `patient_id` | UUID | - | NO | FK -> `patients(id)` ON DELETE CASCADE |
| `visit_id` | UUID | - | YES | FK -> `visits(id)` |
| `prior_visit_id` | UUID | - | YES | FK -> `visits(id)` |
| `created_by` | UUID | - | YES | FK -> `auth.users(id)` |
| `appointment_date` | DATE | - | NO | |
| `appointment_time` | TIME | - | NO | |
| `duration_minutes` | INTEGER | `30` | YES | |
| `appointment_type` | TEXT | `'follow_up'` | NO | |
| `status` | TEXT | `'scheduled'` | NO | CHECK (see below) |
| `hospital_site` | TEXT | - | YES | |
| `reason_for_visit` | TEXT | - | YES | |
| `scheduling_notes` | TEXT | - | YES | |
| `provider_name` | TEXT | - | YES | Added in migration 017 |

**CHECK on `status`:** `status IN ('scheduled', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show')`

**Indexes:**
- `idx_appointments_patient_id` ON `(patient_id)`
- `idx_appointments_date` ON `(appointment_date)`
- `idx_appointments_status` ON `(status)`
- `idx_appointments_tenant_id` ON `(tenant_id)`

**Triggers:**
- `update_appointments_updated_at` BEFORE UPDATE -> `update_updated_at_column()`

**RLS Policies:**
| Policy | Operation | Rule |
|--------|-----------|------|
| Authenticated users can read appointments | SELECT | `USING (true)` |
| Authenticated users can insert appointments | INSERT | `WITH CHECK (true)` |
| Authenticated users can update appointments | UPDATE | `USING (true) WITH CHECK (true)` |
| Authenticated users can delete appointments | DELETE | `USING (true)` |

---

### feedback

Cross-user feedback/feature requests with voting and admin workflow.

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `gen_random_uuid()` | NO | PRIMARY KEY |
| `text` | TEXT | - | NO | |
| `user_id` | UUID | - | YES | FK -> `auth.users(id)` |
| `user_email` | TEXT | - | YES | |
| `upvotes` | TEXT[] | `'{}'` | YES | Array of user identifiers |
| `downvotes` | TEXT[] | `'{}'` | YES | Array of user identifiers |
| `created_at` | TIMESTAMPTZ | `now()` | YES | |
| `updated_at` | TIMESTAMPTZ | `now()` | YES | |
| `status` | TEXT | `'pending'` | YES | CHECK (`status IN ('pending', 'approved', 'in_progress', 'addressed', 'declined')`) (migration 018) |
| `admin_response` | TEXT | - | YES | Added in migration 018 |
| `admin_user_id` | UUID | - | YES | FK -> `auth.users(id)` (migration 018) |
| `admin_user_email` | TEXT | - | YES | Added in migration 018 |
| `status_updated_at` | TIMESTAMPTZ | - | YES | Added in migration 018 |

**Indexes:**
- `idx_feedback_status` ON `(status)`

**RLS Policies:**
| Policy | Operation | Rule |
|--------|-----------|------|
| Anyone can view feedback | SELECT | `USING (true)` |
| Authenticated users can create feedback | INSERT | `WITH CHECK (true)` |
| Anyone can update feedback | UPDATE | `USING (true)` |

**Grants:** `ALL` to `authenticated`, `anon`, `service_role`

---

### feedback_comments

Comments on feedback items for discussion threads.

| Column | Type | Default | Nullable | Constraints |
|--------|------|---------|----------|-------------|
| `id` | UUID | `gen_random_uuid()` | NO | PRIMARY KEY |
| `feedback_id` | UUID | - | NO | FK -> `feedback(id)` ON DELETE CASCADE |
| `user_id` | UUID | - | YES | FK -> `auth.users(id)` |
| `user_email` | TEXT | - | YES | |
| `text` | TEXT | - | NO | |
| `is_admin_comment` | BOOLEAN | `FALSE` | YES | |
| `created_at` | TIMESTAMPTZ | `now()` | YES | |

**Indexes:**
- `idx_feedback_comments_feedback_id` ON `(feedback_id)`

**RLS Policies:**
| Policy | Operation | Rule |
|--------|-----------|------|
| Anyone can view feedback comments | SELECT | `USING (true)` |
| Authenticated users can create comments | INSERT | `WITH CHECK (true)` |
| Users can delete own comments | DELETE | `USING (auth.uid() = user_id)` |

**Grants:** `ALL` to `authenticated`, `anon`, `service_role`

---

## 3. Relationships

### Entity Relationship Summary

```
auth.users (Supabase Auth)
  |-- 1:N --> patients (user_id)
  |-- 1:N --> visits (user_id)
  |-- 1:N --> dot_phrases (user_id)
  |-- 1:N --> saved_plans (user_id)
  |-- 1:N --> feedback (user_id)
  |-- 1:N --> feedback_comments (user_id)
  |-- 1:N --> appointments (created_by)
  |-- 1:N --> medication_reviews (reviewed_by)
  |-- 1:N --> scale_results (completed_by)

patients
  |-- 1:N --> visits (patient_id)
  |-- 1:N --> diagnoses (patient_id)
  |-- 1:N --> imaging_studies (patient_id)
  |-- 1:N --> clinical_scales (patient_id)
  |-- 1:N --> scale_results (patient_id)
  |-- 1:N --> patient_medications (patient_id)
  |-- 1:N --> patient_allergies (patient_id)
  |-- 1:N --> medication_reviews (patient_id)
  |-- 1:N --> appointments (patient_id)
  |-- 1:N --> historian_sessions (patient_id)

visits
  |-- 1:1 --> clinical_notes (visit_id, UNIQUE)
  |-- 1:N --> diagnoses (visit_id)
  |-- 1:N --> clinical_scales (visit_id)
  |-- 1:N --> scale_results (visit_id, ON DELETE SET NULL)
  |-- 1:N --> medication_reviews (visit_id)
  |-- 1:N --> appointments (visit_id)
  |-- 1:N --> appointments (prior_visit_id)

scale_definitions
  |-- 1:N --> condition_scale_mapping (scale_id)
  |-- 1:N --> scale_results (scale_id)

feedback
  |-- 1:N --> feedback_comments (feedback_id)
```

### Key Relationship Details

- **patients -> visits**: A patient has many visits. Cascade delete removes all visits when a patient is deleted.
- **visits -> clinical_notes**: One-to-one relationship enforced by `UNIQUE(visit_id)`. Cascade delete.
- **visits -> diagnoses**: A visit can have multiple diagnoses. One is marked `is_primary = TRUE`.
- **patients -> imaging_studies**: Studies are linked to patients (not visits) for longitudinal tracking.
- **scale_definitions -> scale_results**: Scale results reference the scale definition by its TEXT id (e.g., `'midas'`).
- **visits -> scale_results**: Uses `ON DELETE SET NULL` -- scale results survive visit deletion.
- **historian_sessions -> patients**: Optional FK with `ON DELETE SET NULL` -- sessions survive patient deletion.
- **appointments**: Has two visit FKs: `visit_id` (the new visit) and `prior_visit_id` (the visit that triggered scheduling).

---

## 4. Multi-Tenancy

### How It Works

Multi-tenancy is implemented via a `tenant_id TEXT` column with a default value of `'default'`. This enables demo isolation where different organizations or practice instances can coexist in the same database.

### Tables With tenant_id

| Table | Default | Added In |
|-------|---------|----------|
| `patients` | `'default'` | Migration 008 |
| `visits` | `'default'` | Migration 008 |
| `clinical_notes` | `'default'` | Migration 008 |
| `clinical_scales` | `'default'` | Migration 008 |
| `diagnoses` | `'default'` | Migration 008 |
| `imaging_studies` | `'default'` | Migration 008 |
| `scale_results` | `'default'` | Migration 008 |
| `dot_phrases` | `'default'` | Migration 008 |
| `historian_sessions` | `'default'` | Migration 010 |
| `patient_intake_forms` | `'default'` | Migration 009 |
| `patient_messages` | `'default'` | Migration 009 |
| `saved_plans` | `'default'` | Migration 013 |
| `patient_medications` | `'default'` | Migration 014 |
| `patient_allergies` | `'default'` | Migration 014 |
| `medication_reviews` | `'default'` | Migration 014 |
| `appointments` | `'default'` | Migration 016 |

### Tables Without tenant_id (Global/Shared)

| Table | Reason |
|-------|--------|
| `app_settings` | Application-wide configuration |
| `clinical_plans` | Shared reference library |
| `scale_definitions` | Shared clinical scale definitions |
| `condition_scale_mapping` | Shared condition-to-scale mapping |
| `feedback` | Cross-user feedback system |
| `feedback_comments` | Cross-user feedback comments |

### Current RLS Approach

Current RLS policies use `USING (true)` for most clinical data tables, meaning all authenticated users can access all rows regardless of tenant. **For production multi-practice deployment**, the comment in migration 017 notes that policies should be updated to:
```sql
USING (tenant_id = get_user_tenant())
```
using a proper tenant lookup function.

---

## 5. CHECK Constraints

| Table | Column | Valid Values |
|-------|--------|--------------|
| `patients` | `gender` | `'M'`, `'F'`, `'O'` |
| `visits` | `visit_type` | `'new_patient'`, `'follow_up'`, `'urgent'`, `'telehealth'` |
| `visits` | `status` | `'scheduled'`, `'in_progress'`, `'completed'`, `'cancelled'` |
| `clinical_scales` | `scale_type` | `'MIDAS'`, `'HIT6'`, `'PHQ9'`, `'GAD7'`, `'MOCA'`, `'MINICOG'` |
| `imaging_studies` | `study_type` | `'CT'`, `'MRI'`, `'XRAY'`, `'US'`, `'OTHER'` |
| `dot_phrases` | `scope` | `'global'`, `'hpi'`, `'assessment'`, `'plan'`, `'ros'`, `'allergies'` |
| `scale_definitions` | `category` | `'headache'`, `'cognitive'`, `'mental_health'`, `'movement'`, `'sleep'`, `'functional'`, `'quality_of_life'`, `'other'` |
| `scale_definitions` | `scoring_method` | `'sum'`, `'weighted'`, `'custom'`, `'average'` |
| `scale_results` | `severity_level` | `'minimal'`, `'mild'`, `'moderate'`, `'moderately_severe'`, `'severe'` |
| `patient_medications` | `status` | `'active'`, `'discontinued'`, `'held'`, `'completed'`, `'failed'` |
| `patient_medications` | `source` | `'manual'`, `'ai_historian'`, `'ai_scribe'`, `'import'` |
| `patient_allergies` | `allergen_type` | `'drug'`, `'food'`, `'environmental'`, `'other'` |
| `patient_allergies` | `severity` | `'mild'`, `'moderate'`, `'severe'`, `'life-threatening'`, `'unknown'` |
| `patient_allergies` | `source` | `'manual'`, `'ai_historian'`, `'ai_scribe'`, `'import'` |
| `medication_reviews` | `review_type` | `'reconciliation'`, `'renewal'`, `'initial'` |
| `appointments` | `status` | `'scheduled'`, `'confirmed'`, `'checked_in'`, `'in_progress'`, `'completed'`, `'cancelled'`, `'no_show'` |
| `feedback` | `status` | `'pending'`, `'approved'`, `'in_progress'`, `'addressed'`, `'declined'` |

---

## 6. Functions

### get_openai_key()

Securely retrieves the OpenAI API key from `app_settings`. Uses `SECURITY DEFINER` to bypass RLS. Requires authentication (`auth.uid() IS NOT NULL`).

```sql
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
```

### update_updated_at()

Generic trigger function that sets `NEW.updated_at = NOW()`. Used by tables created in migration 001.

### update_updated_at_column()

Same purpose as `update_updated_at()` but created in migration 013. Used by tables created in migrations 013+.

### update_dot_phrases_updated_at()

Dedicated trigger function for the `dot_phrases` table. Sets `NEW.updated_at = NOW()`.

### seed_demo_data(user_uuid UUID)

Creates demo patient, visits, clinical notes, scales, diagnoses, and imaging studies for a new user. `SECURITY DEFINER`. Granted to `authenticated`.

### seed_default_dot_phrases(p_user_id UUID)

Inserts a set of default neurology dot phrases for a new user. Uses `ON CONFLICT DO NOTHING` to avoid duplicates.

### get_scales_for_condition(p_condition TEXT)

Returns all scale definitions mapped to a given condition, ordered by priority. `SECURITY DEFINER`.

### get_patient_scale_history(p_patient_id UUID, p_scale_id TEXT, p_limit INTEGER)

Returns historical scale results for a patient, optionally filtered by scale. Verifies user access. `SECURITY DEFINER`.

### get_patients_for_portal(p_tenant_id TEXT)

Returns patient list for the patient portal. `SECURITY DEFINER` (bypasses RLS for anon access). Granted to `anon` and `authenticated`.

### get_patient_context_for_portal(p_patient_id UUID)

Returns patient name, referral reason, last visit data, last note fields (HPI, assessment, plan, summary, allergies, ROS), and active diagnoses. Used by AI Historian for clinical context. `SECURITY DEFINER`. Granted to `anon` and `authenticated`.

### portal_register_patient(p_first_name, p_last_name, p_referral_reason, p_tenant_id)

Registers a new patient from the portal (without authentication). Assigns the first physician's `user_id` from the tenant. Generates a `PTL-XXXXXX` MRN. `SECURITY DEFINER`. Granted to `anon` and `authenticated`.

---

## 7. Triggers

| Trigger | Table | Timing | Function |
|---------|-------|--------|----------|
| `update_patients_updated_at` | `patients` | BEFORE UPDATE | `update_updated_at()` |
| `update_visits_updated_at` | `visits` | BEFORE UPDATE | `update_updated_at()` |
| `update_clinical_notes_updated_at` | `clinical_notes` | BEFORE UPDATE | `update_updated_at()` |
| `update_app_settings_updated_at` | `app_settings` | BEFORE UPDATE | `update_updated_at()` |
| `dot_phrases_updated_at` | `dot_phrases` | BEFORE UPDATE | `update_dot_phrases_updated_at()` |
| `update_scale_definitions_updated_at` | `scale_definitions` | BEFORE UPDATE | `update_updated_at()` |
| `update_scale_results_updated_at` | `scale_results` | BEFORE UPDATE | `update_updated_at()` |
| `update_saved_plans_updated_at` | `saved_plans` | BEFORE UPDATE | `update_updated_at_column()` |
| `update_clinical_plans_updated_at` | `clinical_plans` | BEFORE UPDATE | `update_updated_at_column()` |
| `update_patient_medications_updated_at` | `patient_medications` | BEFORE UPDATE | `update_updated_at_column()` |
| `update_patient_allergies_updated_at` | `patient_allergies` | BEFORE UPDATE | `update_updated_at_column()` |
| `update_appointments_updated_at` | `appointments` | BEFORE UPDATE | `update_updated_at_column()` |

All triggers fire `FOR EACH ROW` and set `updated_at` to the current timestamp.
