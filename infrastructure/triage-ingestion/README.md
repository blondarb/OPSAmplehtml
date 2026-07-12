# Scanned-Packet Ingestion Foundation

This stack is a **non-production foundation** for large PDF/TIFF neurology
referral packets. It creates private encrypted storage, a Textract completion
topic, a raw SNS-to-SQS delivery path, a DLQ, and the page-manifest completion
worker. It does not create an upload API and is not deployed by this work.

## Safety boundary

Do not connect this stack to the shared extract route until a durable database
record binds every opaque ingestion UUID to the authenticated tenant, authorized
uploader, upload-session UUID, S3 version/checksum, Textract job ID, lifecycle
state, result digest, and human-review state. S3 control bindings in this
foundation prevent accidental cross-job assembly, but S3 is not an
authorization database.

No original filename, tenant ID, patient/provider/facility identifier, or
clinical text belongs in an S3 key, object metadata, SNS/SQS body, alarm, or
application log. The bucket content and OCR manifests are PHI-capable and must
be governed accordingly even though repository tests use synthetic text only.

## Data flow

1. Future authenticated control-plane code creates an opaque ingestion UUID and
   upload-session UUID, then persists their tenant/auth binding before calling
   `createScannedPacketAwsCoordinator`.
2. The browser computes one SHA-256 checksum per fixed 8 MiB part. The
   coordinator creates an SSE-KMS composite-checksum multipart upload and
   returns short-lived checksum-bound `UploadPart` URLs.
3. Completion proves consecutive parts, exact size/type/session metadata,
   customer-managed KMS encryption, the exact composite derived from the
   persisted part checksums, object version, and PDF/TIFF magic bytes. It never
   recovers `NoSuchUpload` through an unversioned latest object.
4. A required injected server-side inspector independently counts pages on that
   exact versioned PDF/TIFF. The coordinator fails before Textract if the count
   cannot be proved. The coordinator then starts version-bound
   `StartDocumentTextDetection` with a
   deterministic idempotency token and encrypted S3 output, then writes the
   opaque job binding.
5. Textract sends its raw completion notification through encrypted SNS and
   SQS, with separate SNS-delivery and worker DLQs retained for 14 days. The
   Lambda retrieves every `GetDocumentTextDetection` result page,
   rejects partial/inconsistent coverage, and writes one immutable page manifest
   or text-free human-review outcome.
6. A blank/unreadable source page remains in the manifest and forces review. A
   readable page below the existing 0.50 OCR confidence floor also forces
   review. Missing/duplicate/out-of-range page ordinals, all-blank packets,
   trusted-source/Textract page-count disagreement, manifest-digest conflicts,
   or any integrity uncertainty never enter
   automated triage.

The application ceiling is exactly 500,000,000 bytes and 3,000 pages. An
optional client-declared page count is not trusted; disagreement with Textract
forces review.

## Required deployment inputs and key policy

`ClinicalDataKmsKeyArn` must be a customer-managed KMS key whose policy has
already been reviewed for the target account. At minimum, the future upload
coordinator, Textract output path, SNS, SQS, and completion worker need only the
specific KMS operations required by their calls. Do not substitute an AWS-owned
key or grant `kms:*`.

The key policy must explicitly permit the configured application roles and the
SNS/SQS service integrations to use the key with `kms:ViaService`,
`aws:SourceAccount`, and resource-context restrictions appropriate to the
deployed Region/topic/queues. Validate an encrypted end-to-end synthetic
notification before clinical release; a syntactically valid template cannot
prove an externally managed key policy.

Retention parameters are deliberate deployment decisions, not clinical/legal
defaults. Confirm source, Textract-output, result, review, versioned-object, and
backup retention with privacy/security/legal owners before deployment. The
template always aborts incomplete multipart uploads after one day.

The future upload coordinator role needs narrowly scoped access to:

- create, upload, complete, abort, head, range-read, and put the documented
  prefixes in the one packet bucket;
- start `StartDocumentTextDetection` with only the configured topic, role,
  output prefix, and KMS key;
- pass only the configured Textract publish role;
- use only the configured KMS key.

## Validation only

From the repository root:

```bash
npx vitest run tests/triage/scannedPacketIngestion.test.ts tests/triage/scannedPacketMessage.test.ts tests/triage/scannedPacketAws.test.ts tests/triage/scannedPacketWorkerCore.test.ts tests/triage/scannedPacketWorker.test.ts tests/triage/scannedPacketTemplate.test.ts
sam validate --lint --template-file infrastructure/triage-ingestion/template.yaml
sam build --template-file infrastructure/triage-ingestion/template.yaml --build-dir .aws-sam/triage-ingestion-build
```

Validation/build commands are local and read-only with respect to AWS. Do not
run `sam deploy` for this foundation.

## Production gates still open

- Tenant/auth control-plane schema and atomic state transitions.
- A version-pinned, server-side PDF/TIFF page-count inspector. The coordinator
  requires this dependency and fails closed without it; never promote a
  browser-declared count to trusted provenance.
- Authenticated initiate/presign/complete/status/result routes and authorization
  tests; the existing shared extract route is intentionally untouched.
- Browser streaming checksum/upload UI, retry/abort UX, and accessibility.
- Authenticated rolling part re-presign/ListParts resume for slow or interrupted
  connections; the short-lived initial URL set alone is not rural-site ready.
- Malware scanning/content-disarm policy before any downstream consumption.
- True large-packet orchestration/load evidence: a single 900-second completion
  Lambda may not be sufficient for the highest-block-density 3,000-page result.
  Production must load-test and, if necessary, fan out encrypted Textract S3
  output processing through durable Step Functions/queue work without weakening
  exact page-coverage proof.
- Reconciliation that consumes encrypted Textract `OutputConfig` objects before
  the Get API's seven-day result expiry and can recover orphaned notifications.
- Quota/concurrency sizing, alarm subscriptions/runbooks, DLQ replay controls,
  backup/restore, disaster recovery, CloudTrail/data-event review, and cost
  alarms.
- Synthetic adversarial OCR corpus and clinician review of low-confidence,
  handwriting, rotated, fax-degraded, mixed-language, password-protected, and
  malformed packets. Persist OCR model/handwriting/layout/rotation provenance;
  use a risk-sensitive second OCR/vision or human gate because one high
  confidence score cannot prove a faint red-flag line was not omitted. Add a
  verified-blank classifier so true fax separator pages do not collapse the
  review queue while unreadable pages still fail closed.
