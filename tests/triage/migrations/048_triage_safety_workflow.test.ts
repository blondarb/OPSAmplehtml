import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "migrations/048_triage_safety_workflow.sql",
);

describe("048 triage safety workflow migration", () => {
  const readMigration = () => readFileSync(migrationPath, "utf8");

  it("persists orthogonal clinical safety and workflow state", () => {
    const sql = readMigration();

    expect(sql).toContain("ADD COLUMN IF NOT EXISTS care_pathway text");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS data_quality text");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS coverage_status text");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS review_requirement text");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS workflow_status text");
    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS scheduling_locked boolean NOT NULL DEFAULT true",
    );
    expect(sql).toContain(
      "ALTER COLUMN care_pathway SET DEFAULT 'undetermined'",
    );
    expect(sql).toContain("ALTER COLUMN data_quality SET DEFAULT 'partial'");
    expect(sql).toContain(
      "ALTER COLUMN coverage_status SET DEFAULT 'legacy_unknown'",
    );
    expect(sql).toContain(
      "ALTER COLUMN review_requirement SET DEFAULT 'clinician_confirmation'",
    );
    expect(sql).toContain(
      "ALTER COLUMN workflow_status SET DEFAULT 'pending_safety_screen'",
    );
    expect(sql).toContain(
      "care_pathway IN ('emergency_now','same_day_clinician_review','expedited_outpatient','routine_outpatient','redirect','undetermined')",
    );
    expect(sql).toContain(
      "data_quality IN ('sufficient','partial','insufficient','conflicting')",
    );
    expect(sql).toContain(
      "workflow_status IN ('pending_safety_screen','emergency_hold','clinician_review','provider_clarification','patient_clarification','decision_ready','action_pending','closed')",
    );
  });

  it("adds server-managed tenant and clinical membership boundaries", () => {
    const sql = readMigration();

    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default'",
    );
    expect(sql).toContain("ALTER TABLE neurology_consults");
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS clinical_access_memberships",
    );
    expect(sql).toContain(
      "role text NOT NULL CHECK (role IN ('clinician','scheduler','admin','viewer'))",
    );
    expect(sql).toContain("PRIMARY KEY (user_id, tenant_id)");
    expect(sql).toContain("active boolean NOT NULL DEFAULT true");
  });

  it("creates closed-loop emergency actions and append-only workflow events", () => {
    const sql = readMigration();

    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS triage_emergency_actions",
    );
    expect(sql).toContain("next_escalation_at timestamptz NOT NULL");
    expect(sql).toContain("understanding_status text");
    expect(sql).toContain("delivery_status IN ('delivered','not_applicable')");
    expect(sql).toContain(
      "understanding_status IN ('confirmed','not_applicable')",
    );
    expect(sql).toMatch(
      /contact_attempted_at IS NOT NULL[\s\S]+contact_channel IS NOT NULL/,
    );
    expect(sql).toMatch(
      /instruction_given IS NOT NULL[\s\S]+outcome IS NOT NULL/,
    );
    expect(sql).toMatch(
      /reviewed_by IS NOT NULL[\s\S]+reviewed_at IS NOT NULL/,
    );
    expect(sql).toContain("enforce_emergency_action_transition");
    expect(sql).toContain("triage_emergency_action_transition_guard");
    expect(sql).toContain("enforce_triage_workflow_transition");
    expect(sql).toContain("triage_workflow_transition_guard");
    expect(sql).toMatch(
      /NEW\.workflow_status = 'closed'[\s\S]+FROM triage_emergency_actions[\s\S]+status <> 'closed'/,
    );
    expect(sql).toContain("status <> 'closed'");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS triage_workflow_events");
    expect(sql).toContain("reject_triage_workflow_event_mutation");
    expect(sql).toContain("CREATE TRIGGER triage_workflow_events_append_only");
  });

  it("prevents closed-loop evidence from being bypassed or rewritten", () => {
    const sql = readMigration();

    expect(sql).toContain("new emergency actions must start open");
    expect(sql).toContain(
      "emergency action closure reviewer is not authorized",
    );
    expect(sql).toContain("closed emergency actions are immutable");
    expect(sql).toContain("emergency actions cannot be deleted");
    expect(sql).toContain("emergency action workflow linkage is immutable");
    expect(sql).toContain(
      "BEFORE INSERT OR UPDATE OR DELETE ON triage_emergency_actions",
    );
    expect(sql).toContain("new triage workflows cannot start closed");
    expect(sql).toContain("closed triage workflows are immutable");
    expect(sql).toContain("finalized triage workflows cannot be deleted");
    expect(sql).toContain(
      "BEFORE INSERT OR UPDATE OR DELETE ON triage_sessions",
    );
    expect(sql).toContain("enforce_triage_clarification_question_integrity");
    expect(sql).toContain("clarification questions cannot be deleted");
    expect(sql).toContain(
      "clarification questions cannot change after workflow closure",
    );
  });

  it("persists clinician-approved provider and patient clarification questions", () => {
    const sql = readMigration();

    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS triage_clarification_questions",
    );
    expect(sql).toContain(
      "target text NOT NULL CHECK (target IN ('patient','provider','human_reviewer'))",
    );
    expect(sql).toContain(
      "criticality text NOT NULL CHECK (criticality IN ('critical','non_critical'))",
    );
    expect(sql).toContain("question_code text NOT NULL");
    expect(sql).toContain("question_text text NOT NULL");
    expect(sql).toContain("approved_by text");
    expect(sql).toContain("approved_at timestamptz");
    expect(sql).toContain("raw_answer text");
    expect(sql).toContain("normalized_answer jsonb");
    expect(sql).toContain("verified_by text");
  });

  it("adds a database backstop for triage-linked appointment activation", () => {
    const sql = readMigration();

    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS triage_session_id uuid REFERENCES triage_sessions(id) ON DELETE RESTRICT",
    );
    expect(sql).toContain("enforce_triage_appointment_safety");
    expect(sql).toContain("CREATE TRIGGER appointments_triage_safety_gate");
    expect(sql).toContain(
      "v_care_pathway NOT IN ('expedited_outpatient', 'routine_outpatient')",
    );
    expect(sql).toContain("v_data_quality <> 'sufficient'");
    expect(sql).toContain("v_coverage_status <> 'complete'");
    expect(sql).toContain("v_review_requirement <> 'none'");
    expect(sql).toContain("v_workflow_status <> 'decision_ready'");
    expect(sql).toContain("v_scheduling_locked");
    expect(sql).toContain("v_reviewed_at IS NULL");
    expect(sql).toContain("v_reviewed_by IS NULL");
    expect(sql).toContain("v_final_care_pathway IS NULL");
    expect(sql).toContain("v_final_triage_tier IS NULL");
    expect(sql).toContain(
      "v_final_triage_tier IN ('emergent', 'insufficient_data')",
    );
    expect(sql).toContain("membership_safety_revoke_appointments");
    expect(sql).toContain("clinical_access_memberships reviewer_membership");
    expect(sql).toMatch(
      /OLD\.triage_session_id IS NOT NULL\s+AND NEW\.triage_session_id IS NULL/,
    );
    expect(sql).toContain("NEW.status IN ('cancelled', 'canceled')");
    expect(sql).toContain("revoke_unsafe_triage_appointments");
    expect(sql).toContain("triage_safety_revoke_appointments");
    expect(sql).toContain("clarification_safety_revoke_appointments");
    expect(sql).toContain("emergency_action_safety_revoke_appointments");
    expect(sql).toMatch(
      /FROM triage_emergency_actions action[\s\S]+action\.status <> 'closed'/,
    );
    expect(sql).toContain(
      "AFTER UPDATE OF tenant_id, care_pathway, data_quality, coverage_status",
    );
    expect(sql).toContain(
      "AFTER UPDATE OF user_id, tenant_id, active, role OR DELETE",
    );
  });
});
