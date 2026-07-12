# Core Neurology Referral Triage Design

**Status:** Approved by scope owner for implementation planning  
**Date:** 2026-07-11  
**Scope owner:** Neurology referral-triage application only

## Goal

Turn one neurology referral case—submitted as free text or a clinical document
packet—into a clinician-reviewable recommendation that answers five questions:

1. Is immediate emergency or same-day action required?
2. What is the maximum safe delay and urgency tier?
3. Which neurology service is the best fit, or should the referral be redirected?
4. What bounded actions and precautions are appropriate while the patient waits?
5. What information is missing or conflicting, who should provide it, and must
   scheduling remain blocked?

The system is clinical decision support. It does not autonomously diagnose,
prescribe, schedule, or send patient guidance.

## Explicit non-goals

This project does not include general outpatient EHR hardening, wearable/RPM
workflows, Twilio follow-up, provider messaging, broad visit/medication/allergy
CRUD, command-center redesign, or unrelated demo administration. Findings in
those areas remain documented but do not block core triage development unless a
specific dependency is required for the referral flow.

## Approaches considered

### A. One canonical referral pipeline — recommended

Every input becomes one immutable, tenant-bound referral case with a page/source
manifest. A deterministic safety screen runs over the complete source before
asynchronous model work. Native text, OCR, short notes, and long packets then
converge on the same evidence, decision, recommendation, clarification, and
clinician-finalization contracts.

This requires more deliberate ingestion and persistence work, but it prevents
paste/PDF behavior drift, silent page loss, and incompatible result screens.

### B. Keep separate paste, upload, batch, and scanned workflows

This is superficially faster but is the current source of inconsistent safety:
PDFs use a reduced batch result, multiple files are ambiguous, and scanned
documents have no durable case. This approach is rejected.

### C. Send every document directly to one large model

This is simpler to demonstrate but cannot prove page coverage, makes failures
and costs hard to control, and allows one model error to affect emergency,
routing, and guidance simultaneously. This approach is rejected.

## Canonical data flow

```text
Referral case
  -> authorized intake record and immutable source
  -> page manifest with raw-file and canonical-text hashes
  -> complete-source deterministic emergency screen
  -> durable extraction/OCR and page-grounded clinical evidence
  -> independent safety and outpatient-scoring branches
  -> deterministic fusion and sparse disagreement adjudication
  -> governed service, workup, interim-guidance, and clarification policies
  -> one versioned recommendation snapshot
  -> clinician review/edit/attestation
  -> scheduling release, clarification workflow, or emergency action
```

No browser request owns the lifetime of clinical processing. Every asynchronous
step is durable, idempotent, retryable, and recoverable by referral-case ID.

## Input and document semantics

The immediate production milestone accepts exactly one referral case at a time:

- pasted free text; or
- one PDF, DOCX, or TXT file representing the referral packet.

The UI must not silently truncate text. Inputs above the verified limit remain
visible and enter manual review. Upload controls must not imply that several
unrelated patient files can be combined automatically.

A later bounded milestone may accept multiple documents only after the user
explicitly declares they belong to the same patient/referral. Each document
receives its own identity, order, page count, and hash before packet fusion.
Batch triage of different patients is a separate workflow and is not part of
this design.

Native and scanned documents use the same intake record. Parse/OCR failure,
encrypted/corrupt files, unsupported type, blank or unreadable pages, uncertain
page counts, and low OCR confidence create durable human-review states; they do
not disappear as transient browser errors.

## Evidence contract

Every clinically material extracted fact records:

- document and page identity;
- exact source span or quote;
- assertion state: present, negated, uncertain, or historical;
- temporality and experiencer;
- extraction method and confidence;
- model/parser/prompt version.

The system separately records conflicts, critical unknowns, missing pages, and
unreadable pages. Narrative summaries are views of the evidence graph, not the
authoritative clinical input. Urgency, service, workup, and guidance must consume
the validated structured evidence package so a fact omitted from a narrative
cannot disappear from decision-making.

Clinician corrections must be persisted as versioned, actor-attributed evidence
revisions. A caller-supplied edited summary is never accepted as authoritative
without that review record.

## Urgency and care-setting decision

The deterministic emergency gateway remains first and non-downgradable. The
independent safety model and outpatient scorer run in parallel against the
complete validated evidence. Disagreement, branch failure, conflicting data,
or critical missingness creates a hold and human review. A sparse adjudicator
may escalate but may not weaken a deterministic or independent safety floor.

Urgency is expressed in two orthogonal fields:

- care setting/pathway: emergency now, same-day clinical review, expedited
  outpatient, routine outpatient, redirect, or undetermined;
- outpatient priority tier when an outpatient pathway is valid.

Display language must never describe a same-day pathway as “within one week.”

## Versioned recommendation contract

One strict runtime schema contains:

