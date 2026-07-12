import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { getPoolMock } = vi.hoisted(() => ({ getPoolMock: vi.fn() }))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { finalizeTriageAttempt } from '@/lib/triage/triageCompletionPersistence'

const runIntegration = process.env.TRIAGE_COMPLETION_PG_INTEGRATION === '1'
const describeIntegration = runIntegration ? describe : describe.skip

const tenantId = 'tenant-integration'
const patientId = '55000000-0000-4000-8000-000000000201'
const migration = readFileSync(
  resolve(
    process.cwd(),
    'migrations/055_unique_consult_per_triage_session.sql',
  ),
  'utf8',
)

function completionInput(
  triageSessionId: string,
): Parameters<typeof finalizeTriageAttempt>[0] {
  return {
    triageSessionId,
    tenantId,
    processingAttemptCount: 1,
    proposedCarePathway: 'routine_outpatient',
    scoringTier: 'routine',
    confidence: 'high',
    dimensionScores: {
      symptom_acuity: { score: 1, rationale: 'Synthetic stable finding.' },
    },
    weightedScore: 1,
    clinicalReasons: ['Synthetic stable finding.'],
    redFlags: ['Synthetic red-flag evidence.'],
    suggestedWorkup: [],
    failedTherapies: [],
    missingInformation: null,
    subspecialtyRecommendation: 'General Neurology',
    subspecialtyRationale: 'Synthetic rationale.',
    aiRawResponse: { confidence: 'high' },
    aiInputTokens: 100,
    aiOutputTokens: 50,
    systemConsult: {
      expectedPatientId: patientId,
      referralText: 'Synthetic source-bound referral.',
      chiefComplaint: 'Synthetic complaint.',
    },
  }
}

