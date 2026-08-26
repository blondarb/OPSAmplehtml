import { NextResponse } from 'next/server'
import { getTenantServer } from '@/lib/tenant'
import { from } from '@/lib/db-query'
import { linkHistorianToConsult } from '@/lib/consult/pipeline'
import { notifyHistorianRedFlag } from '@/lib/notifications'
import { validateTranscript } from '@/lib/historian/transcriptIntegrity'
import { runFinalDifferential } from '@/lib/historian/eval/finalDifferential'
import { runThoroughnessJudge } from '@/lib/historian/eval/thoroughnessJudge'
import { runIndependentDdxAndAgreement } from '@/lib/historian/eval/independentDdx'
import type { HistorianStructuredOutput, HistorianTranscriptEntry } from '@/lib/historianTypes'
import { resolveHistorianPatientGrant } from '@/lib/historian/invitationStore'
import { HISTORIAN_GRANT_COOKIE, readCookieValue } from '@/lib/historian/invitationTokens'
import { saveInvitedHistorianSession } from '@/lib/historian/invitedSave'
import {
  completionStatusForTermination,
  parseHistorianTerminationReason,
  terminationMatchesCompletionStatus,
} from '@/lib/historian/terminationPolicy'
import {
  derivePatientEvidenceStructuredCoverage,
  patientEvidenceCompletion,
  validatePatientEvidenceState,
  type PatientEvidenceState,
} from '@/lib/historian/patientEvidenceController'
import {
  deriveLiveReviewStructuredCoverage,
  liveInterviewReviewCompletion,
  type LiveInterviewReviewArtifact,
} from '@/lib/historian/liveReviewContract'
import { verifyLiveInterviewReviewArtifact } from '@/lib/historian/liveReviewAttestation'
import {
  completionWithMedicationUncertainty,
  confirmedMedicationSummary,
  medicationReconciliationClosed,
  medicationReconciliationHasUncertainty,
  medicationReconciliationMatchesReview,
  medicationReconciliationTranscriptIsValid,
  medicationReconciliationUnresolvedCount,
  parseMedicationReconciliationState,
} from '@/lib/historian/medicationReconciliation'
import { adaptiveCompletionTranscriptIsValid } from '@/lib/historian/adaptiveQuestionContract'
import {
  authorizeClinicalAccess,
  clinicalAccessDeniedMessage,
} from '@/lib/auth/clinicalAccess'