- care pathway and maximum safe delay;
- outpatient priority when applicable;
- primary service plus acceptable alternate services;
- redirect destination and whether neurology remains concurrently appropriate;
- provider workup/actions;
- patient/caregiver interim guidance;
- case-specific emergency precautions;
- structured clarification questions and intended respondent;
- data quality, page coverage, confidence, evidence references, and required
  human-review state.

Service values come from a versioned, site-configured catalog. Models cannot
invent arbitrary service names. Dual routing is allowed when clinically valid.

## Workup and interim-guidance policy

Workup and “what to do while waiting” are separate.

The model may propose typed action or protocol codes, but deterministic policy
decides what can be displayed. Every actionable item requires source evidence or
an approved versioned protocol and remains clinician-reviewable.

Hard rules include:

- emergency now suppresses ordinary outpatient/pre-visit workup; emergency
  action is visually and operationally first;
- same-day action cannot be represented as routine scheduling;
- insufficient/conflicting data prioritizes clarification, not mandatory tests;
- no autonomous medication start, stop, or dose change;
- no recommendation may delay a more urgent care pathway;
- contrast, MRI, lumbar puncture, and similar recommendations require relevant
  safety prerequisites or explicitly identify those prerequisites as unknown;
- already-completed tests are not recommended as duplicates;
- patient-facing language is generated from governed templates, not unrestricted
  free text.

The current rule forcing two or three workup orders for every referral is
removed.

## Clarification and AI Historian

Critical unknowns, conflicts, and clinically necessary missing information
become structured draft questions targeted to one of:

- referring provider;
- patient/caregiver;
- records retrieval;
- human triage reviewer.

A clinician approves questions before delivery. Answers retain provenance and
are verified before a versioned retriage. Scheduling stays locked while critical
questions remain unresolved.

The AI Historian may collect approved, non-emergency patient clarification for
stable outpatient cases. It does not delay or replace emergency or same-day
human action.

## Clinician review and finalization

The clinician reviews one complete snapshot—not only tier and pathway. The
attestation binds:

- urgency and maximum safe delay;
- service/redirect;
- approved provider actions/workup;
- approved interim guidance and emergency precautions;
- clarification plan;
- underlying evidence version.

Structured edits create a new snapshot and audit event. Safety-floor downgrades
require an explicit governed exception with rationale and elevated review;
ordinary routing and over-triage corrections remain possible. Scheduling is
released only after all required fields and safety holds are resolved.

## User experience

Paste and PDF converge on the same progress, evidence-review, safety, result,
clarification, and finalization screens. A PDF never ends in a reduced “batch”
result simply because it was uploaded.

The result prioritizes:

1. emergency/same-day action;
2. missing/conflicting information and holds;
3. urgency and maximum safe delay;
4. service routing;
5. clinician-reviewed provider actions and patient precautions;
6. evidence and model details.

Failures persist in a work queue with clear reason, next action, retry state,
and manual-review ownership.

## Validation and authorization to use clinically

Release validation invokes the exact production pipeline, not the legacy
single-model scorer. It contains:

- immutable deterministic/adversarial regression cases;
- neurologist-adjudicated emergency and prevalence cohorts;
- service, redirect, guidance, workup, and clarification gold labels;
- native, scanned, degraded, mixed, and long PDF strata;
- “detect or hold” page-coverage testing;
- subgroup, site, note-length, and OCR-quality reporting;
- latency, cost, retry, timeout, hold, and human-review-capacity metrics;
- prospective silent-mode evaluation before clinical use.

All safety gates are conjunctive. Strong emergency sensitivity cannot compensate
for unsafe guidance, wrong service, silent document loss, or failed workflow.
The tool remains not clinically authorized until the governed validation and
local clinical sign-off are complete.

## Delivery order

1. Canonical one-case text/native-PDF workflow and durable case state.
2. Authoritative structured evidence and clinician-persisted corrections.
3. Strict service/guidance/workup/clarification schema and policy.
4. Full clinician snapshot finalization and scheduling rules.
5. Scanned-PDF control plane and OCR review.
6. Explicit same-patient multi-document packets.
7. Exact-production end-to-end validation and silent mode.
8. Minimal AWS deployment plan with explicit approval before any live change.

## Acceptance criteria for the first milestone

- A red flag at the end of a long pasted referral or final PDF page is preserved
  and cannot be downgraded by downstream models.
- One native-text PDF and the same text pasted manually produce the same
  care-pathway and full result workflow, allowing only documented extraction
  differences.
- No page, parse failure, low-confidence extraction, or asynchronous job can
  disappear silently.
- Every result has a durable case ID, page/source coverage state, and resumable
  status.
- Emergency results suppress outpatient workup and expose the closed-loop
  emergency action.
- Clinicians cannot release scheduling from an incomplete or conflicting
  recommendation snapshot.
- No AWS resource, migration, or deployment is changed without a separately
  reviewed change set and explicit user approval.