describeIntegration('finalizeTriageAttempt PostgreSQL transaction behavior', () => {
  let pool: Pool

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT),
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
    })
    getPoolMock.mockResolvedValue(pool)
    await pool.query(`
      CREATE TABLE patients (
        id uuid PRIMARY KEY,
        tenant_id text NOT NULL
      );

      CREATE TABLE triage_sessions (
        id uuid PRIMARY KEY,
        tenant_id text NOT NULL,
        patient_id uuid REFERENCES patients(id),
        consult_id uuid,
        care_pathway text NOT NULL,
        data_quality text NOT NULL,
        review_requirement text NOT NULL,
        workflow_status text NOT NULL,
        processing_status text NOT NULL,
        processing_attempt_count integer NOT NULL,
        processing_claimed_at timestamptz,
        processing_lease_expires_at timestamptz,
        triage_tier text,
        confidence text,
        dimension_scores jsonb,
        weighted_score numeric,
        clinical_reasons jsonb,
        red_flags jsonb,
        suggested_workup jsonb,
        failed_therapies jsonb,
        missing_information jsonb,
        subspecialty_recommendation text,
        subspecialty_rationale text,
        ai_raw_response jsonb,
        ai_input_tokens integer,
        ai_output_tokens integer,
        scheduling_locked boolean NOT NULL DEFAULT true,
        completed_at timestamptz
      );

      CREATE TABLE neurology_consults (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        patient_id uuid REFERENCES patients(id),
        status text NOT NULL DEFAULT 'triage_pending',
        triage_session_id uuid REFERENCES triage_sessions(id),
        triage_urgency text,
        triage_tier_display text,
        triage_summary text,
        triage_chief_complaint text,
        triage_red_flags text[],
        triage_subspecialty text,
        triage_completed_at timestamptz,
        referral_text text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE triage_emergency_actions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        triage_session_id uuid NOT NULL REFERENCES triage_sessions(id),
        status text NOT NULL
      );
    `)
    await pool.query(migration)
  })

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE triage_emergency_actions, neurology_consults, triage_sessions, patients',
    )
    await pool.query(
      'INSERT INTO patients (id, tenant_id) VALUES ($1, $2)',
      [patientId, tenantId],
    )
  })

  afterAll(async () => {
    await pool?.end()
  })

  async function insertPendingSession(id: string, consultId: string | null = null) {
    await pool.query(
      `INSERT INTO triage_sessions (
         id, tenant_id, patient_id, consult_id, care_pathway, data_quality,
         review_requirement, workflow_status, processing_status,
         processing_attempt_count, processing_claimed_at,
         processing_lease_expires_at
       ) VALUES (
         $1, $2, $3, $4, 'routine_outpatient', 'sufficient',
         'clinician_confirmation', 'clinician_review', 'pending', 1,
         now(), now() + interval '3 minutes'
       )`,
      [id, tenantId, patientId, consultId],
    )
  }

  it('commits one system consult and its session link together', async () => {
    const triageSessionId = randomUUID()
    await insertPendingSession(triageSessionId)

    const result = await finalizeTriageAttempt(completionInput(triageSessionId))

    expect(result).toMatchObject({ ok: true, consultId: expect.any(String) })
    const persisted = await pool.query(
      `SELECT session.processing_status,
              session.consult_id,
              consult.tenant_id,
              consult.patient_id,
              consult.triage_red_flags,
              consult.triage_session_id
         FROM triage_sessions session
         JOIN neurology_consults consult ON consult.id = session.consult_id
        WHERE session.id = $1`,
      [triageSessionId],
    )
    expect(persisted.rows).toEqual([
      expect.objectContaining({
        processing_status: 'complete',
        consult_id: result.ok ? result.consultId : null,
        tenant_id: tenantId,
        patient_id: patientId,
        triage_red_flags: ['Synthetic red-flag evidence.'],
        triage_session_id: triageSessionId,
      }),
    ])
  })

  it('writes the open-emergency floor into the system consult', async () => {
    const triageSessionId = randomUUID()
    await insertPendingSession(triageSessionId)
    await pool.query(
      `INSERT INTO triage_emergency_actions (triage_session_id, status)
       VALUES ($1, 'open')`,
      [triageSessionId],
    )

    await expect(
      finalizeTriageAttempt(completionInput(triageSessionId)),
    ).resolves.toMatchObject({
      ok: true,
      triageTier: 'emergent',
      carePathway: 'emergency_now',
    })
    const persisted = await pool.query(
      `SELECT session.triage_tier,
              session.care_pathway,
              consult.triage_urgency,
              consult.triage_tier_display
         FROM triage_sessions session
         JOIN neurology_consults consult ON consult.id = session.consult_id
        WHERE session.id = $1`,
      [triageSessionId],
    )
    expect(persisted.rows[0]).toMatchObject({
      triage_tier: 'emergent',
      care_pathway: 'emergency_now',
      triage_urgency: 'emergent',
      triage_tier_display: expect.stringContaining('EMERGENT'),
    })
  })

  it('recovers an eligible orphan without creating a duplicate consult', async () => {
    const triageSessionId = randomUUID()
    const orphanId = randomUUID()
    await insertPendingSession(triageSessionId)
    await pool.query(
      `INSERT INTO neurology_consults (
         id, tenant_id, patient_id, status, triage_session_id, referral_text
       ) VALUES ($1, $2, $3, 'triage_complete', $4, 'Synthetic prior attempt.')`,
      [orphanId, tenantId, patientId, triageSessionId],
    )

    await expect(
      finalizeTriageAttempt(completionInput(triageSessionId)),
    ).resolves.toMatchObject({ ok: true, consultId: orphanId })
    const count = await pool.query(
      'SELECT count(*)::integer AS count FROM neurology_consults WHERE triage_session_id = $1',
      [triageSessionId],
    )
    expect(count.rows[0]?.count).toBe(1)
  })

  it('rejects a wrong-tenant binding and retains one canonical consult', async () => {
    const triageSessionId = randomUUID()
    const orphanId = randomUUID()
    await insertPendingSession(triageSessionId)
    await expect(
      pool.query(
        `INSERT INTO neurology_consults (
           id, tenant_id, patient_id, status, triage_session_id
         ) VALUES ($1, 'wrong-tenant', $2, 'triage_complete', $3)`,
        [orphanId, patientId, triageSessionId],
      ),
    ).rejects.toThrow('consult and triage session tenant binding must match')

    const result = await finalizeTriageAttempt(completionInput(triageSessionId))
    expect(result).toMatchObject({ ok: true, consultId: expect.any(String) })
    const bindings = await pool.query(
      `SELECT tenant_id, id
         FROM neurology_consults
        WHERE triage_session_id = $1
        ORDER BY tenant_id`,
      [triageSessionId],
    )
    expect(bindings.rows).toEqual([
      { tenant_id: tenantId, id: result.ok ? result.consultId : null },
    ])
  })

  it('serializes concurrent finalizers to one canonical consult', async () => {
    const triageSessionId = randomUUID()
    await insertPendingSession(triageSessionId)

    const results = await Promise.all([
      finalizeTriageAttempt(completionInput(triageSessionId)),
      finalizeTriageAttempt(completionInput(triageSessionId)),
    ])
    const successes = results.filter((result) => result.ok)
    expect(successes).toHaveLength(1)
    expect(results).toContainEqual({
      ok: false,
      reason: 'claim_or_binding_changed',
    })

    const persisted = await pool.query(
      `SELECT session.consult_id,
              count(consult.id)::integer AS consult_count,
              min(consult.id::text) AS canonical_consult_id
         FROM triage_sessions session
         JOIN neurology_consults consult
           ON consult.triage_session_id = session.id
        WHERE session.id = $1
        GROUP BY session.consult_id`,
      [triageSessionId],
    )
    expect(persisted.rows).toEqual([
      {
        consult_id: successes[0]?.consultId,
        consult_count: 1,
        canonical_consult_id: successes[0]?.consultId,
      },
    ])
  })

  it('rolls back when a same-tenant orphan is bound to the wrong patient', async () => {
    const triageSessionId = randomUUID()
    const orphanId = randomUUID()
    const wrongPatientId = randomUUID()
    await insertPendingSession(triageSessionId)
    await pool.query(
      'INSERT INTO patients (id, tenant_id) VALUES ($1, $2)',
      [wrongPatientId, tenantId],
    )
    await pool.query(
      `INSERT INTO neurology_consults (
         id, tenant_id, patient_id, status, triage_session_id
       ) VALUES ($1, $2, $3, 'triage_complete', $4)`,
      [orphanId, tenantId, wrongPatientId, triageSessionId],
    )

    await expect(
      finalizeTriageAttempt(completionInput(triageSessionId)),
    ).resolves.toEqual({ ok: false, reason: 'claim_or_binding_changed' })
    const session = await pool.query(
      'SELECT processing_status, consult_id FROM triage_sessions WHERE id = $1',
      [triageSessionId],
    )
    expect(session.rows[0]).toEqual({
      processing_status: 'pending',
      consult_id: null,
    })
  })

  it('rolls back completion when the consult insert raises', async () => {
    const triageSessionId = randomUUID()
    await insertPendingSession(triageSessionId)
    await pool.query(`
      CREATE OR REPLACE FUNCTION reject_synthetic_consult()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'synthetic consult insert failure';
      END;
      $$;
      CREATE TRIGGER reject_synthetic_consult_trigger
      BEFORE INSERT ON neurology_consults
      FOR EACH ROW EXECUTE FUNCTION reject_synthetic_consult();
    `)

    await expect(
      finalizeTriageAttempt(completionInput(triageSessionId)),
    ).resolves.toEqual({ ok: false, reason: 'persistence_failed' })
    const session = await pool.query(
      'SELECT processing_status, consult_id FROM triage_sessions WHERE id = $1',
      [triageSessionId],
    )
    expect(session.rows[0]).toEqual({
      processing_status: 'pending',
      consult_id: null,
    })
    await pool.query('DROP TRIGGER reject_synthetic_consult_trigger ON neurology_consults')
  })

  it('rolls back the consult when a late session update trigger raises', async () => {
    const triageSessionId = randomUUID()
    await insertPendingSession(triageSessionId)
    await pool.query(`
      CREATE OR REPLACE FUNCTION reject_synthetic_session_completion()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.processing_status = 'complete' THEN
          RAISE EXCEPTION 'synthetic session completion failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER reject_synthetic_session_completion_trigger
      BEFORE UPDATE ON triage_sessions
      FOR EACH ROW EXECUTE FUNCTION reject_synthetic_session_completion();
    `)

    await expect(
      finalizeTriageAttempt(completionInput(triageSessionId)),
    ).resolves.toEqual({ ok: false, reason: 'persistence_failed' })
    const persisted = await pool.query(
      `SELECT session.processing_status,
              session.consult_id,
              count(consult.id)::integer AS consult_count
         FROM triage_sessions session
         LEFT JOIN neurology_consults consult
           ON consult.triage_session_id = session.id
        WHERE session.id = $1
        GROUP BY session.processing_status, session.consult_id`,
      [triageSessionId],
    )
    expect(persisted.rows).toEqual([
      {
        processing_status: 'pending',
        consult_id: null,
        consult_count: 0,
      },
    ])
    await pool.query(
      'DROP TRIGGER reject_synthetic_session_completion_trigger ON triage_sessions',
    )
  })

  it('keeps the explicit consult path canonical and does not insert another consult', async () => {
    const triageSessionId = randomUUID()
    const explicitConsultId = randomUUID()
    await pool.query(
      `INSERT INTO neurology_consults (
         id, tenant_id, patient_id, status, referral_text
       ) VALUES ($1, $2, $3, 'triage_pending', 'Synthetic explicit referral.')`,
      [explicitConsultId, tenantId, patientId],
    )
    await insertPendingSession(triageSessionId, explicitConsultId)
    const input = completionInput(triageSessionId)
    input.systemConsult = undefined
    input.explicitConsult = {
      id: explicitConsultId,
      expectedPatientId: patientId,
      chiefComplaint: 'Synthetic explicit complaint.',
    }

    await expect(finalizeTriageAttempt(input)).resolves.toMatchObject({
      ok: true,
      consultId: explicitConsultId,
    })
    const count = await pool.query(
      'SELECT count(*)::integer AS count FROM neurology_consults',
    )
    expect(count.rows[0]?.count).toBe(1)
  })
})
