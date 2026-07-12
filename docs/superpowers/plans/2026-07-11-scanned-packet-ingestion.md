# Mayo-Scale Scanned-Packet Ingestion Implementation Plan

> **For agentic workers:** Use test-driven development task by task. Do not
> integrate the shared extract route or deploy this stack in this slice.

**Goal:** Build a code-only foundation for direct encrypted multipart upload and
asynchronous Textract/SNS/SQS OCR that preserves every page and fails closed on
unproved integrity or coverage.

**Architecture:** An isolated coordinator creates and completes checksum-bound
S3 uploads, validates the exact object, then starts idempotent asynchronous
Textract only after an injected server-side inspector independently proves the
page count on the exact versioned source. A strict raw-notification parser and
SQS worker retrieve all Textract
pages, assemble an immutable page manifest, and conditionally persist it to
encrypted S3. The SAM stack supplies the private encrypted storage and
completion channel. S3-only state remains non-production until tenant/auth
control-plane persistence is integrated.

**Tech stack:** TypeScript, AWS SDK v3, Lambda/SQS/SNS/S3/Textract/KMS, AWS SAM,
Vitest.

**Source design:**
`docs/superpowers/specs/2026-07-11-scanned-packet-ingestion-design.md`

---

## Task 1: Pure limits, names, upload, and page-manifest contracts

**Files:**
- Create: `src/lib/triage/scannedPacketIngestion.ts`
- Create: `tests/triage/scannedPacketIngestion.test.ts`

- [x] Write failing tests for exact 500,000,000-byte/3,000-page bounds,
  PDF/TIFF-only media types, opaque UUID keys, fixed 8 MiB consecutive part
  plans, strict completion parts, PDF/TIFF magic bytes, and no filename/tenant
  metadata.
- [x] Verify RED because the module is absent.
- [x] Implement the smallest pure contracts and validation needed to pass.
- [x] Write failing Textract assembly tests for pagination status/metadata,
  exactly one PAGE block per ordinal, duplicate/missing/out-of-range pages,
  LINE ordering/confidence, preserved blank pages, all-blank rejection, and
  deterministic page/packet digests.
- [x] Verify RED, implement strict manifest assembly, and verify GREEN.

## Task 2: Strict raw Textract completion message

**Files:**
- Create: `src/workers/triageScannedPacketMessage.ts`
- Create: `tests/triage/scannedPacketMessage.test.ts`

- [x] Write failing tests for the exact six-field AWS payload, valid statuses,
  `StartDocumentTextDetection` API binding, UUID JobTag, opaque source key,
  message-size bound, and rejection of SNS wrappers, unknown fields, note text, unsafe
  keys, malformed JSON, or oversize messages.
- [x] Verify RED, implement a sanitized parser, and verify GREEN.

## Task 3: AWS multipart and Textract coordinator

**Files:**
- Create: `src/lib/triage/scannedPacketAws.ts`
- Create: `tests/triage/scannedPacketAws.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [x] Add AWS SDK v3 S3, Textract, and S3 presigner packages with pnpm while
  preserving all existing dependency edits.
- [x] Write failing injected-client tests for SSE-KMS/SHA-256 multipart create,
  checksum-bound presigned part commands, exact complete call, fail-closed
  rejection of unpinned already-complete recovery, HeadObject invariants,
  ranged magic-byte read,
  exact derived composite checksum, no unversioned recovery, trusted page-count
  inspection, versioned/idempotent Textract start, encrypted OutputConfig, and
  sanitized failure codes.
- [x] Verify RED, implement the coordinator/adapter without route coupling, and
  verify GREEN.

## Task 4: Completion worker core and runtime

**Files:**
- Create: `src/workers/triageScannedPacketWorkerCore.ts`
- Create: `src/workers/triageScannedPacketWorker.ts`
- Create: `tests/triage/scannedPacketWorkerCore.test.ts`
- Create: `tests/triage/scannedPacketWorker.test.ts`

- [x] Write failing worker-core tests for raw message validation, strict source
  binding, successful full pagination, repeated token rejection, no fetch on
  failed/partial notifications, immutable/idempotent manifest writes, conflict
  failure/DLQ behavior, batch partial failures, and sanitized logging.
- [x] Verify RED, implement with injected dependencies, and verify GREEN.
- [x] Write and pass a runtime smoke test proving environment validation and
  AWS clients are wired without making network calls.

## Task 5: Isolated SAM foundation

**Files:**
- Create: `infrastructure/triage-ingestion/template.yaml`
- Create: `infrastructure/triage-ingestion/README.md`
- Create: `tests/triage/scannedPacketTemplate.test.ts`

- [x] Write a failing structural template test requiring S3 public blocks,
  BucketOwnerEnforced, versioning, SSE-KMS, TLS-only policies, incomplete-upload
  cleanup, encrypted SNS/SQS/DLQ, raw subscription, source-limited queue policy,
  SNS-delivery DLQ, constrained Textract publish role, least-privilege Lambda
  IAM, partial-batch response, retained logs, DLQ/age/failure alarms, and
  outputs needed for later control-plane integration.
- [x] Verify RED, implement the isolated SAM template/readme, and verify GREEN.
- [x] Run `sam validate --lint` if the local SAM tool is available; otherwise
  record the missing validation tool and rely on parser/structural tests.

## Task 6: Verification and adversarial review

- [x] Run all six focused scanned-packet test files together.
- [x] Run the full `tests/triage` suite.
- [x] Run `npx tsc --noEmit` and focused ESLint.
- [x] Run `git diff --check` and inspect the exact touched-file list.
- [x] Confirm fixtures are synthetic, no credentials/PHI are present, no AWS
  mutation/deploy occurred, and the non-production tenant/auth gate is explicit.
- [x] Adversarially review retry/idempotency, pagination/page coverage,
  encryption/public-access, message/log content, and any remaining production
  blockers before handoff.
