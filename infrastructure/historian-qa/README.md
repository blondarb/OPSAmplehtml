# Historian MVP QA

This directory defines a short-lived, synthetic-only environment for proving
the patient Historian path without reusing production data, database compute,
Cognito, relay compute, or worker queues.

## Hard boundaries

- No PHI or real patient data. The only seed is clearly labeled synthetic.
- The database is a new encrypted PostgreSQL instance. The committed bootstrap
  is schema-only and contains no row-data sections or top-level data statements.
- Runtime secret values remain in Secrets Manager and are not build variables,
  artifacts, logs, or source files.
- The public database ingress exception covers current us-east-2 AWS ranges and
  is acceptable only for this bounded synthetic slice. Real-patient testing
  requires a private-VPC design.
- `DeleteAfter=2026-08-29` is an inventory tag, not an automatic delete. The
  owner must explicitly disable and delete the QA resources by that date.

## Provisioning order

1. Review and execute the Add-only `foundation.yaml` change set.
2. Package only `bootstrap-schema.sql`, `seed.sql`, `verify.sql`, and migrations 059-064 for
   the temporary `database-init.yaml` project.
3. Run the initializer once. It restores with `ON_ERROR_STOP=1`, creates a
   message-suppressed synthetic Cognito user, and verifies one synthetic tenant,
   patient, consult, and clinician membership.
4. After either PASS or failure, delete the exact initializer source object,
   then delete the initializer stack.
5. Create the Add-only `relay.yaml` support stack in us-east-1, upload an
   encrypted archive from the exact Git commit, and build its immutable relay
   image. The archive must include `source-commit.txt`; its content and the
   uploaded hash must match the stack's exact 40-character `SourceCommit`
   parameter. Delete the exact source object after PASS or failure. Wait for
   ECR scanning and require zero HIGH or CRITICAL findings.
6. Create the ECS Express Gateway service from that image digest with the QA
   relay secret, exact QA origin, continuation enabled, the turn/evidence gate
   enabled (`NOVA_HISTORIAN_TURN_GATE_V1=true`), Transcribe disabled, one task
   minimum/maximum, and `/healthz` health checks.
7. Deploy the isolated worker and disabled/manual Amplify branch.
   Keep `HISTORIAN_ADAPTIVE_INTERVIEW_V1=true` for the established adaptive
   controls, then enable `HISTORIAN_DIAGNOSTIC_DEPTH_V1=true` on that QA branch
   only after migration 064 and the report-first worker are live. The relay
   must already run `NOVA_HISTORIAN_TURN_GATE_V1=true`; reuse of a previously
   accepted relay artifact is permitted only when its executable source,
   dependencies, and build configuration are unchanged. Keep the older
   `HISTORIAN_TURN_EVIDENCE_CONTROLLER_V1` available only as the v2 fallback.
   Never enable an adaptive application flag against a relay that lacks the gate.
8. Run negative authorization tests before any synthetic interview.

### Upgrading the existing QA database

Do not rerun `database-init.yaml` against an already initialized QA database;
its schema bootstrap is intentionally a one-time restore. Use the ephemeral
`database-migrate.yaml` project for the latest numbered migration. Bind its host, port, database,
and secret ARN directly to the current foundation outputs; bind `SourceCommit`
to the exact archive commit and independently calculate both required SQL
SHA-256 values before creating the stack. Upload only `source-commit.txt`,
the exact migration SQL named in that template, and
`infrastructure/historian-qa/verify.sql`. The build applies and verifies both
files in one transaction with `ON_ERROR_STOP=1`. After PASS or failure, delete
the exact source object before deleting the ephemeral stack.

## Automated authenticated acceptance

`acceptance.yaml` is an ephemeral CodeBuild runner for the fixed synthetic QA
fixture. It receives the existing machine username and password directly from
Secrets Manager, authenticates to the dedicated QA Cognito client, and never
prints credentials, Cognito tokens, invitation tokens, browser grants, patient
context, transcript text, or differential content. Its logs contain only named
PASS gates or a fixed failure code and HTTP status.

The runner checks unauthenticated physician-report denial, clinician invitation
creation, production-origin rejection, wrong-DOB rejection, correct-DOB grant
cookie policy, non-diagnostic patient context, exact v4 Nova session binding,
server-attested depth review, transactional save and replay, report-first durable
worker completion, citation-grounded clinician-report visibility, and a
physician-only differential allowed by the server-derived sufficiency gate. The
final save uses a fixed 12-turn comprehensive synthetic transcript and
deliberately supplies empty client coverage so the deployed save boundary must
derive it from the attested review. This proves deployed reviewer, attestation,
persistence, report-first worker, and physician-surface plumbing—not a natural
audible interview, Claude conductor timing, Nova rollover, diagnostic accuracy,
or clinical validity.

Create it from an exact commit archive containing `source-commit.txt`, run it
once, then delete the exact source object and the stack after PASS or failure.
Do not retain the project as a standing credentialed test surface.

## Passwordless synthetic patient link

`temporary-link.yaml` issues one QA-only patient invitation without a person
retrieving or resetting the machine password. Its CodeBuild project receives
the existing QA Cognito and database credentials directly from the exact
Secrets Manager ARNs, creates the invitation through the authenticated app,
and transactionally extends only that pending synthetic invitation to exactly
82 hours. The normal production invitation default remains 48 hours.

The bearer link and fixed synthetic DOB are written once to the issuer stack's
exact encrypted Secrets Manager output; neither appears in the build log,
archive, source, or ordinary CloudFormation outputs. Retrieve the secret value
once, delete the exact source object, then delete the issuer stack and verify
that its output secret is gone. The invitation is one-time: after DOB
verification it becomes an HttpOnly four-hour browser grant. It does not grant
physician-dashboard access and must never be used with a real patient.

## Teardown checkpoint

Immediately after acceptance or temporary-link issuance: delete the exact
ephemeral source object and runner stack, including its encrypted output. No later
than 2026-08-29: disable the Amplify branch, delete the exact ECS Express Gateway
service and wait for its deletion, disable the worker schedule, delete the QA
stacks/database/user pool and Secrets Manager secrets, explicitly delete
retained worker queues, and verify that the QA URL and resource inventory are
empty. Delete the relay support stack only after the Express service is gone.
Production resources are not teardown targets.
