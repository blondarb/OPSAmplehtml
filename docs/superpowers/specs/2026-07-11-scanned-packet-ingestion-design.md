# Mayo-Scale Scanned-Packet Ingestion Design

**Status:** Approved for isolated foundation implementation on 2026-07-11.

**Release status:** **Non-production foundation.** It must not be connected to a
patient-facing or clinician-facing upload route until a durable, tenant-bound,
authorization-bound control-plane record owns every ingestion ID, upload-
session/upload ID, part-checksum plan, source object version, Textract job ID,
and result manifest.

## Goal

Accept synthetic neurology referral packets from a short scan through a
Mayo-scale PDF/TIFF without buffering the file in Next.js, then produce a
page-preserving OCR manifest only when the source object's integrity and every
page ordinal can be proved against an independently derived source-page count.
Any uncertainty stops automated triage and routes
the packet to human review.

The service limits are fixed at 500 MB (decimal) and 3,000 pages. AWS documents
asynchronous Textract for multipage PDF/TIFF, a 500 MB asynchronous PDF limit,
and a 3,000-page PDF/TIFF limit. The code therefore sets the exact maximum to
500,000,000 bytes, not 500 MiB (524,288,000 bytes).

## Chosen architecture

1. An authenticated control plane (future route integration) creates a random
   ingestion UUID plus an independent upload-session UUID, persists both, and
   calls an isolated multipart coordinator. The S3 key is
   deterministic and opaque: `quarantine/{uuid}/source.pdf` or `.tiff`. The
   original filename, tenant, patient, provider, facility, and clinical content
   never appear in an object key, tag, metadata field, queue body, or log.
2. The browser calculates a SHA-256 checksum for every fixed 8 MiB part. The
   coordinator validates that exact checksum array, initiates an SSE-KMS
   multipart upload with SHA-256 composite checksums, and returns short-lived
   presigned `UploadPart` URLs. Every URL is bound to one part number and its
   declared checksum. S3 supports at most 10,000 parts and requires consecutive
   part numbers when additional checksums are used.
3. Completion accepts only the exact expected part sequence, ETags, and
   per-part checksums. The stored composite checksum must exactly equal
   SHA-256 over the concatenated binary part checksums, not merely have a valid
   shape. `HeadObject` must prove size,
   content type, SSE-KMS, the expected KMS key, upload-session metadata, stored
   composite SHA-256 checksum (including the exact part-count suffix), and
   object version. A small ranged read must match PDF or TIFF magic bytes. A
   `NoSuchUpload` retry never falls back to an unversioned latest object; safe
   recovery requires the future control plane to supply its durably pinned
   version/checksum.
4. A required server-side source inspector derives the page count from that
   exact versioned PDF/TIFF independently of Textract. Invalid/unavailable
   counts stop before Textract. The optional browser-declared count remains
   untrusted and disagreement later forces review. Only after those checks does
   the coordinator call
   `StartDocumentTextDetection` with the exact versioned S3 object, encrypted
   Textract output, an opaque UUID `JobTag`, and a deterministic
   `ClientRequestToken`. Identical retries return the same job; an idempotency
   parameter mismatch is terminal and reviewed.
5. Textract publishes completion to an encrypted same-region SNS topic. A raw
   SNS subscription delivers the strict Textract JSON notification to an
   encrypted SQS queue. Lambda uses partial-batch failure semantics and never
   polls Textract before a completion notification.
6. On `SUCCEEDED`, the worker calls `GetDocumentTextDetection` until `NextToken`
   is absent, rejecting repeated tokens and more than the bounded number of
   result pages. `FAILED`, `ERROR`, `IN_PROGRESS`, `PARTIAL_SUCCESS`, warnings,
   inconsistent metadata, or malformed responses cannot produce a triageable
   manifest.
7. A pure assembler requires exactly one `PAGE` block for every ordinal
   `1..DocumentMetadata.Pages`. Duplicate, missing, out-of-range, or inconsistent
   ordinals fail extraction. `LINE` blocks are collected in service order for
   their declared page. Every page is preserved.
8. A legitimate page with no readable line text is emitted as zero-text
   `blank_or_unreadable`, sets coverage/data quality to incomplete, and forces
   human review. A readable page below the existing conservative 0.50 OCR
   confidence floor also makes data quality incomplete and forces review. A
   packet with every page blank/unreadable fails extraction.
9. After `StartDocumentTextDetection`, the coordinator conditionally writes a
   text-free S3 job binding containing only opaque identifiers and verified
   source provenance plus the trusted source-page count. This prevents
   accidental cross-job assembly but is not an
   authorization boundary; a missing binding makes SQS retry. The worker writes
   one immutable, SSE-KMS result manifest to `validated/{uuid}/pages.json` only
   when triageable; review-required page manifests go to
   `review/{uuid}/pages.json`. Both use conditional create semantics. Duplicate
   SNS/SQS delivery returns the already-written result only when its provenance
   matches; a conflict stays failed/retryable and ultimately reaches the DLQ,
   never automated triage.

## Contracts and invariants

### Upload request

The control plane supplies only:

- an application-generated ingestion UUID and upload-session UUID;
- `application/pdf`, `image/tiff`, or `image/tif`;
- an exact declared size from 1 through 500,000,000 bytes;
- an optional declared page count from 1 through 3,000;
- exactly one base64 SHA-256 checksum per server-planned 8 MiB part;
- the configured source bucket and KMS key through server-side configuration.

The client never chooses the bucket, object key, encryption, part numbers,
checksum algorithm, result location, SNS topic, Textract role, or KMS key.

