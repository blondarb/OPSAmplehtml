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
2. Package only `bootstrap-schema.sql`, `seed.sql`, `verify.sql`, and migrations 059-060 for
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
   relay secret, exact QA origin, continuation enabled, Transcribe disabled,
   one task minimum/maximum, and `/healthz` health checks.
7. Deploy the isolated worker and disabled/manual Amplify branch.
8. Run negative authorization tests before any synthetic interview.

## Teardown checkpoint

No later than 2026-08-29: disable the Amplify branch, delete the exact ECS
Express Gateway service and wait for its deletion, disable the worker schedule,
delete the QA stacks/database/user pool and Secrets Manager secrets, explicitly
delete retained worker queues, and verify that the QA URL and resource
inventory are empty. Delete the relay support stack only after the Express
service is gone. Production resources are not teardown targets.