// ── Auth boundary (binding — read before adding a new handler here) ─────────
// POST = patient-portal pattern, intentionally UNAUTHENTICATED (same bar as
// /api/ai/historian/session and /transcript-flush — a patient mid-interview
// has no Cognito session; those routes are token/session-id-scoped instead,
// not physician-authed). Never add a getUser() check to POST without first
// re-auditing every patient-facing caller (NeurologicHistorian.tsx,
// EmbeddedHistorian.tsx) for a login requirement that doesn't exist today.
//
// GET = clinical-team only, Cognito + active tenant membership. It returns patient names,
// MRNs, full interview transcripts, and (Historian Validation Suite Task 4)
// both the pipeline and independent differentials — never acceptable
// unauthenticated. Confirmed callers (2026-07-21 review fix): ClinicalNote.tsx
// (mounted only via PhysicianPageWrapper/EhrPageWrapper — the /physician and
// /ehr clinician surfaces) and home/HistorianSessionsList.tsx (mounted only
// via PhysicianHome.tsx). Both are physician-authed pages; the route-level
// check below is the real security boundary regardless (client-side page
// gating is never sufficient on its own — a direct API call bypasses it).

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Comprehensive remote-patient path. The HttpOnly browser grant binds the
    // session to the clinician-created invitation; no tenant/patient/consult,
    // provider, mode, prompt, referral, or session identity is accepted from
    // the browser. A present-but-invalid grant fails closed and never falls
    // through to the legacy public demo save path below.
    const invitationBinding = await resolveHistorianPatientGrant(request)
    if (readCookieValue(request, HISTORIAN_GRANT_COOKIE) && !invitationBinding) {
      return NextResponse.json(
        { error: 'This interview session is invalid or has expired.' },
        { status: 401 },
      )
    }
    if (invitationBinding) {
      const result = await saveInvitedHistorianSession(invitationBinding, body)
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status })
      }

      return NextResponse.json({
        session: { id: result.sessionId, status: 'completed' },
        consult_id: result.consultId,
        evaluation_status: result.evaluationStatus,
        replayed: result.replayed,
      })
    }

    const tenant = body.tenant_id || getTenantServer()


    const requestedCompletionStatus: 'complete' | 'ended_early' | null =
      body.interview_completion_status === 'complete' ||
      body.interview_completion_status === 'ended_early'
        ? body.interview_completion_status
        : null
    const terminationReason = parseHistorianTerminationReason(body.interview_termination_reason)
    if (body.interview_termination_reason != null && !terminationReason) {
      return NextResponse.json({ error: 'Invalid interview termination reason.' }, { status: 400 })
    }
    if (
      terminationReason &&
      requestedCompletionStatus &&
      !terminationMatchesCompletionStatus(terminationReason, requestedCompletionStatus)
    ) {
      return NextResponse.json(
        { error: 'Interview completion status conflicts with its termination reason.' },
        { status: 400 },
      )
    }
    if (
      terminationReason &&
      (body.safety_escalated === true) !== (terminationReason === 'safety_escalated')
    ) {
      return NextResponse.json(
        { error: 'Safety escalation status conflicts with its termination reason.' },
        { status: 400 },
      )
    }
    if (
      terminationReason === 'hard_stop' &&
      !(typeof body.question_count === 'number' && body.question_count >= 60)
    ) {
      return NextResponse.json({ error: 'Hard-stop reason is invalid before exchange 60.' }, { status: 400 })
    }
    const completionStatus = terminationReason
      ? completionStatusForTermination(terminationReason)
      : requestedCompletionStatus

    let structuredOutput: HistorianStructuredOutput =
      body.structured_output && typeof body.structured_output === 'object' && !Array.isArray(body.structured_output)
        ? body.structured_output
        : {}
    const promptVersion = structuredOutput.interview_prompt_version
    const requestedSessionId: string | undefined =
      typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : undefined
    if (promptVersion === 'comprehensive-v4') {
      return NextResponse.json(
        { error: 'Comprehensive v4 is available only through a clinician-created invitation.' },
        { status: 409 },
      )
    }
    if (promptVersion === 'comprehensive-v3') {
      if (!terminationReason) {
        return NextResponse.json(
          { error: 'Comprehensive v3 requires an explicit termination reason.' },
          { status: 400 },
        )
      }
      const transcript: HistorianTranscriptEntry[] = Array.isArray(body.transcript)
        ? body.transcript
        : []
      const terminalPartial =
        terminationReason !== 'coverage_complete' &&
        terminationReason !== 'complete_with_uncertainty'
      if (!requestedSessionId) {
        return NextResponse.json(
          { error: 'Comprehensive v3 requires a server-minted session identity.' },
          { status: 409 },
        )
      }
      let reviewArtifact: LiveInterviewReviewArtifact | null = null
      if (structuredOutput.live_review_v1 != null) {
        try {
          reviewArtifact = await verifyLiveInterviewReviewArtifact(
            requestedSessionId,
            transcript,
            structuredOutput.live_review_v1,
          )
        } catch {
          return NextResponse.json(
            { error: 'The independent live history review is incomplete or inconsistent.' },
            { status: 409 },
          )
        }
      }
      if (!terminalPartial && !reviewArtifact) {
        return NextResponse.json(
          { error: 'Normal completion requires a current independent live history review.' },
          { status: 409 },
        )
      }
      if (reviewArtifact?.review.version !== 1) {
        return NextResponse.json(
          { error: 'The independent live history review version does not match Comprehensive v3.' },
          { status: 409 },
        )
      }
      let medicationState = null
      if (structuredOutput.medication_reconciliation_v1 != null) {
        try {
          medicationState = parseMedicationReconciliationState(
            structuredOutput.medication_reconciliation_v1,
            transcript,
          )
        } catch {
          return NextResponse.json(
            { error: 'Medication reconciliation is incomplete or inconsistent.' },
            { status: 409 },
          )
        }
      }
      const reviewCompletion = liveInterviewReviewCompletion(reviewArtifact?.review)
      const completion = medicationState
        ? completionWithMedicationUncertainty(reviewCompletion, medicationState)
        : reviewCompletion
      if (!terminalPartial && completion !== terminationReason) {
        return NextResponse.json(
          { error: 'The completion reason does not match the independent live history review and medication reconciliation.' },
          { status: 409 },
        )
      }
      if (
        !terminalPartial &&
        (
          !medicationState ||
          !medicationReconciliationClosed(medicationState) ||
          !medicationReconciliationTranscriptIsValid(medicationState, transcript) ||
          !medicationReconciliationMatchesReview(
            medicationState,
            reviewArtifact?.review.medications ?? [],
          ) ||
          !adaptiveCompletionTranscriptIsValid(transcript)
        )
      ) {
        return NextResponse.json(
          {
            error:
              'Normal completion requires the introduction, medication reconciliation, and final patient check.',
          },
          { status: 409 },
        )
      }
      structuredOutput = {
        interview_mode: 'comprehensive',
        interview_prompt_version: 'comprehensive-v3',
        current_medications: medicationState
          ? confirmedMedicationSummary(medicationState) || undefined
          : undefined,
        medication_reconciliation_v1: medicationState ?? undefined,
        medication_reconciliation_has_uncertainty: medicationState
          ? medicationReconciliationHasUncertainty(medicationState)
          : false,
        medication_reconciliation_unresolved_count: medicationState
          ? medicationReconciliationUnresolvedCount(medicationState)
          : 0,
        ...(reviewArtifact
          ? {
              live_review_v1: reviewArtifact,
              history_coverage: deriveLiveReviewStructuredCoverage(reviewArtifact.review),
            }
          : {}),
      }
    } else if (promptVersion === 'comprehensive-v2') {
      if (!terminationReason) {
        return NextResponse.json(
          { error: 'Comprehensive v2 requires an explicit termination reason.' },
          { status: 400 },
        )
      }
      const transcript: HistorianTranscriptEntry[] = Array.isArray(body.transcript)
        ? body.transcript
        : []
      const evidence = structuredOutput.history_evidence_v1
      const evidenceValidation = validatePatientEvidenceState(evidence, transcript)
      if (!evidenceValidation.valid) {
        return NextResponse.json(
          { error: 'The application-owned history evidence is incomplete or inconsistent.' },
          { status: 409 },
        )
      }
      const completion = patientEvidenceCompletion(evidence as PatientEvidenceState)
      if (
        (terminationReason === 'coverage_complete' || terminationReason === 'complete_with_uncertainty') &&
        terminationReason !== completion
      ) {
        return NextResponse.json(
          { error: 'The completion reason does not match the transcript-bound history evidence.' },
          { status: 409 },
        )
      }
      structuredOutput = {
        ...structuredOutput,
        interview_mode: 'comprehensive',
        interview_prompt_version: 'comprehensive-v2',
        history_coverage: derivePatientEvidenceStructuredCoverage(evidence as PatientEvidenceState),
      }
    } else if (terminationReason === 'complete_with_uncertainty') {
      return NextResponse.json(
        { error: 'Uncertain completion requires a validated application-owned review contract.' },
        { status: 409 },
      )
    }

    // Comprehensive v3 does not trust Nova's free-form narrative as a
    // clinician report. Its structured fields and transcript-bound ledgers
    // are persisted; a separate post-session clinician report owns synthesis.
    const narrativeSummary =
      promptVersion === 'comprehensive-v3'
        ? null
        : typeof body.narrative_summary === 'string' && body.narrative_summary.trim()
          ? body.narrative_summary.trim()
          : null

    // The v3 voice model's clinical prose is not a report trust boundary.
    // Red flags persist only from the application-owned safety path; ordinary
    // model-authored flags are suppressed along with the other free text.
    const redFlagsForSave = promptVersion === 'comprehensive-v3'
      ? (body.safety_escalated === true
          ? [{
              flag: 'Patient-stated active safety trigger',
              severity: 'high',
              context: 'Application safety protocol activated during the interview.',
            }]
          : [])
      : body.red_flags

    // Pre-stringify jsonb array/object fields. The shared query builder
    // auto-stringifies plain objects but passes arrays through raw (for
    // text[] compat), which breaks jsonb inserts of transcript/red_flags
    // — same root cause as the triage_sessions fix (2d1e445).
    const toJSON = (v: unknown) => (v != null ? JSON.stringify(v) : null)

    // Historian Validation Suite Task 1 (durable transcript): /session now
    // mints historian_sessions.id up front and returns it as `sessionId` so
    // the client can flush transcript events (keyed by that id) throughout
    // the interview, well before this row exists. When the caller supplies
    // it, use it as the explicit primary key instead of leaving it to the
    // column's `DEFAULT gen_random_uuid()` — same UUID v4 format either
    // way. Omitted entirely (not merely undefined) when absent, so older/
    // other callers that don't send it keep getting the DB-generated id
    // exactly as before this change.
    const insertPayload: Record<string, unknown> = {
      tenant_id: tenant,
      patient_id: body.patient_id || null,
      session_type: body.session_type || 'new_patient',
      patient_name: body.patient_name || '',
      referral_reason: body.referral_reason || null,
      structured_output: toJSON(structuredOutput),
      narrative_summary: narrativeSummary,
      transcript: toJSON(body.transcript),
      red_flags: toJSON(redFlagsForSave),
      safety_escalated: body.safety_escalated || false,
      duration_seconds: body.duration_seconds || 0,
      question_count: body.question_count || 0,
      status: body.status || 'completed',
      interview_completion_status: completionStatus,
      interview_termination_reason: terminationReason,
      reviewed: false,
      imported_to_note: false,
    }
    if (promptVersion === 'comprehensive-v2' || promptVersion === 'comprehensive-v3') {
      insertPayload.interview_mode = 'comprehensive'
      insertPayload.interview_prompt_version = promptVersion
    }
    const sessionId = requestedSessionId
    if (sessionId) {
      insertPayload.id = sessionId
    }

    const { data, error } = await from('historian_sessions')
      .insert(insertPayload)
      .select()
      .single()

    if (error) {
      console.error('Error saving historian session:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // ── Historian Validation Suite Task 2+3+4: post-session eval pipeline ──
    // Fire-and-forget — separate, post-session Bedrock evaluations of the
    // COMPLETE transcript (the historian agent itself never diagnoses; all
    // are independent QA/audit passes, physician/QA-facing only). Never
    // awaited, so none can delay or fail this response. Gated by
    // HISTORIAN_EVAL_AUTORUN: unset defaults to enabled; the literal string
    // 'false' disables all three (e.g. for hermetic test runs that don't
    // mock Bedrock — see tests/historian-eval/saveRouteIntegrityCheck.test.ts).
    //
    // Task 3's thoroughness judge runs AFTER Task 2's final differential,
    // and Task 4's independent-ddx-plus-agreement pass runs AFTER Task 3's
    // judge — each stage chained off the SAME promise (via .then(), after
    // the previous stage's own .catch() has already recovered it) rather
    // than nested inside one async function, so each earlier stage's
    // existing error-handling/test coverage is untouched — that promise
    // still resolves (never rejects) regardless of whether the previous
    // stage itself succeeded, so the next stage always gets its turn. Each
    // stage owns its own .catch(), so a later-stage failure can never be
    // misattributed to (or suppressed by) an earlier one. runFinalDifferential,
    // runThoroughnessJudge, and runIndependentDdxAndAgreement all already
    // catch everything internally; the .catch() calls here are
    // defense-in-depth backstops only. Task 4's own internals additionally
    // re-fetch historian_sessions.final_differential (rather than trust an
    // in-memory value from the Task 2 stage above) so agreement runs only
    // when that column is actually populated — skipping quietly otherwise.
    const permitsLegacyDifferential = completionStatus !== 'ended_early'
    if (data && permitsLegacyDifferential && process.env.HISTORIAN_EVAL_AUTORUN !== 'false') {
      const transcriptForEval: HistorianTranscriptEntry[] = Array.isArray(body.transcript)
        ? body.transcript
        : []
      const chiefComplaintForEval: string | undefined =
        structuredOutput.chief_complaint || body.referral_reason || undefined
      const structuredOutputForEval = structuredOutput
      const narrativeSummaryForEval: string | undefined = narrativeSummary ?? undefined

      const finalDifferentialSettled = runFinalDifferential(
        data.id,
        transcriptForEval,
        chiefComplaintForEval,
      ).catch((err) => {
        console.error('[historian/save] final differential eval error (non-fatal):', err)
      })

      const thoroughnessSettled = finalDifferentialSettled
        .then(() =>
          runThoroughnessJudge(data.id, transcriptForEval, {
            chiefComplaint: chiefComplaintForEval,
            structuredOutput: structuredOutputForEval,
            narrativeSummary: narrativeSummaryForEval,
            // SCOPE (Task 3 review): narrative_summary is the only report
            // that exists at save time — other physician/QA-facing reports
            // (the patient-report tab, a future printed chart note, Task
            // 2's FinalDifferential.summary) are generated later, at VIEW
            // time, not here. Task 5's batch harness is the intended
            // extension point for passing additional reports into the
            // fidelity screen; this route deliberately stays narrow.
            reports: narrativeSummaryForEval ? { narrative_summary: narrativeSummaryForEval } : undefined,
          }),
        )
        .catch((err) => {
          console.error('[historian/save] thoroughness judge eval error (non-fatal):', err)
        })

      void thoroughnessSettled
        .then(() =>
          runIndependentDdxAndAgreement(data.id, transcriptForEval, chiefComplaintForEval),
        )
        .catch((err) => {
          console.error('[historian/save] independent ddx / agreement eval error (non-fatal):', err)
        })
    }

    // Phase 1 pipeline: link the saved historian session back to the consult
    const consultId: string | undefined = body.consult_id
    if (consultId && data) {
      try {
        await linkHistorianToConsult(
          consultId,
          data.id,
          narrativeSummary || '',
          { ...structuredOutput },
          redFlagsForSave || [],
          body.safety_escalated || false,
          completionStatus,
          terminationReason,
        )
      } catch (pipelineErr) {
        // Non-fatal — historian session is saved regardless
        console.error('[historian/save] consult linkage error (non-fatal):', pipelineErr)
      }
    }

    // ── Notification: alert staff if red flags were detected ──────────
    try {
      const redFlags = redFlagsForSave || []
      if (redFlags.length > 0 && data) {
        await notifyHistorianRedFlag(
          data.id,
          body.patient_name || 'Unknown patient',
          redFlags,
          body.patient_id || null,
        )
      }
    } catch (notifErr) {
      console.error('[historian/save] Notification error (non-fatal):', notifErr)
    }

    // ── Integrity cross-check (Task 1, durable transcript) ─────────────
    // Non-destructive: this never alters the transcript/session row just
    // written above, it only logs structural findings for later review.
    // Both the validation issues and the mismatch log line are built from
    // counts/indices/roles only — patient utterance text is never logged
    // server-side, in this block or anywhere else.
    //
    // The client now performs a final flushTranscript() before calling
    // /save (useRealtimeSession.ts endSession), so by the time this runs
    // the durable event log should already hold every entry in
    // `transcript` — a mismatch here is a genuine signal, not noise from
    // trailing not-yet-flushed entries.
    try {
      const transcript = Array.isArray(body.transcript) ? body.transcript : []
      const { valid, issues } = validateTranscript(transcript)
      if (!valid) {
        console.warn('[historian/save] transcript integrity issues for session', data?.id, issues)
      }

      if (sessionId) {
        try {
          const { getPool } = await import('@/lib/db')
          const pool = await getPool()
          const { rows } = await pool.query(
            'SELECT COUNT(*)::int AS count FROM historian_transcript_events WHERE session_id = $1',
            [sessionId],
          )
          const eventCount = rows[0]?.count ?? 0
          if (eventCount !== transcript.length) {
            console.warn(
              '[historian/save] transcript event-count mismatch for session',
              sessionId,
              '— events:', eventCount,
              'transcript entries:', transcript.length,
            )
          }
        } catch (eventCountErr: unknown) {
          const pgCode = (eventCountErr as { code?: string } | undefined)?.code
          if (pgCode === '42P01') {
            // historian_transcript_events doesn't exist yet — expected
            // and benign until the rollout task applies migration 056.
            // Quiet informational line only; this is NOT a DB failure and
            // must not read as one in logs.
            console.info(
              '[historian/save] transcript-events table not present yet (migration 056 not applied) — skipping event-count cross-check',
            )
          } else {
            // Any other DB error here IS worth surfacing loudly — re-throw
            // so the outer catch below logs it at error level.
            throw eventCountErr
          }
        }
      }
    } catch (integrityErr) {
      console.error('[historian/save] integrity cross-check error (non-fatal):', integrityErr)
    }

    return NextResponse.json({ session: data, consult_id: consultId || null })
  } catch (error: any) {
    // Detailed message stays server-side only — the raw Postgres error can
    // leak table/column/constraint detail. Client gets a generic body.
    console.error('Historian save API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const access = await authorizeClinicalAccess({
      action: 'historian.report_read',
      allowedRoles: ['viewer', 'clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: clinicalAccessDeniedMessage(access.reason), reason: access.reason },
        { status: access.status },
      )
    }

    const { searchParams } = new URL(request.url)
    // Never honor a caller-selected tenant for a PHI-bearing report. The
    // active clinical membership is the tenant authority.
    const tenant = access.context.tenantId
    const patientId = searchParams.get('patient_id')

    const { getPool } = await import('@/lib/db')
    const pool = await getPool()

    const conditions = ['hs."tenant_id" = $1']
    const values: unknown[] = [tenant]

    if (patientId) {
      conditions.push(`hs."patient_id" = $2`)
      values.push(patientId)
    }

    const baseSql = `
      SELECT
        hs.*,
        CASE WHEN p."id" IS NOT NULL THEN json_build_object(
          'id', p."id", 'first_name', p."first_name", 'last_name', p."last_name", 'mrn', p."mrn"
        ) ELSE NULL END AS patient
      FROM "historian_sessions" hs
      LEFT JOIN "patients" p ON p."id" = hs."patient_id"
      WHERE ${conditions.join(' AND ')}
      ORDER BY hs."created_at" DESC
      LIMIT 10
    `

    // Historian Validation Suite Task 4: enrich each session with its latest
    // independent_ddx/agreement evaluator rows (historian_evaluations —
    // migration 058), same wiring pattern as final_differential (a plain
    // column on historian_sessions, always present via `hs.*`). Unlike that
    // column, historian_evaluations is a separate table, so a plain
    // `SELECT hs.*` can't pick this up for free — a LEFT JOIN LATERAL is
    // required, and unlike a missing COLUMN (a silent no-op under
    // `SELECT *`), a JOIN against a table that doesn't exist yet is a hard
    // SQL error. Try the enriched query first; if historian_evaluations
    // isn't there yet (migration 058 not applied — expected until the
    // rollout task applies it), fall back to the base query so the session
    // list keeps working exactly as it did before this change, with
    // independent_ddx/agreement simply absent (DdxComparisonCard renders
    // its own pending state for that, same as DifferentialCard for a
    // missing final_differential).
    const enrichedSql = `
      SELECT
        hs.*,
        CASE WHEN p."id" IS NOT NULL THEN json_build_object(
          'id', p."id", 'first_name', p."first_name", 'last_name', p."last_name", 'mrn', p."mrn"
        ) ELSE NULL END AS patient,
        ddx.result AS independent_ddx,
        agr.result AS agreement,
        job.status AS evaluation_status,
        job.attempt_count AS evaluation_attempt_count,
        job.last_error_code AS evaluation_error_code
      FROM "historian_sessions" hs
      LEFT JOIN "patients" p ON p."id" = hs."patient_id"
      LEFT JOIN historian_eval_jobs job
        ON job.session_id = hs.id AND job.tenant_id = hs.tenant_id
      LEFT JOIN LATERAL (
        SELECT result FROM historian_evaluations
        WHERE session_id = hs.id::text AND evaluator = 'independent_ddx'
        ORDER BY created_at DESC LIMIT 1
      ) ddx ON true
      LEFT JOIN LATERAL (
        SELECT result FROM historian_evaluations
        WHERE session_id = hs.id::text AND evaluator = 'agreement'
        ORDER BY created_at DESC LIMIT 1
      ) agr ON true
      WHERE ${conditions.join(' AND ')}
      ORDER BY hs."created_at" DESC
      LIMIT 10
    `

    // Explicit query for the migration-058-only state. Keep this as SQL rather
    // than rewriting `enrichedSql` with string replacement: whitespace or a
    // future SELECT change must not accidentally leave a dangling `job.*`
    // reference in the clinician report path.
    const legacyEnrichedSql = `
      SELECT
        hs.*,
        CASE WHEN p."id" IS NOT NULL THEN json_build_object(
          'id', p."id", 'first_name', p."first_name", 'last_name', p."last_name", 'mrn', p."mrn"
        ) ELSE NULL END AS patient,
        ddx.result AS independent_ddx,
        agr.result AS agreement
      FROM "historian_sessions" hs
      LEFT JOIN "patients" p ON p."id" = hs."patient_id"
      LEFT JOIN LATERAL (
        SELECT result FROM historian_evaluations
        WHERE session_id = hs.id::text AND evaluator = 'independent_ddx'
        ORDER BY created_at DESC LIMIT 1
      ) ddx ON true
      LEFT JOIN LATERAL (
        SELECT result FROM historian_evaluations
        WHERE session_id = hs.id::text AND evaluator = 'agreement'
        ORDER BY created_at DESC LIMIT 1
      ) agr ON true
      WHERE ${conditions.join(' AND ')}
      ORDER BY hs."created_at" DESC
      LIMIT 10
    `

    let rows: unknown[]
    try {
      ;({ rows } = await pool.query(enrichedSql, values))
    } catch (enrichErr: unknown) {
      const pgCode = (enrichErr as { code?: string } | undefined)?.code
      if (pgCode === '42P01') {
        console.info(
          '[historian/list] evaluator/job table not present yet — retrying with the legacy clinician query',
        )
        try {
          ;({ rows } = await pool.query(legacyEnrichedSql, values))
        } catch (legacyErr: unknown) {
          if ((legacyErr as { code?: string } | undefined)?.code !== '42P01') throw legacyErr
          console.info(
            '[historian/list] historian_evaluations table not present yet (migration 058 not applied) — falling back to the base session query',
          )
          ;({ rows } = await pool.query(baseSql, values))
        }
      } else {
        throw enrichErr
      }
    }

    // PHI-shaped response (patient names, MRNs, full transcripts, both
    // differentials) — no-store so a shared proxy/CDN/browser cache can
    // never retain it. GET only; POST's response carries no query-string-
    // cacheable GET semantics and is left untouched.
    return NextResponse.json(
      { sessions: rows || [] },
      { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } },
    )
  } catch (error: any) {
    console.error('Historian list API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch historian sessions' },
      { status: 500 },
    )
  }
}