### Completion notification

The parser accepts the documented raw Textract shape only: `JobId`, `Status`,
`API`, `JobTag`, `Timestamp`, and `DocumentLocation` containing only
`S3Bucket`/`S3ObjectName`. Unknown fields, wrapper envelopes, clinical text,
non-opaque tags/keys, wrong API, non-UUID tags, or invalid statuses fail closed.
The SQS queue policy allows publication only from the configured SNS topic and
requires TLS.

### OCR manifest

The immutable manifest contains:

- a schema version and opaque ingestion UUID;
- exact source bucket/key/version/size/part-count/composite-checksum/content
  type provenance;
- Textract job ID, API, and exact page count reconciled to the trusted source
  count;
- one ordered page entry per ordinal with `text`, extraction method, minimum
  normalized line confidence, status, block count, and a page SHA-256;
- `coverage_status`, `data_quality_status`, `human_review_required`, and reason
  codes;
- a deterministic packet text digest and manifest digest.

No downstream caller may convert a manifest to long-packet source pages when
`human_review_required` is true or coverage/data quality is not complete.
Conversion also revalidates the exact schema, page ordinals/statuses, page text
digests, packet digest, provenance, review-reason consistency, and manifest
digest; callers cannot safely cast parsed JSON to the TypeScript type.

## Failure behavior

- Validation failures expose a stable non-clinical error code, never AWS error
  detail, object contents, names, OCR text, or referral metadata.
- Invalid SQS messages are retried and eventually retained in a DLQ; they are
  not acknowledged as success.
- SNS delivery has its own encrypted 14-day DLQ; completion/work DLQs and queue
  age are alarmed. Alarm-topic subscription and runbook ownership remain a
  deployment gate.
- Service failures remain retryable. Proven terminal document failures produce
  a human-review outcome only after the future durable control-plane record can
  persist that state.
- Incomplete multipart uploads are aborted by lifecycle policy. Quarantine and
  result retention are explicit parameters; no object is public.
- Neither Textract success nor OCR confidence is a clinical-safety decision.
  OCR output still passes through complete-source emergency screening and the
  neurology triage safety architecture.

## Security and privacy controls

- Dedicated versioned S3 bucket, BucketOwnerEnforced ownership, all four public
  access blocks, TLS-only bucket policy, SSE-KMS by default, and lifecycle
  cleanup for incomplete uploads.
- Presigned URLs expire quickly and authorize one exact bucket/key/upload/part
  plus checksum header; they are bearer credentials and are never logged.
- Encrypted SNS, SQS, DLQ, Textract output, and Lambda environment; least-
  privilege IAM; confused-deputy conditions on the Textract publish role.
- The runtime emits no application payload logs. Future metrics may include only
  opaque ingestion UUID, disposition code, and timing/count values. Never log
  queue bodies, bucket/key, original filename, AWS response, OCR text, or
  presigned URLs.
- The result manifest contains clinical text and remains encrypted PHI. This
  code is PHI-capable even though tests and fixtures are synthetic.

## Deployment gate left intentionally open

S3 alone is not an authorization database. Before production integration, add
an atomic control-plane record keyed by ingestion UUID and bound to tenant,
authorized uploader, upload-session/upload ID, part-checksum plan, source object
version/checksum, independently derived source-page count, lifecycle state,
Textract job ID, and immutable result digest.
Every initiate, complete, status, result, retry, and human-review operation must
re-check that binding. Also add explicit
malware/content-disarm policy, operational runbooks, quota alarms, retention
approval, synthetic load tests, and clinician validation of low-quality scans.
The single 900-second completion Lambda must be load-tested at high block
density; production must fan out encrypted Textract S3 output processing if it
cannot prove complete 3,000-page coverage within bounded execution.
The injected version-pinned PDF/TIFF page inspector is intentionally an
unimplemented production integration: without it, completion fails closed.
Production also needs rolling authenticated re-presign/resume for slow uploads,
S3 OutputConfig recovery before Textract's seven-day Get-result expiry, and a
second OCR/vision or human gate calibrated for faint, handwritten, rotated, and
multi-column red-flag text that one confidence score cannot prove was not
omitted.

## Official AWS references

- [Asynchronous Textract operations](https://docs.aws.amazon.com/textract/latest/dg/api-async.html)
- [Textract asynchronous roles and required SNS topic naming](https://docs.aws.amazon.com/textract/latest/dg/api-async-roles.html)
- [StartDocumentTextDetection API](https://docs.aws.amazon.com/textract/latest/APIReference/API_StartDocumentTextDetection.html)
- [GetDocumentTextDetection API](https://docs.aws.amazon.com/textract/latest/APIReference/API_GetDocumentTextDetection.html)
- [Textract page blocks](https://docs.aws.amazon.com/textract/latest/dg/how-it-works-pages.html)
- [Textract bulk PDF/TIFF limits](https://docs.aws.amazon.com/textract/latest/dg/bulk-uploader-best-practices.html#bulk-uploader-best-practices-limits)
- [S3 multipart limits](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html)
- [S3 multipart upload and checksums](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)
- [S3 upload-integrity checks](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html)
- [SNS raw message delivery](https://docs.aws.amazon.com/sns/latest/dg/sns-large-payload-raw-message-delivery.html)

## Non-goals for this slice

No shared upload route, UI, database migration, tenant/auth integration,
patient-facing historian integration, malware scanner, production deploy, AWS
mutation, commit, or push is included. The foundation and SAM template are
code-only and tested without live document or PHI access.
